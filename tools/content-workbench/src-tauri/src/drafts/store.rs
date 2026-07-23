use super::{
    migration::{decode_draft, parse_canonical_v4, parse_utc_timestamp},
    model::{
        CreateDraftRequest, DeleteDraftRequest, DeletedDraft, ListDraftsResponse, LoadDraftRequest,
        SaveDraftRequest, StoredDraftV1,
    },
};
use crate::{
    clock::{format_utc_rfc3339, Clock},
    error::{AppError, AppResult, DesktopIssue},
    paths::AppPaths,
    storage::{
        atomic_replace::{
            move_file_no_replace, write_json_atomically_in, AtomicReplacer, PlatformAtomicReplacer,
            ReplaceMode,
        },
        path_safety::{NoopPathSafetyHook, PathSafetyHook, SafeDirectory},
        read_bounded_file,
    },
    DRAFT_STORAGE_VERSION, MAX_DRAFT_BYTES, MAX_SAFE_REVISION,
};
use std::{
    ffi::OsStr,
    fs,
    path::Path,
    sync::{Arc, Mutex, MutexGuard},
};
use time::OffsetDateTime;
use uuid::Uuid;

pub struct DraftStore {
    paths: AppPaths,
    clock: Arc<dyn Clock>,
    replacer: Arc<dyn AtomicReplacer>,
    safety_hook: Arc<dyn PathSafetyHook>,
    operation_lock: Mutex<()>,
}

impl DraftStore {
    pub fn new(paths: AppPaths, clock: Arc<dyn Clock>) -> Self {
        Self::with_components(
            paths,
            clock,
            Arc::new(PlatformAtomicReplacer),
            Arc::new(NoopPathSafetyHook),
        )
    }

    pub fn with_replacer(
        paths: AppPaths,
        clock: Arc<dyn Clock>,
        replacer: Arc<dyn AtomicReplacer>,
    ) -> Self {
        Self::with_components(paths, clock, replacer, Arc::new(NoopPathSafetyHook))
    }

    pub fn with_safety_hook(
        paths: AppPaths,
        clock: Arc<dyn Clock>,
        safety_hook: Arc<dyn PathSafetyHook>,
    ) -> Self {
        Self::with_components(paths, clock, Arc::new(PlatformAtomicReplacer), safety_hook)
    }

    fn with_components(
        paths: AppPaths,
        clock: Arc<dyn Clock>,
        replacer: Arc<dyn AtomicReplacer>,
        safety_hook: Arc<dyn PathSafetyHook>,
    ) -> Self {
        Self {
            paths,
            clock,
            replacer,
            safety_hook,
            operation_lock: Mutex::new(()),
        }
    }

    pub fn create(&self, request: CreateDraftRequest) -> AppResult<StoredDraftV1> {
        let _guard = self.lock()?;
        let directory = self.drafts_directory()?;

        let id = Uuid::new_v4();
        let now = self.formatted_now()?;
        let draft = StoredDraftV1 {
            storage_version: DRAFT_STORAGE_VERSION,
            draft_id: id.to_string(),
            revision: 1,
            created_at: now.clone(),
            updated_at: now,
            local_label: request.local_label,
            local_notes: request.local_notes,
            record_draft: request.record_draft,
        };
        let name = draft_file_name(id);
        self.write(&directory, &name, &draft, id, ReplaceMode::New)?;
        Ok(draft)
    }

    pub fn list(&self) -> AppResult<ListDraftsResponse> {
        let _guard = self.lock()?;
        let directory = self.drafts_directory()?;

        let entries = fs::read_dir(directory.path())
            .map_err(|error| AppError::storage_read(directory.path(), error))?;
        let mut valid: Vec<(OffsetDateTime, StoredDraftV1)> = Vec::new();
        let mut issues = Vec::new();
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    issues.push(DesktopIssue::from(AppError::storage_read(
                        directory.path(),
                        error,
                    )));
                    continue;
                }
            };
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let id = match path.file_stem().and_then(|stem| stem.to_str()) {
                Some(stem) => match parse_canonical_v4(stem) {
                    Ok(id) => id,
                    Err(error) => {
                        issues.push(DesktopIssue::from(error));
                        continue;
                    }
                },
                None => {
                    issues.push(DesktopIssue::from(AppError::draft_id_invalid()));
                    continue;
                }
            };
            let draft = match self.read(&directory, &entry.file_name(), id) {
                Ok(draft) => draft,
                Err(error) => {
                    issues.push(DesktopIssue::from(error));
                    continue;
                }
            };
            let updated = parse_utc_timestamp(&draft.updated_at)?;
            valid.push((updated, draft));
        }
        valid.sort_by(|(left_time, left), (right_time, right)| {
            right_time
                .cmp(left_time)
                .then_with(|| left.draft_id.cmp(&right.draft_id))
        });
        Ok(ListDraftsResponse {
            drafts: valid.into_iter().map(|(_, draft)| draft).collect(),
            issues,
        })
    }

    pub fn load(&self, request: LoadDraftRequest) -> AppResult<StoredDraftV1> {
        let _guard = self.lock()?;
        let id = parse_canonical_v4(&request.draft_id)?;
        let directory = self.drafts_directory()?;
        self.read(&directory, &draft_file_name(id), id)
    }

    pub fn save(&self, request: SaveDraftRequest) -> AppResult<StoredDraftV1> {
        let _guard = self.lock()?;
        let id = parse_canonical_v4(&request.draft_id)?;
        validate_expected_revision(request.expected_revision)?;
        let directory = self.drafts_directory()?;
        let name = draft_file_name(id);
        let current = self.read(&directory, &name, id)?;
        if current.revision != request.expected_revision {
            return Err(AppError::draft_revision_conflict());
        }
        let revision = current
            .revision
            .checked_add(1)
            .filter(|revision| *revision <= MAX_SAFE_REVISION)
            .ok_or_else(AppError::draft_revision_invalid)?;
        let updated = self.formatted_now()?;
        let replacement = StoredDraftV1 {
            storage_version: DRAFT_STORAGE_VERSION,
            draft_id: current.draft_id,
            revision,
            created_at: current.created_at,
            updated_at: updated,
            local_label: request.local_label,
            local_notes: request.local_notes,
            record_draft: request.record_draft,
        };
        self.write(&directory, &name, &replacement, id, ReplaceMode::Existing)?;
        Ok(replacement)
    }

    pub fn delete(&self, request: DeleteDraftRequest) -> AppResult<DeletedDraft> {
        let _guard = self.lock()?;
        let id = parse_canonical_v4(&request.draft_id)?;
        validate_expected_revision(request.expected_revision)?;
        let drafts_directory = self.drafts_directory()?;
        let active_name = draft_file_name(id);
        let active = drafts_directory.path().join(&active_name);
        let current = self.read(&drafts_directory, &active_name, id)?;
        if current.revision != request.expected_revision {
            return Err(AppError::draft_revision_conflict());
        }

        let deleted_time = self.clock.now_utc();
        let unix_nanos = deleted_time.unix_timestamp_nanos();
        if unix_nanos < 0 {
            return Err(AppError::draft_envelope_invalid());
        }
        let deleted_at =
            format_utc_rfc3339(deleted_time).map_err(|_| AppError::draft_envelope_invalid())?;
        let trash_directory = self.trash_directory()?;
        let trash = trash_directory
            .path()
            .join(format!("{}-{unix_nanos}.json", current.draft_id));
        drafts_directory.before_mutation(&active, &trash)?;
        rename_no_replace(&active, &trash)?;

        Ok(DeletedDraft {
            draft_id: current.draft_id,
            revision: current.revision,
            deleted_at,
            recoverable: true,
        })
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| AppError::storage_lock_failed())
    }

    fn formatted_now(&self) -> AppResult<String> {
        format_utc_rfc3339(self.clock.now_utc()).map_err(|_| AppError::draft_envelope_invalid())
    }

    fn drafts_directory(&self) -> AppResult<SafeDirectory> {
        SafeDirectory::open_or_create(
            &self.paths.app_data_dir,
            &["drafts", "v1"],
            Arc::clone(&self.safety_hook),
        )
    }

    fn trash_directory(&self) -> AppResult<SafeDirectory> {
        SafeDirectory::open_or_create(
            &self.paths.app_data_dir,
            &["draft-trash", "v1"],
            Arc::clone(&self.safety_hook),
        )
    }

    fn read(
        &self,
        directory: &SafeDirectory,
        name: &OsStr,
        expected_id: Uuid,
    ) -> AppResult<StoredDraftV1> {
        let mut safe_file = directory.open_existing_file(name)?;
        let safe_path = safe_file.path().to_path_buf();
        let bytes = read_bounded_file(safe_file.file_mut(), &safe_path, MAX_DRAFT_BYTES)?;
        decode_draft(Some(expected_id), &bytes)
    }

    fn write(
        &self,
        directory: &SafeDirectory,
        name: &OsStr,
        draft: &StoredDraftV1,
        expected_id: Uuid,
        mode: ReplaceMode,
    ) -> AppResult<()> {
        write_json_atomically_in(
            directory,
            name,
            draft,
            MAX_DRAFT_BYTES,
            mode,
            self.replacer.as_ref(),
            |bytes| decode_draft(Some(expected_id), bytes).map(|_| ()),
        )?;
        Ok(())
    }
}

fn draft_file_name(id: Uuid) -> std::ffi::OsString {
    format!("{id}.json").into()
}

fn validate_expected_revision(revision: u64) -> AppResult<()> {
    if !(1..=MAX_SAFE_REVISION).contains(&revision) {
        return Err(AppError::draft_revision_invalid());
    }
    Ok(())
}

fn rename_no_replace(source: &Path, target: &Path) -> AppResult<()> {
    move_file_no_replace(source, target).map_err(|error| AppError::storage_write(target, error))
}

#[cfg(test)]
mod tests {
    use super::DraftStore;
    use crate::{
        clock::{Clock, FixedClock},
        drafts::{
            migration::encode_draft,
            model::{CreateDraftRequest, DeleteDraftRequest, LoadDraftRequest, SaveDraftRequest},
        },
        paths::AppPaths,
        storage::path_safety::PathSafetyHook,
        DRAFT_STORAGE_VERSION, MAX_SAFE_REVISION,
    };
    use serde_json::{json, Value};
    use std::{
        collections::VecDeque,
        fs, io,
        path::{Path, PathBuf},
        process::Command,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Mutex,
        },
        thread,
    };
    use tempfile::TempDir;
    use time::{format_description::well_known::Rfc3339, OffsetDateTime};
    use uuid::{Uuid, Version};

    const FIRST_ID: &str = "11111111-1111-4111-8111-111111111111";
    const SECOND_ID: &str = "22222222-2222-4222-8222-222222222222";
    const THIRD_ID: &str = "33333333-3333-4333-8333-333333333333";
    const CORRUPT_ID: &str = "44444444-4444-4444-8444-444444444444";

    #[cfg(windows)]
    fn create_junction(link: &Path, target: &Path) -> io::Result<()> {
        let output = Command::new("cmd.exe")
            .arg("/c")
            .arg("mklink")
            .arg("/J")
            .arg(link)
            .arg(target)
            .output()?;
        if output.status.success() {
            Ok(())
        } else {
            Err(io::Error::other(format!(
                "mklink /J failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )))
        }
    }

    fn timestamp(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).expect("test timestamp")
    }

    fn paths(directory: &TempDir) -> AppPaths {
        AppPaths {
            app_data_dir: directory.path().join("data"),
            app_config_dir: directory.path().join("config"),
            app_log_dir: directory.path().join("logs"),
        }
    }

    fn fixed(value: &str) -> Arc<dyn Clock> {
        Arc::new(FixedClock::new(timestamp(value)))
    }

    fn create_request(label: &str) -> CreateDraftRequest {
        CreateDraftRequest {
            local_label: label.to_owned(),
            local_notes: format!("notes for {label}"),
            record_draft: json!({"opaque": label}),
        }
    }

    fn save_request(id: &str, revision: u64, label: &str) -> SaveDraftRequest {
        SaveDraftRequest {
            draft_id: id.to_owned(),
            expected_revision: revision,
            local_label: label.to_owned(),
            local_notes: format!("saved notes for {label}"),
            record_draft: json!({"savedOpaque": label}),
        }
    }

    struct SequenceClock {
        remaining: Mutex<VecDeque<OffsetDateTime>>,
        fallback: OffsetDateTime,
    }

    impl SequenceClock {
        fn new(values: &[&str]) -> Self {
            let values: VecDeque<_> = values.iter().map(|value| timestamp(value)).collect();
            let fallback = *values.back().expect("at least one time");
            Self {
                remaining: Mutex::new(values),
                fallback,
            }
        }
    }

    impl Clock for SequenceClock {
        fn now_utc(&self) -> OffsetDateTime {
            self.remaining
                .lock()
                .expect("clock lock")
                .pop_front()
                .unwrap_or(self.fallback)
        }
    }

    fn write_envelope(
        paths: &AppPaths,
        id: &str,
        revision: u64,
        created_at: &str,
        updated_at: &str,
    ) -> Vec<u8> {
        let draft = crate::drafts::model::StoredDraftV1 {
            storage_version: DRAFT_STORAGE_VERSION,
            draft_id: id.to_owned(),
            revision,
            created_at: created_at.to_owned(),
            updated_at: updated_at.to_owned(),
            local_label: format!("label-{id}"),
            local_notes: String::new(),
            record_draft: json!({"unvalidatedContentShape": id}),
        };
        let bytes = encode_draft(&draft).expect("encodes fixture");
        fs::create_dir_all(paths.drafts_dir()).expect("creates draft directory");
        fs::write(paths.drafts_dir().join(format!("{id}.json")), &bytes).expect("writes fixture");
        bytes
    }

    #[test]
    fn strict_requests_reject_unknown_path_fields() {
        assert!(serde_json::from_value::<CreateDraftRequest>(json!({
            "localLabel": "label",
            "localNotes": "notes",
            "recordDraft": {},
            "path": "C:/outside.json"
        }))
        .is_err());
        assert!(serde_json::from_value::<LoadDraftRequest>(json!({
            "draftId": FIRST_ID,
            "path": "C:/outside.json"
        }))
        .is_err());
        assert!(serde_json::from_value::<SaveDraftRequest>(json!({
            "draftId": FIRST_ID,
            "expectedRevision": 1,
            "localLabel": "label",
            "localNotes": "notes",
            "recordDraft": {},
            "path": "C:/outside.json"
        }))
        .is_err());
        assert!(serde_json::from_value::<DeleteDraftRequest>(json!({
            "draftId": FIRST_ID,
            "expectedRevision": 1,
            "path": "C:/outside.json"
        }))
        .is_err());
    }

    #[test]
    fn create_load_save_list_and_delete_form_a_complete_local_lifecycle() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let clock: Arc<dyn Clock> = Arc::new(SequenceClock::new(&[
            "2026-07-23T01:02:03.000000004Z",
            "2026-07-23T02:03:04.000000005Z",
            "2026-07-23T03:04:05.000000006Z",
        ]));
        let store = DraftStore::new(paths.clone(), clock);

        let created = store.create(create_request("initial")).expect("creates");
        let parsed = Uuid::parse_str(&created.draft_id).expect("canonical uuid");
        assert_eq!(parsed.get_version(), Some(Version::Random));
        assert_eq!(parsed.to_string(), created.draft_id);
        assert_eq!(created.revision, 1);
        assert_eq!(created.created_at, "2026-07-23T01:02:03.000000004Z");
        assert_eq!(created.updated_at, created.created_at);

        let loaded = store
            .load(LoadDraftRequest {
                draft_id: created.draft_id.clone(),
            })
            .expect("loads");
        assert_eq!(loaded, created);

        let saved = store
            .save(save_request(&created.draft_id, 1, "saved"))
            .expect("saves");
        assert_eq!(saved.draft_id, created.draft_id);
        assert_eq!(saved.created_at, created.created_at);
        assert_eq!(saved.updated_at, "2026-07-23T02:03:04.000000005Z");
        assert_eq!(saved.revision, 2);
        assert_eq!(saved.local_label, "saved");

        let listed = store.list().expect("lists");
        assert!(listed.issues.is_empty());
        assert_eq!(listed.drafts.len(), 1);
        assert_eq!(listed.drafts[0].draft_id, created.draft_id);
        assert_eq!(listed.drafts[0].local_notes, "saved notes for saved");
        assert_eq!(
            listed.drafts[0].record_draft,
            json!({"savedOpaque": "saved"})
        );
        assert_eq!(listed.drafts[0].revision, 2);

        let active_path = paths
            .drafts_dir()
            .join(format!("{}.json", created.draft_id));
        let active_bytes = fs::read(&active_path).expect("reads active bytes");
        fs::create_dir_all(paths.trash_dir()).expect("creates trash");
        let preexisting_trash = paths.trash_dir().join("keep.forever");
        fs::write(&preexisting_trash, b"keep").expect("writes existing trash");

        let deleted = store
            .delete(DeleteDraftRequest {
                draft_id: created.draft_id.clone(),
                expected_revision: 2,
            })
            .expect("deletes recoverably");
        assert_eq!(deleted.draft_id, created.draft_id);
        assert_eq!(deleted.revision, 2);
        assert_eq!(deleted.deleted_at, "2026-07-23T03:04:05.000000006Z");
        assert!(deleted.recoverable);
        assert!(!active_path.exists());
        assert_eq!(
            fs::read(&preexisting_trash).expect("old trash survives"),
            b"keep"
        );

        let trash_entries: Vec<_> = fs::read_dir(paths.trash_dir())
            .expect("reads trash")
            .map(|entry| entry.expect("entry").path())
            .filter(|path| path != &preexisting_trash)
            .collect();
        assert_eq!(trash_entries.len(), 1);
        assert_eq!(
            fs::read(&trash_entries[0]).expect("trash bytes"),
            active_bytes
        );
        let name = trash_entries[0]
            .file_name()
            .expect("name")
            .to_string_lossy();
        let expected_stamp = timestamp("2026-07-23T03:04:05.000000006Z").unix_timestamp_nanos();
        assert_eq!(
            name,
            format!("{}-{expected_stamp}.json", created.draft_id),
            "trash filename must use the exact UUID-dash-digits contract"
        );
    }

    #[test]
    fn list_is_deterministic_and_reports_bad_entries_without_hiding_valid_ones() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        write_envelope(
            &paths,
            SECOND_ID,
            1,
            "2026-01-01T00:00:00Z",
            "2026-01-02T00:00:00Z",
        );
        write_envelope(
            &paths,
            FIRST_ID,
            1,
            "2026-01-01T00:00:00Z",
            "2026-01-02T00:00:00Z",
        );
        write_envelope(
            &paths,
            THIRD_ID,
            1,
            "2026-01-01T00:00:00Z",
            "2026-01-03T00:00:00Z",
        );
        fs::write(
            paths.drafts_dir().join(format!("{CORRUPT_ID}.json")),
            b"not json and C:/private/body must be redacted",
        )
        .expect("writes corrupt entry");
        let unsupported_id = "55555555-5555-4555-8555-555555555555";
        let unsupported_path = paths.drafts_dir().join(format!("{unsupported_id}.json"));
        let mut unsupported: Value = serde_json::from_slice(&write_envelope(
            &paths,
            unsupported_id,
            1,
            "2026-01-01T00:00:00Z",
            "2026-01-04T00:00:00Z",
        ))
        .expect("json");
        unsupported["storageVersion"] = json!(2);
        fs::write(
            &unsupported_path,
            serde_json::to_vec(&unsupported).expect("json"),
        )
        .expect("writes unsupported entry");

        let store = DraftStore::new(paths, fixed("2026-07-23T00:00:00Z"));
        let result = store.list().expect("lists valid and invalid entries");
        let ids: Vec<_> = result
            .drafts
            .iter()
            .map(|draft| draft.draft_id.as_str())
            .collect();
        assert_eq!(ids, [THIRD_ID, FIRST_ID, SECOND_ID]);
        let mut codes: Vec<_> = result
            .issues
            .iter()
            .map(|issue| issue.code.as_str())
            .collect();
        codes.sort_unstable();
        assert_eq!(
            codes,
            [
                "DRAFT_ENVELOPE_INVALID",
                "DRAFT_STORAGE_VERSION_UNSUPPORTED"
            ]
        );
        let serialized = serde_json::to_string(&result.issues).expect("serializes issues");
        assert!(!serialized.contains("C:/private"));
        assert!(!serialized.contains("not json"));
    }

    #[test]
    fn load_rejects_filename_envelope_identity_mismatch() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let bytes = write_envelope(
            &paths,
            FIRST_ID,
            1,
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:00:00Z",
        );
        fs::write(paths.drafts_dir().join(format!("{SECOND_ID}.json")), bytes)
            .expect("writes mismatched fixture");
        let store = DraftStore::new(paths, fixed("2026-07-23T00:00:00Z"));

        assert_eq!(
            store
                .load(LoadDraftRequest {
                    draft_id: SECOND_ID.to_owned(),
                })
                .expect_err("mismatch rejects")
                .code(),
            "DRAFT_ID_INVALID"
        );
    }

    #[test]
    fn stale_future_and_overflow_revisions_fail_closed() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let store = DraftStore::new(
            paths.clone(),
            Arc::new(SequenceClock::new(&[
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
                "2026-01-03T00:00:00Z",
            ])),
        );
        let created = store.create(create_request("initial")).expect("creates");
        let path = paths
            .drafts_dir()
            .join(format!("{}.json", created.draft_id));
        assert_eq!(
            store
                .save(save_request(&created.draft_id, 0, "invalid"))
                .expect_err("zero revision rejects")
                .code(),
            "DRAFT_REVISION_INVALID"
        );
        let saved = store
            .save(save_request(&created.draft_id, 1, "current"))
            .expect("advances current revision");
        assert_eq!(saved.revision, 2);
        let original = fs::read(&path).expect("current bytes");

        for expected in [1, 3] {
            let error = store
                .save(save_request(&created.draft_id, expected, "conflict"))
                .expect_err("revision rejects");
            assert_eq!(error.code(), "DRAFT_REVISION_CONFLICT");
            assert_eq!(fs::read(&path).expect("unchanged bytes"), original);
        }

        let overflow_id = FIRST_ID;
        let overflow_bytes = write_envelope(
            &paths,
            overflow_id,
            MAX_SAFE_REVISION,
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:00:00Z",
        );
        assert_eq!(
            store
                .save(save_request(overflow_id, MAX_SAFE_REVISION, "overflow"))
                .expect_err("overflow fails")
                .code(),
            "DRAFT_REVISION_INVALID"
        );
        assert_eq!(
            fs::read(paths.drafts_dir().join(format!("{overflow_id}.json")))
                .expect("overflow bytes"),
            overflow_bytes
        );
    }

    #[test]
    fn concurrent_saves_serialize_read_check_replace() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let store = Arc::new(DraftStore::new(
            paths,
            Arc::new(SequenceClock::new(&[
                "2026-01-01T00:00:00Z",
                "2026-01-02T00:00:00Z",
            ])),
        ));
        let created = store.create(create_request("initial")).expect("creates");

        let handles: Vec<_> = ["first", "second"]
            .into_iter()
            .map(|label| {
                let store = Arc::clone(&store);
                let id = created.draft_id.clone();
                thread::spawn(move || store.save(save_request(&id, 1, label)))
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().expect("thread joins"))
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter_map(|result| result.as_ref().err())
                .next()
                .expect("one conflict")
                .code(),
            "DRAFT_REVISION_CONFLICT"
        );
        assert_eq!(
            store
                .load(LoadDraftRequest {
                    draft_id: created.draft_id.clone(),
                })
                .expect("loads winner")
                .revision,
            2
        );
    }

    #[test]
    fn delete_requires_exact_revision_and_preserves_active_bytes_on_conflict() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let store = DraftStore::new(paths.clone(), fixed("2026-01-01T00:00:00Z"));
        let created = store.create(create_request("initial")).expect("creates");
        let active = paths
            .drafts_dir()
            .join(format!("{}.json", created.draft_id));
        let bytes = fs::read(&active).expect("active bytes");

        assert_eq!(
            store
                .delete(DeleteDraftRequest {
                    draft_id: created.draft_id,
                    expected_revision: 2,
                })
                .expect_err("future revision conflicts")
                .code(),
            "DRAFT_REVISION_CONFLICT"
        );
        assert_eq!(fs::read(active).expect("active survives"), bytes);
    }

    #[test]
    fn unsupported_golden_and_corrupt_entries_survive_load_list_save_delete_attempts() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        fs::create_dir_all(paths.drafts_dir()).expect("creates drafts");
        let golden = include_bytes!("../../tests/fixtures/draft-v1-golden.json");
        let mut unsupported: Value = serde_json::from_slice(golden).expect("golden json");
        unsupported["storageVersion"] = json!(2);
        let unsupported_bytes = serde_json::to_vec_pretty(&unsupported).expect("json");
        let unsupported_id = unsupported["draftId"].as_str().expect("draftId");
        let unsupported_path = paths.drafts_dir().join(format!("{unsupported_id}.json"));
        fs::write(&unsupported_path, &unsupported_bytes).expect("writes unsupported");
        let corrupt_path = paths.drafts_dir().join(format!("{CORRUPT_ID}.json"));
        let corrupt_bytes = b"{corrupt body that must never be rewritten}";
        fs::write(&corrupt_path, corrupt_bytes).expect("writes corrupt");
        let store = DraftStore::new(paths.clone(), fixed("2026-07-23T00:00:00Z"));

        for (id, path, bytes, code) in [
            (
                unsupported_id,
                &unsupported_path,
                unsupported_bytes.as_slice(),
                "DRAFT_STORAGE_VERSION_UNSUPPORTED",
            ),
            (
                CORRUPT_ID,
                &corrupt_path,
                corrupt_bytes.as_slice(),
                "DRAFT_ENVELOPE_INVALID",
            ),
        ] {
            assert_eq!(
                store
                    .load(LoadDraftRequest {
                        draft_id: id.to_owned(),
                    })
                    .expect_err("load rejects")
                    .code(),
                code
            );
            assert_eq!(fs::read(path).expect("unchanged after load"), bytes);
            let listed = store.list().expect("list completes");
            assert!(listed.issues.iter().any(|issue| issue.code == code));
            assert_eq!(fs::read(path).expect("unchanged after list"), bytes);
            assert_eq!(
                store
                    .save(save_request(id, 7, "must not save"))
                    .expect_err("save rejects")
                    .code(),
                code
            );
            assert_eq!(fs::read(path).expect("unchanged after save"), bytes);
            assert_eq!(
                store
                    .delete(DeleteDraftRequest {
                        draft_id: id.to_owned(),
                        expected_revision: 7,
                    })
                    .expect_err("delete rejects")
                    .code(),
                code
            );
            assert_eq!(fs::read(path).expect("unchanged after delete"), bytes);
        }
        assert!(!paths.trash_dir().exists());
    }

    struct AbortBeforeMutation {
        protected_directory: PathBuf,
        parked_directory: PathBuf,
        outside_directory: PathBuf,
        fired: AtomicBool,
        rename_was_blocked: AtomicBool,
    }

    impl PathSafetyHook for AbortBeforeMutation {
        fn before_mutation(&self, _source: &Path, _target: &Path) -> io::Result<()> {
            if !self.fired.swap(true, Ordering::SeqCst) {
                match fs::rename(&self.protected_directory, &self.parked_directory) {
                    Ok(()) => {
                        #[cfg(windows)]
                        create_junction(&self.protected_directory, &self.outside_directory)?;
                    }
                    Err(_) => {
                        self.rename_was_blocked.store(true, Ordering::SeqCst);
                    }
                }
            }
            Err(io::Error::other("injected immediately before mutation"))
        }
    }

    #[cfg(windows)]
    #[test]
    fn deterministic_pre_use_swap_fails_closed_for_save_and_delete() {
        let directory = tempfile::tempdir().expect("temp directory");
        let paths = paths(&directory);
        let initial = DraftStore::new(paths.clone(), fixed("2026-01-01T00:00:00Z"));
        let created = initial.create(create_request("initial")).expect("creates");
        let active = paths
            .drafts_dir()
            .join(format!("{}.json", created.draft_id));
        let original = fs::read(&active).expect("reads original");
        let unrelated_temp = paths.drafts_dir().join(".unrelated-operation.tmp");
        fs::write(&unrelated_temp, b"unrelated bytes").expect("writes unrelated temp");
        let outside = directory.path().join("outside");
        fs::create_dir_all(&outside).expect("creates outside");
        let sentinel = outside.join("sentinel.txt");
        fs::write(&sentinel, b"outside bytes").expect("writes sentinel");

        for operation in ["save", "delete"] {
            let hook = Arc::new(AbortBeforeMutation {
                protected_directory: paths.drafts_dir(),
                parked_directory: paths
                    .app_data_dir
                    .join("drafts")
                    .join(format!("v1-parked-{operation}")),
                outside_directory: outside.clone(),
                fired: AtomicBool::new(false),
                rename_was_blocked: AtomicBool::new(false),
            });
            let store = DraftStore::with_safety_hook(
                paths.clone(),
                fixed("2026-01-02T00:00:00Z"),
                hook.clone(),
            );

            let result = if operation == "save" {
                store
                    .save(save_request(&created.draft_id, 1, "must fail"))
                    .map(|_| ())
            } else {
                store
                    .delete(DeleteDraftRequest {
                        draft_id: created.draft_id.clone(),
                        expected_revision: 1,
                    })
                    .map(|_| ())
            };

            result.expect_err("injected mutation race must fail closed");
            assert!(hook.fired.load(Ordering::SeqCst));
            assert!(
                hook.rename_was_blocked.load(Ordering::SeqCst),
                "opened directory handle must block the swap"
            );
            assert_eq!(fs::read(&active).expect("active survives"), original);
            assert_eq!(
                fs::read(&unrelated_temp).expect("unrelated temp survives"),
                b"unrelated bytes"
            );
            assert_eq!(
                fs::read(&sentinel).expect("outside survives"),
                b"outside bytes"
            );
            assert_eq!(
                fs::read_dir(&outside).expect("outside listing").count(),
                1,
                "no draft or trash file may escape"
            );
        }
    }
}
