use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::{Uuid, Version};

pub const DRAFT_FORMAT_VERSION: u32 = 4;
const PREVIOUS_DRAFT_FORMAT_VERSION: u32 = 3;
const V2_DRAFT_FORMAT_VERSION: u32 = 2;
const LEGACY_DRAFT_FORMAT_VERSION: u32 = 1;
const MAX_BODY_BYTES: usize = 1_000_000;
const MAX_DRAFT_BYTES: u64 = (MAX_BODY_BYTES as u64 * 2) + (256 * 1024);
const MAX_CONTENT_TYPE_CHARS: usize = 100;
const MAX_STABLE_ID_CHARS: usize = 200;
const MAX_TITLE_CHARS: usize = 500;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub format_version: u32,
    pub draft_id: String,
    pub record_draft: Value,
    pub body_zh: String,
    pub body_en: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parked_english_locale: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviousDraftV3 {
    format_version: u32,
    draft_id: String,
    record_draft: Value,
    body_zh: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviousDraftV2 {
    format_version: u32,
    draft_id: String,
    record_draft: Value,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LegacyDraftV1 {
    pub format_version: u32,
    pub draft_id: String,
    pub content_type: String,
    pub stable_id: String,
    pub title_zh: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(untagged)]
pub enum StoredDraft {
    Current(Draft),
    Legacy(LegacyDraftV1),
}

impl StoredDraft {
    fn draft_id(&self) -> &str {
        match self {
            Self::Current(draft) => &draft.draft_id,
            Self::Legacy(draft) => &draft.draft_id,
        }
    }

    fn created_at(&self) -> &str {
        match self {
            Self::Current(draft) => &draft.created_at,
            Self::Legacy(draft) => &draft.created_at,
        }
    }

    fn updated_at(&self) -> &str {
        match self {
            Self::Current(draft) => &draft.updated_at,
            Self::Legacy(draft) => &draft.updated_at,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDraftRequest {
    pub record_draft: Value,
    #[serde(default)]
    pub body_zh: String,
    #[serde(default)]
    pub body_en: String,
    #[serde(default)]
    pub parked_english_locale: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDraftRequest {
    pub draft_id: String,
    pub record_draft: Value,
    #[serde(default)]
    pub body_zh: String,
    #[serde(default)]
    pub body_en: String,
    #[serde(default)]
    pub parked_english_locale: Option<Value>,
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
    #[error("corrupt draft was moved to quarantine")]
    CorruptDraftQuarantined,
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

    fn create(&self, request: CreateDraftRequest) -> StoreResult<Draft> {
        validate_record_draft(&request.record_draft)?;
        validate_body_zh(&request.body_zh)?;
        validate_body_en(&request.body_en)?;
        validate_parked_english_locale(&request.parked_english_locale)?;
        let _guard = self.lock()?;
        self.prepare_root()?;

        let now = current_timestamp()?;
        let draft = Draft {
            format_version: DRAFT_FORMAT_VERSION,
            draft_id: Uuid::new_v4().to_string(),
            record_draft: request.record_draft,
            body_zh: request.body_zh,
            body_en: request.body_en,
            parked_english_locale: request.parked_english_locale,
            created_at: now.clone(),
            updated_at: now,
        };
        self.write_atomically(&draft, true)?;
        Ok(draft)
    }

    fn list(&self) -> StoreResult<Vec<StoredDraft>> {
        let _guard = self.lock()?;
        self.prepare_root()?;

        self.list_unlocked()
    }

    fn list_unlocked(&self) -> StoreResult<Vec<StoredDraft>> {
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
            let id = match parse_draft_id(stem) {
                Ok(id) => id,
                Err(_) => {
                    self.quarantine_unlocked(&path)?;
                    continue;
                }
            };
            match self.read_unlocked(id) {
                Ok(draft) => drafts.push(draft),
                Err(error) if error.is_corrupt_data() => {
                    self.quarantine_unlocked(&path)?;
                }
                Err(error) => return Err(error),
            }
        }

        drafts.sort_by(|left, right| {
            right
                .updated_at()
                .cmp(left.updated_at())
                .then_with(|| left.draft_id().cmp(right.draft_id()))
        });
        Ok(drafts)
    }

    fn open(&self, draft_id: &str) -> StoreResult<StoredDraft> {
        let _guard = self.lock()?;
        self.prepare_root()?;
        self.read_or_quarantine_unlocked(parse_draft_id(draft_id)?)
    }

    fn save(&self, request: SaveDraftRequest) -> StoreResult<Draft> {
        validate_record_draft(&request.record_draft)?;
        validate_body_zh(&request.body_zh)?;
        validate_body_en(&request.body_en)?;
        validate_parked_english_locale(&request.parked_english_locale)?;

        let _guard = self.lock()?;
        self.prepare_root()?;
        let id = parse_draft_id(&request.draft_id)?;
        let current = self.read_or_quarantine_unlocked(id)?;
        let replacement = Draft {
            format_version: DRAFT_FORMAT_VERSION,
            draft_id: current.draft_id().to_owned(),
            record_draft: request.record_draft,
            body_zh: request.body_zh,
            body_en: request.body_en,
            parked_english_locale: request.parked_english_locale,
            created_at: current.created_at().to_owned(),
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

    pub(crate) fn latest_for_recovery(&self) -> Result<Option<StoredDraft>, String> {
        let result = (|| -> StoreResult<Option<StoredDraft>> {
            let _guard = self.lock()?;
            self.prepare_root()?;
            Ok(self.list_unlocked()?.into_iter().next())
        })();
        result.map_err(command_error)
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

    fn read_unlocked(&self, expected_id: Uuid) -> StoreResult<StoredDraft> {
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
        let value: Value = serde_json::from_slice(&bytes)?;
        let draft = migrate_draft_value(value)?;
        validate_stored_draft(&draft, expected_id)?;
        Ok(draft)
    }

    fn read_or_quarantine_unlocked(&self, expected_id: Uuid) -> StoreResult<StoredDraft> {
        match self.read_unlocked(expected_id) {
            Ok(draft) => Ok(draft),
            Err(error) if error.is_corrupt_data() => {
                self.quarantine_unlocked(&self.path_for_id(expected_id))?;
                Err(DraftStoreError::CorruptDraftQuarantined)
            }
            Err(error) => Err(error),
        }
    }

    fn quarantine_unlocked(&self, source: &Path) -> StoreResult<()> {
        ensure_safe_regular_file(&self.root, source)?;
        let quarantine = self.prepare_quarantine()?;
        let target = quarantine.join(format!("{}.corrupt.json", Uuid::new_v4()));
        fs::rename(source, &target)?;
        sync_directory(&self.root)?;
        sync_directory(&quarantine)?;
        Ok(())
    }

    fn prepare_quarantine(&self) -> StoreResult<PathBuf> {
        let quarantine = self.root.join("quarantine");
        fs::create_dir_all(&quarantine)?;
        let metadata = fs::symlink_metadata(&quarantine)?;
        if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
            return Err(DraftStoreError::UnsafePath);
        }

        let canonical_root = fs::canonicalize(&self.root)?;
        let canonical_quarantine = fs::canonicalize(&quarantine)?;
        if canonical_quarantine.parent() != Some(canonical_root.as_path()) {
            return Err(DraftStoreError::UnsafePath);
        }
        Ok(quarantine)
    }

    fn write_atomically(&self, draft: &Draft, create_new: bool) -> StoreResult<()> {
        validate_current_draft(draft, parse_draft_id(&draft.draft_id)?)?;
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

impl DraftStoreError {
    fn is_corrupt_data(&self) -> bool {
        matches!(
            self,
            Self::InvalidDraftId
                | Self::InvalidField(_)
                | Self::UnsupportedFormat
                | Self::InvalidData
                | Self::Json(_)
        )
    }
}

fn migrate_draft_value(value: Value) -> StoreResult<StoredDraft> {
    let version = value
        .get("formatVersion")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(DraftStoreError::InvalidData)?;

    match version {
        LEGACY_DRAFT_FORMAT_VERSION => Ok(StoredDraft::Legacy(serde_json::from_value(value)?)),
        PREVIOUS_DRAFT_FORMAT_VERSION => {
            let previous: PreviousDraftV3 = serde_json::from_value(value)?;
            Ok(StoredDraft::Current(Draft {
                format_version: DRAFT_FORMAT_VERSION,
                draft_id: previous.draft_id,
                record_draft: previous.record_draft,
                body_zh: previous.body_zh,
                body_en: String::new(),
                parked_english_locale: None,
                created_at: previous.created_at,
                updated_at: previous.updated_at,
            }))
        }
        V2_DRAFT_FORMAT_VERSION => {
            let previous: PreviousDraftV2 = serde_json::from_value(value)?;
            Ok(StoredDraft::Current(Draft {
                format_version: DRAFT_FORMAT_VERSION,
                draft_id: previous.draft_id,
                record_draft: previous.record_draft,
                body_zh: String::new(),
                body_en: String::new(),
                parked_english_locale: None,
                created_at: previous.created_at,
                updated_at: previous.updated_at,
            }))
        }
        DRAFT_FORMAT_VERSION => Ok(StoredDraft::Current(serde_json::from_value(value)?)),
        _ => Err(DraftStoreError::UnsupportedFormat),
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

fn validate_stored_draft(draft: &StoredDraft, expected_id: Uuid) -> StoreResult<()> {
    match draft {
        StoredDraft::Current(draft) => validate_current_draft(draft, expected_id),
        StoredDraft::Legacy(draft) => validate_legacy_draft(draft, expected_id),
    }
}

fn validate_current_draft(draft: &Draft, expected_id: Uuid) -> StoreResult<()> {
    if draft.format_version != DRAFT_FORMAT_VERSION {
        return Err(DraftStoreError::UnsupportedFormat);
    }
    if parse_draft_id(&draft.draft_id)? != expected_id {
        return Err(DraftStoreError::InvalidData);
    }
    validate_record_draft(&draft.record_draft)?;
    validate_body_zh(&draft.body_zh)?;
    validate_body_en(&draft.body_en)?;
    validate_parked_english_locale(&draft.parked_english_locale)?;

    validate_timestamps(&draft.created_at, &draft.updated_at)
}

fn validate_legacy_draft(draft: &LegacyDraftV1, expected_id: Uuid) -> StoreResult<()> {
    if draft.format_version != LEGACY_DRAFT_FORMAT_VERSION {
        return Err(DraftStoreError::UnsupportedFormat);
    }
    if parse_draft_id(&draft.draft_id)? != expected_id {
        return Err(DraftStoreError::InvalidData);
    }
    validate_field(&draft.content_type, MAX_CONTENT_TYPE_CHARS, "contentType")?;
    validate_field(&draft.stable_id, MAX_STABLE_ID_CHARS, "stableId")?;
    validate_field(&draft.title_zh, MAX_TITLE_CHARS, "titleZh")?;

    validate_timestamps(&draft.created_at, &draft.updated_at)
}

fn validate_record_draft(record_draft: &Value) -> StoreResult<()> {
    if !record_draft.is_object() {
        return Err(DraftStoreError::InvalidField("recordDraft"));
    }
    Ok(())
}

fn validate_body_zh(body_zh: &str) -> StoreResult<()> {
    validate_body(body_zh, "bodyZh")
}

fn validate_body_en(body_en: &str) -> StoreResult<()> {
    validate_body(body_en, "bodyEn")
}

fn validate_body(body: &str, field: &'static str) -> StoreResult<()> {
    if body.len() > MAX_BODY_BYTES
        || body.starts_with('\u{feff}')
        || body.chars().any(|character| {
            character == '\r' || character == '\t' || (character.is_control() && character != '\n')
        })
    {
        return Err(DraftStoreError::InvalidField(field));
    }
    Ok(())
}

fn validate_parked_english_locale(value: &Option<Value>) -> StoreResult<()> {
    if value.as_ref().is_some_and(|locale| !locale.is_object()) {
        return Err(DraftStoreError::InvalidField("parkedEnglishLocale"));
    }
    Ok(())
}

fn validate_timestamps(created_at: &str, updated_at: &str) -> StoreResult<()> {
    let created =
        OffsetDateTime::parse(created_at, &Rfc3339).map_err(|_| DraftStoreError::InvalidData)?;
    let updated =
        OffsetDateTime::parse(updated_at, &Rfc3339).map_err(|_| DraftStoreError::InvalidData)?;
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

pub(crate) fn verify_safe_regular_file(root: &Path, target: &Path) -> std::io::Result<()> {
    ensure_safe_regular_file(root, target)
        .map_err(|_| std::io::Error::other("file path is outside the approved directory"))
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
pub(crate) fn install_atomically(
    temporary: &Path,
    target: &Path,
    create_new: bool,
) -> std::io::Result<()> {
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
pub(crate) fn install_atomically(
    temporary: &Path,
    target: &Path,
    create_new: bool,
) -> std::io::Result<()> {
    if create_new {
        fs::hard_link(temporary, target)?;
        fs::remove_file(temporary)
    } else {
        fs::rename(temporary, target)
    }
}

#[cfg(windows)]
pub(crate) fn sync_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn sync_directory(path: &Path) -> std::io::Result<()> {
    File::open(path)?.sync_all()
}

fn command_error(error: DraftStoreError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn create_draft(
    store: tauri::State<'_, DraftStore>,
    draft: CreateDraftRequest,
) -> Result<Draft, String> {
    store.create(draft).map_err(command_error)
}

#[tauri::command]
pub fn list_drafts(store: tauri::State<'_, DraftStore>) -> Result<Vec<StoredDraft>, String> {
    store.list().map_err(command_error)
}

#[tauri::command]
pub fn open_draft(
    store: tauri::State<'_, DraftStore>,
    request: DraftIdRequest,
) -> Result<StoredDraft, String> {
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
        migrate_draft_value, validate_body_en, validate_body_zh, AtomicInstaller,
        CreateDraftRequest, DraftStore, DraftStoreError, SaveDraftRequest, StoredDraft,
        DRAFT_FORMAT_VERSION, LEGACY_DRAFT_FORMAT_VERSION, MAX_BODY_BYTES,
        PREVIOUS_DRAFT_FORMAT_VERSION, V2_DRAFT_FORMAT_VERSION,
    };
    use serde_json::json;
    use std::{fs, path::Path, sync::Arc};
    use tempfile::tempdir;

    fn record_draft(title: &str) -> serde_json::Value {
        json!({
            "schemaVersion": 1,
            "id": "fictional-draft",
            "type": "team-news",
            "locales": { "zh": { "title": title } }
        })
    }

    fn create_request() -> CreateDraftRequest {
        CreateDraftRequest {
            record_draft: record_draft("Fictional title"),
            body_zh: String::new(),
            body_en: String::new(),
            parked_english_locale: None,
        }
    }

    fn saved_fields(draft_id: String, title: &str) -> SaveDraftRequest {
        SaveDraftRequest {
            draft_id,
            record_draft: record_draft(title),
            body_zh: "## Fictional body\n".to_owned(),
            body_en: "## English body\n".to_owned(),
            parked_english_locale: Some(json!({
                "contentType": "team-news",
                "locale": { "state": "draft", "title": "English draft" }
            })),
        }
    }

    #[test]
    fn creates_saves_lists_opens_and_deletes_versioned_drafts() {
        let temporary = tempdir().expect("temporary directory");
        let store = DraftStore::new(temporary.path().join("drafts").join("v1"));

        let created = store.create(create_request()).expect("creates draft");
        assert_eq!(created.format_version, DRAFT_FORMAT_VERSION);
        assert_eq!(created.record_draft, record_draft("Fictional title"));
        assert!(created.body_zh.is_empty());
        assert!(created.body_en.is_empty());
        assert!(created.parked_english_locale.is_none());
        assert_eq!(
            store.list().expect("lists drafts"),
            vec![StoredDraft::Current(created.clone())]
        );
        assert_eq!(
            store.open(&created.draft_id).expect("opens draft"),
            StoredDraft::Current(created.clone())
        );

        let saved = store
            .save(saved_fields(created.draft_id.clone(), "Updated title"))
            .expect("saves draft");
        assert_eq!(saved.created_at, created.created_at);
        assert_eq!(saved.record_draft, record_draft("Updated title"));
        assert_eq!(saved.body_zh, "## Fictional body\n");
        assert_eq!(saved.body_en, "## English body\n");
        assert!(saved.parked_english_locale.is_some());
        assert_eq!(
            store.open(&created.draft_id).expect("opens saved draft"),
            StoredDraft::Current(saved)
        );

        store.delete(&created.draft_id).expect("deletes draft");
        assert!(matches!(
            store.open(&created.draft_id),
            Err(DraftStoreError::NotFound)
        ));
        assert!(store.list().expect("lists empty store").is_empty());
    }

    #[test]
    fn saves_and_reopens_an_incomplete_content_draft() {
        let temporary = tempdir().expect("temporary directory");
        let store = DraftStore::new(temporary.path().join("drafts").join("v1"));
        let record = json!({
            "schemaVersion": 1,
            "id": "minimal-draft",
            "type": "team-news",
            "authors": [],
            "locales": {
                "zh": { "state": "draft", "title": "" },
                "en": { "state": "missing" }
            }
        });
        let created = store
            .create(CreateDraftRequest {
                record_draft: record.clone(),
                body_zh: String::new(),
                body_en: String::new(),
                parked_english_locale: None,
            })
            .expect("creates incomplete draft");

        let saved = store
            .save(SaveDraftRequest {
                draft_id: created.draft_id.clone(),
                record_draft: record,
                body_zh: String::new(),
                body_en: String::new(),
                parked_english_locale: None,
            })
            .expect("saves incomplete draft");

        assert!(saved.body_zh.is_empty());
        assert!(saved.body_en.is_empty());
        assert_eq!(
            store
                .open(&created.draft_id)
                .expect("reopens incomplete draft"),
            StoredDraft::Current(saved)
        );
    }

    #[test]
    fn validates_bilingual_body_storage_boundaries() {
        assert!(validate_body_zh("## Fictional body\n").is_ok());
        assert!(validate_body_en("## English body\n").is_ok());
        assert!(validate_body_zh(&"a".repeat(MAX_BODY_BYTES)).is_ok());

        for invalid in ["\u{feff}body", "body\ttext", "body\r\n", "body\0text"] {
            assert!(matches!(
                validate_body_zh(invalid),
                Err(DraftStoreError::InvalidField("bodyZh"))
            ));
        }
        assert!(matches!(
            validate_body_zh(&"a".repeat(MAX_BODY_BYTES + 1)),
            Err(DraftStoreError::InvalidField("bodyZh"))
        ));
        assert!(matches!(
            validate_body_en("body\ttext"),
            Err(DraftStoreError::InvalidField("bodyEn"))
        ));
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
        let created = store.create(create_request()).expect("creates draft");
        let target = root.join(format!("{}.json", created.draft_id));
        let original = fs::read(&target).expect("reads original");

        let failing = DraftStore::with_installer(root.clone(), Arc::new(FailingInstaller));
        assert!(failing
            .save(saved_fields(created.draft_id.clone(), "Updated title"))
            .is_err());
        assert_eq!(fs::read(target).expect("reads preserved draft"), original);
        assert_eq!(
            fs::read_dir(root).expect("reads draft directory").count(),
            1,
            "operation temporary file was removed"
        );
    }

    #[test]
    fn format_migration_hook_accepts_legacy_and_current_but_rejects_future_versions() {
        let draft_id = "11111111-1111-4111-8111-111111111111";
        let current = json!({
            "formatVersion": DRAFT_FORMAT_VERSION,
            "draftId": draft_id,
            "recordDraft": record_draft("Current"),
            "bodyZh": "## Current body\n",
            "bodyEn": "## English body\n",
            "createdAt": "2026-07-23T08:00:00Z",
            "updatedAt": "2026-07-23T08:00:00Z"
        });
        assert!(matches!(
            migrate_draft_value(current).expect("accepts current version"),
            StoredDraft::Current(_)
        ));

        let previous = json!({
            "formatVersion": PREVIOUS_DRAFT_FORMAT_VERSION,
            "draftId": draft_id,
            "recordDraft": record_draft("Previous"),
            "bodyZh": "## Previous body\n",
            "createdAt": "2026-07-23T08:00:00Z",
            "updatedAt": "2026-07-23T08:00:00Z"
        });
        let migrated = migrate_draft_value(previous).expect("accepts previous version");
        assert!(matches!(
            migrated,
            StoredDraft::Current(ref draft)
                if draft.format_version == DRAFT_FORMAT_VERSION
                    && draft.body_zh == "## Previous body\n"
                    && draft.body_en.is_empty()
        ));

        let version_two = json!({
            "formatVersion": V2_DRAFT_FORMAT_VERSION,
            "draftId": draft_id,
            "recordDraft": record_draft("Version two"),
            "createdAt": "2026-07-23T08:00:00Z",
            "updatedAt": "2026-07-23T08:00:00Z"
        });
        assert!(matches!(
            migrate_draft_value(version_two).expect("accepts version two"),
            StoredDraft::Current(ref draft)
                if draft.body_zh.is_empty() && draft.body_en.is_empty()
        ));

        let legacy = json!({
            "formatVersion": LEGACY_DRAFT_FORMAT_VERSION,
            "draftId": draft_id,
            "contentType": "team-news",
            "stableId": "fictional-draft",
            "titleZh": "Legacy",
            "createdAt": "2026-07-23T08:00:00Z",
            "updatedAt": "2026-07-23T08:00:00Z"
        });
        assert!(matches!(
            migrate_draft_value(legacy).expect("accepts legacy version"),
            StoredDraft::Legacy(_)
        ));

        assert!(matches!(
            migrate_draft_value(json!({ "formatVersion": DRAFT_FORMAT_VERSION + 1 })),
            Err(DraftStoreError::UnsupportedFormat)
        ));
    }

    #[test]
    fn reads_legacy_draft_and_upgrades_it_on_the_next_save() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        fs::create_dir_all(&root).expect("creates draft directory");
        let draft_id = "11111111-1111-4111-8111-111111111111";
        let path = root.join(format!("{draft_id}.json"));
        fs::write(
            &path,
            serde_json::to_vec_pretty(&json!({
                "formatVersion": LEGACY_DRAFT_FORMAT_VERSION,
                "draftId": draft_id,
                "contentType": "team-news",
                "stableId": "fictional-draft",
                "titleZh": "Legacy",
                "createdAt": "2026-07-23T08:00:00Z",
                "updatedAt": "2026-07-23T08:00:00Z"
            }))
            .expect("serializes legacy draft"),
        )
        .expect("writes legacy draft");
        let store = DraftStore::new(root);

        assert!(matches!(
            store.open(draft_id).expect("opens legacy draft"),
            StoredDraft::Legacy(_)
        ));
        let saved = store
            .save(saved_fields(draft_id.to_owned(), "Migrated"))
            .expect("saves migrated draft");
        assert_eq!(saved.format_version, DRAFT_FORMAT_VERSION);
        assert_eq!(saved.created_at, "2026-07-23T08:00:00Z");
        assert_eq!(saved.record_draft, record_draft("Migrated"));
        assert_eq!(saved.body_zh, "## Fictional body\n");
        assert_eq!(saved.body_en, "## English body\n");
        assert!(matches!(
            store.open(draft_id).expect("opens migrated draft"),
            StoredDraft::Current(_)
        ));
    }

    #[test]
    fn quarantines_corrupt_json_without_touching_valid_drafts() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        let store = DraftStore::new(root.clone());
        let damaged = store
            .create(create_request())
            .expect("creates damaged draft");
        let valid = store.create(create_request()).expect("creates valid draft");
        let damaged_path = root.join(format!("{}.json", damaged.draft_id));
        let valid_path = root.join(format!("{}.json", valid.draft_id));
        let valid_bytes = fs::read(&valid_path).expect("reads valid draft");

        fs::write(&damaged_path, b"{ not valid JSON").expect("damages draft JSON");
        assert_eq!(
            store.list().expect("lists remaining drafts"),
            vec![StoredDraft::Current(valid)]
        );
        assert!(!damaged_path.exists());
        assert_eq!(
            fs::read(valid_path).expect("reads untouched valid draft"),
            valid_bytes
        );
        assert_eq!(
            fs::read_dir(root.join("quarantine"))
                .expect("reads quarantine")
                .count(),
            1
        );
    }

    #[test]
    fn opening_an_unsupported_draft_quarantines_it_instead_of_replacing_it() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("drafts").join("v1");
        let store = DraftStore::new(root.clone());
        let created = store.create(create_request()).expect("creates draft");
        let target = root.join(format!("{}.json", created.draft_id));
        let unsupported = fs::read_to_string(&target)
            .expect("reads draft JSON")
            .replace(
                &format!("\"formatVersion\": {DRAFT_FORMAT_VERSION}"),
                &format!("\"formatVersion\": {}", DRAFT_FORMAT_VERSION + 1),
            );
        fs::write(&target, unsupported).expect("writes unsupported draft");

        assert!(matches!(
            store.open(&created.draft_id),
            Err(DraftStoreError::CorruptDraftQuarantined)
        ));
        assert!(!target.exists());
        assert_eq!(
            fs::read_dir(root.join("quarantine"))
                .expect("reads quarantine")
                .count(),
            1
        );
    }
}
