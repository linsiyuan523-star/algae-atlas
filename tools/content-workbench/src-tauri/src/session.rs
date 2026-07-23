use crate::drafts::{DraftStore, StoredDraft};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use thiserror::Error;

#[cfg(not(windows))]
use std::fs::File;

const SESSION_MARKER_NAME: &str = "active-session";

#[derive(Debug, Error)]
pub(crate) enum SessionError {
    #[error("session state path is not safe")]
    UnsafePath,
    #[error("session state is busy")]
    LockFailed,
    #[error("session state operation failed: {0}")]
    Storage(#[from] std::io::Error),
}

pub(crate) type SessionResult<T> = Result<T, SessionError>;

pub(crate) struct SessionState {
    root: PathBuf,
    marker: PathBuf,
    recovery_pending: Mutex<bool>,
    operation_lock: Mutex<()>,
}

impl SessionState {
    pub(crate) fn begin(root: PathBuf) -> SessionResult<Self> {
        prepare_directory(&root)?;
        let marker = root.join(SESSION_MARKER_NAME);
        let previous_interrupted = match fs::symlink_metadata(&marker) {
            Ok(metadata) => {
                if !metadata.is_file() || is_link_or_reparse_point(&metadata) {
                    return Err(SessionError::UnsafePath);
                }
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&marker)?;
                file.write_all(b"active\n")?;
                file.sync_all()?;
                sync_directory(&root)?;
                false
            }
            Err(error) => return Err(error.into()),
        };

        Ok(Self {
            root,
            marker,
            recovery_pending: Mutex::new(previous_interrupted),
            operation_lock: Mutex::new(()),
        })
    }

    pub fn finish(&self) -> Result<(), String> {
        self.finish_inner().map_err(|error| error.to_string())
    }

    fn finish_inner(&self) -> SessionResult<()> {
        let _guard = self.lock()?;
        match fs::symlink_metadata(&self.marker) {
            Ok(metadata) => {
                if !metadata.is_file() || is_link_or_reparse_point(&metadata) {
                    return Err(SessionError::UnsafePath);
                }
                fs::remove_file(&self.marker)?;
                sync_directory(&self.root)?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }

    fn has_pending_recovery(&self) -> SessionResult<bool> {
        Ok(*self
            .recovery_pending
            .lock()
            .map_err(|_| SessionError::LockFailed)?)
    }

    fn consume_recovery(&self) -> SessionResult<()> {
        *self
            .recovery_pending
            .lock()
            .map_err(|_| SessionError::LockFailed)? = false;
        Ok(())
    }

    fn lock(&self) -> SessionResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| SessionError::LockFailed)
    }
}

fn prepare_directory(path: &Path) -> SessionResult<()> {
    fs::create_dir_all(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(SessionError::UnsafePath);
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
fn sync_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(not(windows))]
fn sync_directory(path: &Path) -> std::io::Result<()> {
    File::open(path)?.sync_all()
}

#[tauri::command]
pub fn take_recovery_draft(
    drafts: tauri::State<'_, DraftStore>,
    session: tauri::State<'_, SessionState>,
) -> Result<Option<StoredDraft>, String> {
    if !session
        .has_pending_recovery()
        .map_err(|error| error.to_string())?
    {
        return Ok(None);
    }

    let candidate = drafts.latest_for_recovery()?;
    session
        .consume_recovery()
        .map_err(|error| error.to_string())?;
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::SessionState;
    use tempfile::tempdir;

    #[test]
    fn marks_interrupted_sessions_once_and_clears_on_normal_finish() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("session");

        let first = SessionState::begin(root.clone()).expect("starts first session");
        assert!(!first.has_pending_recovery().expect("checks first session"));

        let interrupted = SessionState::begin(root.clone()).expect("detects marker");
        assert!(interrupted
            .has_pending_recovery()
            .expect("checks interrupted session"));
        interrupted
            .consume_recovery()
            .expect("consumes recovery prompt");
        assert!(!interrupted
            .has_pending_recovery()
            .expect("checks consumed recovery"));

        interrupted.finish_inner().expect("finishes normally");
        let clean = SessionState::begin(root).expect("starts clean session");
        assert!(!clean.has_pending_recovery().expect("checks clean session"));

        drop(first);
    }
}
