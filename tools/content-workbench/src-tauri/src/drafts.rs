use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::{Uuid, Version};

pub const DRAFT_FORMAT_VERSION: u32 = 1;
const MAX_DRAFT_BYTES: u64 = 64 * 1024;
const MAX_CONTENT_TYPE_CHARS: usize = 100;
const MAX_STABLE_ID_CHARS: usize = 200;
const MAX_TITLE_CHARS: usize = 500;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub format_version: u32,
    pub draft_id: String,
    pub content_type: String,
    pub stable_id: String,
    pub title_zh: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDraftRequest {
    pub draft_id: String,
    pub content_type: String,
    pub stable_id: String,
    pub title_zh: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftIdRequest {
    pub draft_id: String,
}

#[derive(Debug, Error)]
enum DraftStoreError {
    #[error("draft id must be a canonical UUID v4")]
    InvalidDraftId,
    #[error("draft field is invalid: {0}")]
    InvalidField(&'static str),
    #[error("draft format version is not supported")]
    UnsupportedFormat,
    #[error("draft data is invalid")]
    InvalidData,
    #[error("draft was not found")]
    NotFound,
    #[error("draft storage path is not safe")]
    UnsafePath,
    #[error("draft storage is busy")]
    LockFailed,
    #[error("draft storage operation failed: {0}")]
    Storage(#[from] std::io::Error),
    #[error("draft JSON operation failed: {0}")]
    Json(#[from] serde_json::Error),
}

type StoreResult<T> = Result<T, DraftStoreError>;

trait AtomicInstaller: Send + Sync {
    fn install(&self, temporary: &Path, target: &Path, create_new: bool) -> std::io::Result<()>;
}

#[derive(Default)]
struct PlatformAtomicInstaller;

impl AtomicInstaller for PlatformAtomicInstaller {
    fn install(&self, temporary: &Path, target: &Path, create_new: bool) -> std::io::Result<()> {
        install_atomically(temporary, target, create_new)
    }
}

pub struct DraftStore {
    root: PathBuf,
    installer: Arc<dyn AtomicInstaller>,
    operation_lock: Mutex<()>,
}

impl DraftStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            installer: Arc::new(PlatformAtomicInstaller),
            operation_lock: Mutex::new(()),
        }
    }

    #[cfg(test)]
    fn with_installer(root: PathBuf, installer: Arc<dyn AtomicInstaller>) -> Self {
        Self {
            root,
            installer,
            operation_lock: Mutex::new(()),
        }
    }

    fn create(&self) -> StoreResult<Draft> {
        let _guard = self.lock()?;
        self.prepare_root()?;

        let now = current_timestamp()?;
        let draft = Draft {
            format_version: DRAFT_FORMAT_VERSION,
            draft_id: Uuid::new_v4().to_string(),
            content_type: String::new(),
            stable_id: String::new(),
            title_zh: String::new(),
            created_at: now.clone(),
            updated_at: now,
        };
        self.write_atomically(&draft, true)?;
        Ok(draft)
    }

    fn list(&self) -> StoreResult<Vec<Draft>> {
        let _guard = self.lock()?;
        self.prepare_root()?;

        let mut drafts = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Ok(id) = parse_draft_id(stem) else {
                continue;
            };
            drafts.push(self.read_unlocked(id)?);
        }

        drafts.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| left.draft_id.cmp(&right.draft_id))
        });
        Ok(drafts)
    }

    fn open(&self, draft_id: &str) -> StoreResult<Draft> {
        let _guard = self.lock()?;
        self.prepare_root()?;
        self.read_unlocked(parse_draft_id(draft_id)?)
    }

    fn save(&self, request: SaveDraftRequest) -> StoreResult<Draft> {
        validate_field(&request.content_type, MAX_CONTENT_TYPE_CHARS, "contentType")?;
        validate_field(&request.stable_id, MAX_STABLE_ID_CHARS, "stableId")?;
        validate_field(&request.title_zh, MAX_TITLE_CHARS, "titleZh")?;

        let _guard = self.lock()?;
        self.prepare_root()?;
        let id = parse_draft_id(&request.draft_id)?;
        let current = self.read_unlocked(id)?;
        let replacement = Draft {
            format_version: DRAFT_FORMAT_VERSION,
            draft_id: current.draft_id,
            content_type: request.content_type,
            stable_id: request.stable_id,
            title_zh: request.title_zh,
            created_at: current.created_at,
            updated_at: current_timestamp()?,
        };
        self.write_atomically(&replacement, false)?;
        Ok(replacement)
    }

    fn delete(&self, draft_id: &str) -> StoreResult<()> {
        let _guard = self.lock()?;
        self.prepare_root()?;
        let target = self.path_for_id(parse_draft_id(draft_id)?);
        ensure_safe_regular_file(&self.root, &target)?;
        fs::remove_file(target)?;
        sync_directory(&self.root)?;
        Ok(())
    }

    fn lock(&self) -> StoreResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| DraftStoreError::LockFailed)
    }

    fn prepare_root(&self) -> StoreResult<()> {
        fs::create_dir_all(&self.root)?;
        let metadata = fs::symlink_metadata(&self.root)?;
        if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
            return Err(DraftStoreError::UnsafePath);
        }
        Ok(())
    }

    fn path_for_id(&self, id: Uuid) -> PathBuf {
        self.root.join(format!("{id}.json"))
    }

    fn read_unlocked(&self, expected_id: Uuid) -> StoreResult<Draft> {
        let target = self.path_for_id(expected_id);
        let metadata = match fs::symlink_metadata(&target) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(DraftStoreError::NotFound);
            }
            Err(error) => return Err(error.into()),
        };
        if metadata.len() > MAX_DRAFT_BYTES {
            return Err(DraftStoreError::InvalidData);
        }
        ensure_safe_regular_file(&self.root, &target)?;

        let file = File::open(target)?;
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.take(MAX_DRAFT_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_DRAFT_BYTES {
            return Err(DraftStoreError::InvalidData);
        }
        let draft: Draft = serde_json::from_slice(&bytes)?;
        validate_stored_draft(&draft, expected_id)?;
        Ok(draft)
    }

    fn write_atomically(&self, draft: &Draft, create_new: bool) -> StoreResult<()> {
        validate_stored_draft(draft, parse_draft_id(&draft.draft_id)?)?;
        let mut bytes = serde_json::to_vec_pretty(draft)?;
        bytes.push(b'\n');
        if bytes.len() as u64 > MAX_DRAFT_BYTES {
            return Err(DraftStoreError::InvalidData);
        }

        let target = self.path_for_id(parse_draft_id(&draft.draft_id)?);
        if !create_new {
            ensure_safe_regular_file(&self.root, &target)?;
        }
        let temporary = self
            .root
            .join(format!(".{}.{}.tmp", draft.draft_id, Uuid::new_v4()));

        let result = (|| -> StoreResult<()> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            self.installer.install(&temporary, &target, create_new)?;
            sync_directory(&self.root)?;
            Ok(())
        })();

        if result.is_err() {
            match fs::remove_file(&temporary) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => {}
            }
        }
        result
    }
}

fn parse_draft_id(value: &str) -> StoreResult<Uuid> {
    let id = Uuid::parse_str(value).map_err(|_| DraftStoreError::InvalidDraftId)?;
    if id.get_version() != Some(Version::Random) || id.to_string() != value {
        return Err(DraftStoreError::InvalidDraftId);
    }
    Ok(id)
}

fn validate_field(value: &str, max_chars: usize, field: &'static str) -> StoreResult<()> {
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(DraftStoreError::InvalidField(field));
    }
    Ok(())
}

fn validate_stored_draft(draft: &Draft, expected_id: Uuid) -> StoreResult<()> {
    if draft.format_version != DRAFT_FORMAT_VERSION {
        return Err(DraftStoreError::UnsupportedFormat);
    }
    if parse_draft_id(&draft.draft_id)? != expected_id {
        return Err(DraftStoreError::InvalidData);
    }
    validate_field(&draft.content_type, MAX_CONTENT_TYPE_CHARS, "contentType")?;
    validate_field(&draft.stable_id, MAX_STABLE_ID_CHARS, "stableId")?;
    validate_field(&draft.title_zh, MAX_TITLE_CHARS, "titleZh")?;

    let created = OffsetDateTime::parse(&draft.created_at, &Rfc3339)
        .map_err(|_| DraftStoreError::InvalidData)?;
    let updated = OffsetDateTime::parse(&draft.updated_at, &Rfc3339)
        .map_err(|_| DraftStoreError::InvalidData)?;
    if updated < created {
        return Err(DraftStoreError::InvalidData);
    }
    Ok(())
}

fn current_timestamp() -> StoreResult<String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|_| DraftStoreError::InvalidData)
}

fn ensure_safe_regular_file(root: &Path, target: &Path) -> StoreResult<()> {
    let metadata = match fs::symlink_metadata(target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(DraftStoreError::NotFound);
        }
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file() || is_link_or_reparse_point(&metadata) {
        return Err(DraftStoreError::UnsafePath);
    }

    let canonical_root = fs::canonicalize(root)?;
    let canonical_target = fs::canonicalize(target)?;
    if canonical_target.parent() != Some(canonical_root.as_path()) {
        return Err(DraftStoreError::UnsafePath);
    }
    Ok(())
}

#[cfg(windows)]
fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_type().is_symlink()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn install_atomically(temporary: &Path, target: &Path, create_new: bool) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, ReplaceFileW};

    let temporary_wide: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let succeeded = unsafe {
        if create_new {
            MoveFileExW(temporary_wide.as_ptr(), target_wide.as_ptr(), 0)
        } else {
            ReplaceFileW(
                target_wide.as_ptr(),
                temporary_wide.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        }
    };
    if succeeded == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn install_atomically(temporary: &Path, target: &Path, create_new: bool) -> std::io::Result<()> {
    if create_new {
        fs::hard_link(temporary, target)?;
        fs::remove_file(temporary)
    } else {
        fs::rename(temporary, target)
    }
}

#[cfg(windows)]
fn sync_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
fn sync_directory(path: &Path) -> std::io::Result<()> {
    File::open(path)?.sync_all()
}

fn command_error(error: DraftStoreError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn create_draft(store: tauri::State<'_, DraftStore>) -> Result<Draft, String> {
    store.create().map_err(command_error)
}

#[tauri::command]
pub fn list_drafts(store: tauri::State<'_, DraftStore>) -> Result<Vec<Draft>, String> {
    store.list().map_err(command_error)
}

#[tauri::command]
pub fn open_draft(
    store: tauri::State<'_, DraftStore>,
    request: DraftIdRequest,
) -> Result<Draft, String> {
    store.open(&request.draft_id).map_err(command_error)
}

#[tauri::command]
pub fn save_draft(
    store: tauri::State<'_, DraftStore>,
    draft: SaveDraftRequest,
) -> Result<Draft, String> {
    store.save(draft).map_err(command_error)
}

#[tauri::command]
pub fn delete_draft(
    store: tauri::State<'_, DraftStore>,
    request: DraftIdRequest,
) -> Result<(), String> {
    store.delete(&request.draft_id).map_err(command_error)
}

#[cfg(test)]
mod tests {
    use super::{
        AtomicInstaller, DraftStore, DraftStoreError, SaveDraftRequest, DRAFT_FORMAT_VERSION,
    };
    use std::{fs, path::Path, sync::Arc};
    use tempfile::tempdir;

    fn saved_fields(draft_id: String) -> SaveDraftRequest {
        SaveDraftRequest {
            draft_id,
            content_type: "placeholder-news".to_owned(),
            stable_id: "fictional-draft".to_owned(),
            title_zh: "Fictional title".to_owned(),
        }
    }

    #[test]
    fn creates_saves_lists_opens_and_deletes_versioned_drafts() {
        let temporary = tempdir().expect("temporary directory");
        let store = DraftStore::new(temporary.path().join("drafts").join("v1"));

        let created = store.create().expect("creates draft");
        assert_eq!(created.format_version, DRAFT_FORMAT_VERSION);
        assert!(created.content_type.is_empty());
        assert_eq!(store.list().expect("lists drafts"), vec![created.clone()]);
        assert_eq!(store.open(&created.draft_id).expect("opens draft"), created);

        let saved = store
            .save(saved_fields(created.draft_id.clone()))
            .expect("saves draft");
        assert_eq!(saved.created_at, created.created_at);
        assert_eq!(saved.content_type, "placeholder-news");
        assert_eq!(
            store.open(&created.draft_id).expect("opens saved draft"),
            saved
        );

        store.delete(&created.draft_id).expect("deletes draft");
        assert!(matches!(
            store.open(&created.draft_id),
            Err(DraftStoreError::NotFound)
        ));
        assert!(store.list().expect("lists empty store").is_empty());
    }

    #[test]
    fn rejects_traversal_and_noncanonical_ids_without_touching_other_files() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        let store = DraftStore::new(root);
        let outside = temporary.path().join("outside.json");
        fs::write(&outside, b"keep").expect("writes sentinel");

        for invalid in [
            "../outside",
            "..\\outside",
            "/absolute",
            "11111111-1111-1111-1111-111111111111",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.json",
        ] {
            assert!(matches!(
                store.open(invalid),
                Err(DraftStoreError::InvalidDraftId)
            ));
            assert!(matches!(
                store.delete(invalid),
                Err(DraftStoreError::InvalidDraftId)
            ));
        }

        assert_eq!(fs::read(outside).expect("reads sentinel"), b"keep");
    }

    struct FailingInstaller;

    impl AtomicInstaller for FailingInstaller {
        fn install(
            &self,
            _temporary: &Path,
            _target: &Path,
            _create_new: bool,
        ) -> std::io::Result<()> {
            Err(std::io::Error::other("injected replacement failure"))
        }
    }

    #[test]
    fn failed_atomic_replace_preserves_the_previous_draft() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        let store = DraftStore::new(root.clone());
        let created = store.create().expect("creates draft");
        let target = root.join(format!("{}.json", created.draft_id));
        let original = fs::read(&target).expect("reads original");

        let failing = DraftStore::with_installer(root.clone(), Arc::new(FailingInstaller));
        assert!(failing
            .save(saved_fields(created.draft_id.clone()))
            .is_err());
        assert_eq!(fs::read(target).expect("reads preserved draft"), original);
        assert_eq!(
            fs::read_dir(root).expect("reads draft directory").count(),
            1,
            "operation temporary file was removed"
        );
    }

    #[test]
    fn rejects_unknown_format_versions_and_extra_fields() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        let store = DraftStore::new(root.clone());
        let created = store.create().expect("creates draft");
        let target = root.join(format!("{}.json", created.draft_id));
        let original = fs::read_to_string(&target).expect("reads draft JSON");

        fs::write(
            &target,
            original.replace("\"formatVersion\": 1", "\"formatVersion\": 2"),
        )
        .expect("writes unsupported draft");
        assert!(matches!(
            store.open(&created.draft_id),
            Err(DraftStoreError::UnsupportedFormat)
        ));

        fs::write(&target, original.replace("\n}", ",\n  \"extra\": true\n}"))
            .expect("writes draft with an extra field");
        assert!(matches!(
            store.open(&created.draft_id),
            Err(DraftStoreError::Json(_))
        ));
    }
}
