use super::{deterministic_json, read_bounded};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReplaceMode {
    New,
    Existing,
}

pub trait AtomicReplacer: Send + Sync {
    fn install(&self, temporary: &Path, target: &Path, mode: ReplaceMode) -> AppResult<()>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PlatformAtomicReplacer;

impl AtomicReplacer for PlatformAtomicReplacer {
    fn install(&self, temporary: &Path, target: &Path, mode: ReplaceMode) -> AppResult<()> {
        match mode {
            ReplaceMode::New => install_new(temporary, target),
            ReplaceMode::Existing => replace_existing(temporary, target),
        }
    }
}

pub fn write_json_atomically<T, R, F>(
    target: &Path,
    value: &T,
    limit: usize,
    mode: ReplaceMode,
    replacer: &R,
    validate: F,
) -> AppResult<Vec<u8>>
where
    T: Serialize,
    R: AtomicReplacer + ?Sized,
    F: Fn(&[u8]) -> AppResult<()>,
{
    let bytes = deterministic_json(value, limit)?;
    validate(&bytes)?;

    let temporary = operation_temp_path(target)?;
    let mut temporary_created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| AppError::storage_write(&temporary, error))?;
        temporary_created = true;
        file.write_all(&bytes)
            .map_err(|error| AppError::storage_write(&temporary, error))?;
        file.sync_all()
            .map_err(|error| AppError::storage_write(&temporary, error))?;
        drop(file);

        let reread = read_bounded(&temporary, limit)?;
        validate(&reread)?;
        if reread != bytes {
            return Err(AppError::atomic_replace(
                target,
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "temporary file changed after write",
                ),
            ));
        }
        replacer.install(&temporary, target, mode)?;
        Ok(bytes.clone())
    })();

    if result.is_err() && temporary_created {
        match fs::remove_file(&temporary) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {}
        }
    }
    result
}

fn operation_temp_path(target: &Path) -> AppResult<std::path::PathBuf> {
    let parent = target
        .parent()
        .ok_or_else(AppError::draft_envelope_invalid)?;
    let name = target
        .file_name()
        .ok_or_else(AppError::draft_envelope_invalid)?;
    let mut temporary_name = OsString::from(".");
    temporary_name.push(name);
    temporary_name.push(format!(".{}.tmp", Uuid::new_v4()));
    Ok(parent.join(temporary_name))
}

fn install_new(temporary: &Path, target: &Path) -> AppResult<()> {
    move_file_no_replace(temporary, target).map_err(|error| AppError::atomic_replace(target, error))
}

#[cfg(windows)]
pub(crate) fn move_file_no_replace(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::MoveFileExW;

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let moved = unsafe { MoveFileExW(source_wide.as_ptr(), target_wide.as_ptr(), 0) };
    if moved == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn move_file_no_replace(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::hard_link(source, target)?;
    fs::remove_file(source)
}

#[cfg(windows)]
fn replace_existing(temporary: &Path, target: &Path) -> AppResult<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;

    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let temporary_wide: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    let replaced = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            temporary_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(AppError::atomic_replace(
            target,
            std::io::Error::last_os_error(),
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_existing(temporary: &Path, target: &Path) -> AppResult<()> {
    fs::rename(temporary, target).map_err(|error| AppError::atomic_replace(target, error))
}

#[cfg(test)]
mod tests {
    use super::{write_json_atomically, AtomicReplacer, PlatformAtomicReplacer, ReplaceMode};
    use crate::error::{AppError, AppResult};
    use serde::Serialize;
    use std::{
        fs,
        path::Path,
        sync::atomic::{AtomicUsize, Ordering},
    };
    use tempfile::tempdir;

    #[derive(Serialize)]
    struct Payload<'a> {
        value: &'a str,
    }

    struct FailBeforeReplace;

    impl AtomicReplacer for FailBeforeReplace {
        fn install(&self, _temporary: &Path, target: &Path, _mode: ReplaceMode) -> AppResult<()> {
            Err(AppError::atomic_replace(
                target,
                std::io::Error::other("injected immediately before replacement"),
            ))
        }
    }

    #[test]
    fn injected_failure_preserves_target_and_unrelated_temp_file() {
        let directory = tempdir().expect("temp directory");
        let target = directory.path().join("draft.json");
        let unrelated = directory.path().join(".draft.json.unrelated.tmp");
        let prior = b"prior bytes, deliberately not json";
        fs::write(&target, prior).expect("writes target");
        fs::write(&unrelated, b"keep me").expect("writes unrelated temp");

        let error = write_json_atomically(
            &target,
            &Payload { value: "new" },
            1024,
            ReplaceMode::Existing,
            &FailBeforeReplace,
            |_| Ok(()),
        )
        .expect_err("replacement is injected to fail");

        assert_eq!(error.code(), "ATOMIC_REPLACE_FAILED");
        assert_eq!(fs::read(&target).expect("reads target"), prior);
        assert_eq!(
            fs::read(&unrelated).expect("reads unrelated temp"),
            b"keep me"
        );
        let names: Vec<_> = fs::read_dir(directory.path())
            .expect("reads directory")
            .map(|entry| entry.expect("directory entry").file_name())
            .collect();
        assert_eq!(names.len(), 2, "current operation temp was not removed");
    }

    #[test]
    fn writer_validates_before_write_and_after_bounded_reread() {
        let directory = tempdir().expect("temp directory");
        let target = directory.path().join("draft.json");
        let validations = AtomicUsize::new(0);

        write_json_atomically(
            &target,
            &Payload { value: "new" },
            1024,
            ReplaceMode::New,
            &PlatformAtomicReplacer,
            |_| {
                validations.fetch_add(1, Ordering::SeqCst);
                Ok(())
            },
        )
        .expect("atomic creation succeeds");

        assert_eq!(validations.load(Ordering::SeqCst), 2);
        let created = fs::read(&target).expect("reads target");
        assert!(created.ends_with(b"\n"));

        write_json_atomically(
            &target,
            &Payload {
                value: "replacement",
            },
            1024,
            ReplaceMode::Existing,
            &PlatformAtomicReplacer,
            |_| Ok(()),
        )
        .expect("atomic replacement succeeds");
        assert_ne!(fs::read(&target).expect("reads target"), created);
    }

    #[test]
    fn new_mode_never_overwrites_an_existing_target() {
        let directory = tempdir().expect("temp directory");
        let target = directory.path().join("draft.json");
        fs::write(&target, b"existing").expect("writes target");

        write_json_atomically(
            &target,
            &Payload {
                value: "replacement",
            },
            1024,
            ReplaceMode::New,
            &PlatformAtomicReplacer,
            |_| Ok(()),
        )
        .expect_err("exclusive creation cannot overwrite");

        assert_eq!(fs::read(&target).expect("reads target"), b"existing");
    }
}
