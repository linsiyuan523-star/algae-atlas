use crate::error::{AppError, AppResult};
use std::{
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

pub trait PathSafetyHook: Send + Sync {
    fn before_open(&self, _path: &Path) -> io::Result<()> {
        Ok(())
    }

    fn before_mutation(&self, _source: &Path, _target: &Path) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NoopPathSafetyHook;

impl PathSafetyHook for NoopPathSafetyHook {}

pub struct SafeDirectory {
    path: PathBuf,
    root_final_path: PathBuf,
    _guards: Vec<File>,
    hook: Arc<dyn PathSafetyHook>,
}

impl std::fmt::Debug for SafeDirectory {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SafeDirectory")
            .field("path", &self.path)
            .field("root_final_path", &self.root_final_path)
            .finish_non_exhaustive()
    }
}

impl SafeDirectory {
    pub fn open_or_create(
        trusted_root: &Path,
        components: &[&str],
        hook: Arc<dyn PathSafetyHook>,
    ) -> AppResult<Self> {
        fs::create_dir_all(trusted_root)
            .map_err(|error| AppError::storage_write(trusted_root, error))?;
        let root_guard = open_directory(trusted_root, true)
            .map_err(|error| AppError::storage_read(trusted_root, error))?;
        validate_directory_handle(&root_guard, true)
            .map_err(|error| AppError::storage_read(trusted_root, error))?;
        let root_final_path =
            final_path(&root_guard).map_err(|error| AppError::storage_read(trusted_root, error))?;
        let mut guards = vec![root_guard];
        let mut current = root_final_path.clone();

        for component in components {
            validate_component(OsStr::new(component))
                .map_err(|error| AppError::storage_write(&current, error))?;
            let candidate = current.join(component);
            match fs::symlink_metadata(&candidate) {
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    fs::create_dir(&candidate)
                        .map_err(|error| AppError::storage_write(&candidate, error))?;
                }
                Err(error) => return Err(AppError::storage_read(&candidate, error)),
            }
            hook.before_open(&candidate)
                .map_err(|error| AppError::storage_read(&candidate, error))?;
            let guard = open_directory(&candidate, false)
                .map_err(|error| AppError::storage_read(&candidate, error))?;
            validate_directory_handle(&guard, false)
                .map_err(|error| AppError::storage_read(&candidate, error))?;
            let opened_path =
                final_path(&guard).map_err(|error| AppError::storage_read(&candidate, error))?;
            ensure_confined(&root_final_path, &opened_path)
                .map_err(|error| AppError::storage_read(&candidate, error))?;
            current = opened_path;
            guards.push(guard);
        }

        Ok(Self {
            path: current,
            root_final_path,
            _guards: guards,
            hook,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn open_existing_file(&self, name: impl AsRef<OsStr>) -> AppResult<SafeFile> {
        let name = name.as_ref();
        validate_component(name).map_err(|error| AppError::storage_read(&self.path, error))?;
        let path = self.path.join(name);
        match fs::symlink_metadata(&path) {
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(AppError::draft_not_found());
            }
            Err(error) => return Err(AppError::storage_read(&path, error)),
        }
        self.hook
            .before_open(&path)
            .map_err(|error| AppError::storage_read(&path, error))?;
        let file = open_file(&path, false).map_err(|error| AppError::storage_read(&path, error))?;
        validate_regular_file_handle(&file)
            .map_err(|error| AppError::storage_read(&path, error))?;
        let opened_path =
            final_path(&file).map_err(|error| AppError::storage_read(&path, error))?;
        ensure_confined(&self.root_final_path, &opened_path)
            .map_err(|error| AppError::storage_read(&path, error))?;
        Ok(SafeFile {
            file,
            path: opened_path,
        })
    }

    pub fn create_new_file(&self, name: &OsStr) -> AppResult<SafeFile> {
        validate_component(name).map_err(|error| AppError::storage_write(&self.path, error))?;
        let path = self.path.join(name);
        self.hook
            .before_open(&path)
            .map_err(|error| AppError::storage_write(&path, error))?;
        let file = open_file(&path, true).map_err(|error| AppError::storage_write(&path, error))?;
        validate_regular_file_handle(&file)
            .map_err(|error| AppError::storage_write(&path, error))?;
        let opened_path =
            final_path(&file).map_err(|error| AppError::storage_write(&path, error))?;
        ensure_confined(&self.root_final_path, &opened_path)
            .map_err(|error| AppError::storage_write(&path, error))?;
        Ok(SafeFile {
            file,
            path: opened_path,
        })
    }

    pub fn before_mutation(&self, source: &Path, target: &Path) -> AppResult<()> {
        self.hook
            .before_mutation(source, target)
            .map_err(|error| AppError::atomic_replace(target, error))
    }
}

pub struct SafeFile {
    file: File,
    path: PathBuf,
}

impl std::fmt::Debug for SafeFile {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SafeFile")
            .field("path", &self.path)
            .finish_non_exhaustive()
    }
}

impl SafeFile {
    pub fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn validate_component(component: &OsStr) -> io::Result<()> {
    let path = Path::new(component);
    let mut components = path.components();
    if matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none() {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        "storage path component is invalid",
    ))
}

fn ensure_confined(root: &Path, candidate: &Path) -> io::Result<()> {
    let root = normalized_final_path(root);
    let candidate = normalized_final_path(candidate);
    if candidate == root
        || candidate
            .strip_prefix(&root)
            .is_some_and(|suffix| suffix.starts_with('\\'))
    {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::PermissionDenied,
        "opened handle escaped the trusted storage root",
    ))
}

fn normalized_final_path(path: &Path) -> String {
    path.as_os_str()
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

#[cfg(windows)]
fn open_directory(path: &Path, trusted_root: bool) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
    };

    let reparse_flag = if trusted_root {
        0
    } else {
        FILE_FLAG_OPEN_REPARSE_POINT
    };
    let mut options = OpenOptions::new();
    options
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | reparse_flag);
    options.open(path)
}

#[cfg(not(windows))]
fn open_directory(path: &Path, _trusted_root: bool) -> io::Result<File> {
    OpenOptions::new().read(true).open(path)
}

#[cfg(windows)]
fn open_file(path: &Path, create_new: bool) -> io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ,
    };

    let mut options = OpenOptions::new();
    let share_mode = if create_new { 0 } else { FILE_SHARE_READ };
    options
        .read(true)
        .write(create_new)
        .create_new(create_new)
        .share_mode(share_mode)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT);
    options.open(path)
}

#[cfg(not(windows))]
fn open_file(path: &Path, create_new: bool) -> io::Result<File> {
    OpenOptions::new()
        .read(true)
        .write(create_new)
        .create_new(create_new)
        .open(path)
}

#[cfg(windows)]
fn handle_attributes(file: &File) -> io::Result<u32> {
    use std::{mem::size_of, os::windows::io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{
        FileAttributeTagInfo, GetFileInformationByHandleEx, FILE_ATTRIBUTE_TAG_INFO,
    };

    let mut information = FILE_ATTRIBUTE_TAG_INFO::default();
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileAttributeTagInfo,
            (&mut information as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
            size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(information.FileAttributes)
}

#[cfg(not(windows))]
fn handle_attributes(file: &File) -> io::Result<u32> {
    let metadata = file.metadata()?;
    Ok(if metadata.is_dir() { 16 } else { 0 })
}

fn validate_directory_handle(file: &File, trusted_root: bool) -> io::Result<()> {
    #[cfg(windows)]
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT,
    };
    #[cfg(not(windows))]
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 16;
    #[cfg(not(windows))]
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 1024;

    let attributes = handle_attributes(file)?;
    if attributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || (!trusted_root && attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "storage directory is not a regular non-reparse directory",
        ));
    }
    Ok(())
}

fn validate_regular_file_handle(file: &File) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileType, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_TYPE_DISK,
        };

        let attributes = handle_attributes(file)?;
        let file_type = unsafe { GetFileType(file.as_raw_handle()) };
        if attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) != 0
            || file_type != FILE_TYPE_DISK
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "storage entry is not a regular non-reparse disk file",
            ));
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        if file.metadata()?.is_file() {
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "storage entry is not a regular file",
            ))
        }
    }
}

#[cfg(windows)]
fn final_path(file: &File) -> io::Result<PathBuf> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, os::windows::io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{
        GetFinalPathNameByHandleW, FILE_NAME_NORMALIZED, VOLUME_NAME_DOS,
    };

    let mut buffer = vec![0u16; 512];
    loop {
        let length = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                FILE_NAME_NORMALIZED | VOLUME_NAME_DOS,
            )
        };
        if length == 0 {
            return Err(io::Error::last_os_error());
        }
        if (length as usize) < buffer.len() {
            buffer.truncate(length as usize);
            return Ok(PathBuf::from(OsString::from_wide(&buffer)));
        }
        buffer.resize(length as usize + 1, 0);
    }
}

#[cfg(not(windows))]
fn final_path(file: &File) -> io::Result<PathBuf> {
    use std::os::fd::AsRawFd;
    fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

#[cfg(test)]
mod tests {
    use super::{NoopPathSafetyHook, PathSafetyHook, SafeDirectory};
    use std::{
        fs, io,
        path::{Path, PathBuf},
        process::Command,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
    };

    const FIRST_ID: &str = "11111111-1111-4111-8111-111111111111";
    const SECOND_ID: &str = "22222222-2222-4222-8222-222222222222";

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

    #[cfg(windows)]
    #[test]
    fn reparse_parent_below_trusted_root_is_rejected_without_escape() {
        let directory = tempfile::tempdir().expect("temp directory");
        let root = directory.path().join("data");
        let outside = directory.path().join("outside");
        fs::create_dir_all(&root).expect("creates root");
        fs::create_dir_all(&outside).expect("creates outside");
        let sentinel = outside.join("sentinel.txt");
        fs::write(&sentinel, b"outside bytes").expect("writes sentinel");
        let junction = root.join("drafts");
        create_junction(&junction, &outside).expect("creates parent junction");

        SafeDirectory::open_or_create(&root, &["drafts", "v1"], Arc::new(NoopPathSafetyHook))
            .expect_err("reparse parent must reject");

        assert_eq!(
            fs::read(&sentinel).expect("outside survives"),
            b"outside bytes"
        );
        assert!(!outside.join("v1").exists(), "draft directory escaped root");
        fs::remove_dir(&junction).expect("removes junction only");
    }

    #[cfg(windows)]
    #[test]
    fn final_reparse_and_non_regular_entries_are_rejected_from_opened_handles() {
        let directory = tempfile::tempdir().expect("temp directory");
        let root = directory.path().join("data");
        let outside = directory.path().join("outside");
        fs::create_dir_all(&outside).expect("creates outside");
        let sentinel = outside.join("sentinel.txt");
        fs::write(&sentinel, b"outside bytes").expect("writes sentinel");
        let safe =
            SafeDirectory::open_or_create(&root, &["drafts", "v1"], Arc::new(NoopPathSafetyHook))
                .expect("opens safe directory");

        let final_reparse = safe.path().join(format!("{FIRST_ID}.json"));
        create_junction(&final_reparse, &outside).expect("creates final-entry junction");
        safe.open_existing_file(format!("{FIRST_ID}.json"))
            .expect_err("final reparse must reject");
        assert_eq!(
            fs::read(&sentinel).expect("outside survives"),
            b"outside bytes"
        );

        let non_regular = safe.path().join(format!("{SECOND_ID}.json"));
        fs::create_dir(&non_regular).expect("creates non-regular entry");
        safe.open_existing_file(format!("{SECOND_ID}.json"))
            .expect_err("directory masquerading as json must reject");

        drop(safe);
        fs::remove_dir(&final_reparse).expect("removes junction only");
    }

    struct SwapBeforeOpen {
        target: PathBuf,
        parked: PathBuf,
        outside: PathBuf,
        fired: AtomicBool,
    }

    impl PathSafetyHook for SwapBeforeOpen {
        fn before_open(&self, path: &Path) -> io::Result<()> {
            if path.file_name() == self.target.file_name()
                && !self.fired.swap(true, Ordering::SeqCst)
            {
                fs::rename(&self.target, &self.parked)?;
                #[cfg(windows)]
                create_junction(&self.target, &self.outside)?;
            }
            Ok(())
        }
    }

    #[cfg(windows)]
    #[test]
    fn deterministic_precheck_open_swap_is_detected_by_the_opened_handle() {
        let directory = tempfile::tempdir().expect("temp directory");
        let root = directory.path().join("data");
        let target = root.join("drafts");
        let parked = root.join("drafts-before-swap");
        let outside = directory.path().join("outside");
        fs::create_dir_all(&target).expect("creates draft parent");
        fs::create_dir_all(&outside).expect("creates outside");
        let sentinel = outside.join("sentinel.txt");
        fs::write(&sentinel, b"outside bytes").expect("writes sentinel");
        let hook = Arc::new(SwapBeforeOpen {
            target: target.clone(),
            parked: parked.clone(),
            outside: outside.clone(),
            fired: AtomicBool::new(false),
        });

        SafeDirectory::open_or_create(&root, &["drafts", "v1"], hook.clone())
            .expect_err("swapped component must reject");

        assert!(hook.fired.load(Ordering::SeqCst));
        assert_eq!(
            fs::read(&sentinel).expect("outside survives"),
            b"outside bytes"
        );
        assert!(!outside.join("v1").exists(), "swapped path escaped root");
        fs::remove_dir(&target).expect("removes junction only");
        fs::rename(parked, target).expect("restores real directory");
    }
}
