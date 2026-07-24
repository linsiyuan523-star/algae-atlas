use crate::drafts::{install_atomically, sync_directory};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Output},
    sync::{Mutex, MutexGuard},
};
use thiserror::Error;
use uuid::Uuid;

const CONFIG_FORMAT_VERSION: u32 = 1;
const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const CONFIG_FILE_NAME: &str = "configuration.json";
const PROBE_FILE_PREFIX: &str = ".content-workbench-access-";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OnboardingConfiguration {
    pub format_version: u32,
    pub repository_path: String,
    pub drafts_directory: String,
    pub staging_directory: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveOnboardingConfigurationRequest {
    pub repository_path: String,
    pub drafts_directory: String,
    pub staging_directory: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePaths {
    pub drafts_directory: String,
    pub staging_directory: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDiagnostic {
    pub id: String,
    pub label: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathDiagnostic {
    pub id: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub readable: bool,
    pub writable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalGitDiagnostic {
    pub inspected: bool,
    pub is_repository: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_clean: Option<bool>,
    pub status_entries: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCapabilityDiagnostic {
    pub supported_input_formats: Vec<String>,
    pub output_format: String,
    pub max_source_bytes: u64,
    pub privacy_metadata_removed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationDataDiagnostic {
    pub app_data_directory: String,
    pub configuration_file: String,
    pub draft_count: usize,
    pub staged_image_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupDiagnostics {
    pub tools: Vec<ToolDiagnostic>,
    pub paths: Vec<PathDiagnostic>,
    pub local_git: LocalGitDiagnostic,
    pub image_capabilities: ImageCapabilityDiagnostic,
    pub application_data: ApplicationDataDiagnostic,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStatus {
    pub configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration: Option<OnboardingConfiguration>,
    pub defaults: StoragePaths,
    pub active_storage: StoragePaths,
    pub restart_required: bool,
    pub diagnostics: StartupDiagnostics,
}

#[derive(Debug, Error)]
pub(crate) enum OnboardingError {
    #[error("onboarding storage path is not safe")]
    UnsafePath,
    #[error("{0} must be an existing absolute directory")]
    InvalidDirectory(&'static str),
    #[error("{0} cannot be read")]
    DirectoryUnreadable(&'static str),
    #[error("{0} cannot be written")]
    DirectoryUnwritable(&'static str),
    #[error("draft and staging directories must be different")]
    SharedStorageDirectory,
    #[error("onboarding storage is busy")]
    LockFailed,
    #[error("onboarding storage operation failed: {0}")]
    Storage(#[from] std::io::Error),
    #[error("onboarding configuration is invalid")]
    InvalidConfiguration,
    #[error("onboarding configuration serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

type OnboardingResult<T> = Result<T, OnboardingError>;

pub struct OnboardingStore {
    root: PathBuf,
    app_data_root: PathBuf,
    defaults: StorageRoots,
    active_storage: StorageRoots,
    configuration: Mutex<Option<OnboardingConfiguration>>,
    operation_lock: Mutex<()>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StorageRoots {
    pub(crate) drafts: PathBuf,
    pub(crate) staging: PathBuf,
}

impl StorageRoots {
    fn serialize(&self) -> StoragePaths {
        StoragePaths {
            drafts_directory: display_path(&self.drafts),
            staging_directory: display_path(&self.staging),
        }
    }
}

impl OnboardingStore {
    pub fn new(
        root: PathBuf,
        app_data_root: PathBuf,
        defaults: StorageRoots,
        active_storage: StorageRoots,
    ) -> OnboardingResult<Self> {
        prepare_directory(&root)?;
        prepare_directory(&app_data_root)?;
        let configuration = load_configuration(&root)
            .ok()
            .flatten()
            .and_then(normalize_saved_configuration);
        Ok(Self {
            root,
            app_data_root,
            defaults,
            active_storage,
            configuration: Mutex::new(configuration),
            operation_lock: Mutex::new(()),
        })
    }

    pub fn status(&self) -> Result<OnboardingStatus, String> {
        self.status_inner().map_err(|error| error.to_string())
    }

    pub fn save_configuration(
        &self,
        request: SaveOnboardingConfigurationRequest,
    ) -> Result<OnboardingStatus, String> {
        self.save_configuration_inner(request)
            .and_then(|_| self.status_inner())
            .map_err(|error| error.to_string())
    }

    fn status_inner(&self) -> OnboardingResult<OnboardingStatus> {
        let configuration = self.configuration()?.clone();
        let diagnostics = self.inspect(&configuration);
        let restart_required = configuration
            .as_ref()
            .map(|value| {
                !same_path(
                    &self.active_storage.drafts,
                    Path::new(&value.drafts_directory),
                ) || !same_path(
                    &self.active_storage.staging,
                    Path::new(&value.staging_directory),
                )
            })
            .unwrap_or(false);

        Ok(OnboardingStatus {
            configured: configuration.is_some(),
            configuration,
            defaults: self.defaults.serialize(),
            active_storage: self.active_storage.serialize(),
            restart_required,
            diagnostics,
        })
    }

    fn save_configuration_inner(
        &self,
        request: SaveOnboardingConfigurationRequest,
    ) -> OnboardingResult<()> {
        let _operation = self.lock()?;
        let repository =
            validate_existing_directory(&request.repository_path, "repository directory", false)?;
        let drafts =
            validate_existing_directory(&request.drafts_directory, "draft directory", true)?;
        let staging =
            validate_existing_directory(&request.staging_directory, "staging directory", true)?;
        if same_path(&drafts, &staging) {
            return Err(OnboardingError::SharedStorageDirectory);
        }

        let configuration = OnboardingConfiguration {
            format_version: CONFIG_FORMAT_VERSION,
            repository_path: display_path(&repository),
            drafts_directory: display_path(&drafts),
            staging_directory: display_path(&staging),
        };
        self.write_configuration(&configuration)?;
        *self.configuration()? = Some(configuration);
        Ok(())
    }

    fn inspect(&self, configuration: &Option<OnboardingConfiguration>) -> StartupDiagnostics {
        let repository_path = configuration
            .as_ref()
            .map(|value| PathBuf::from(&value.repository_path));
        let configured_drafts = configuration
            .as_ref()
            .map(|value| PathBuf::from(&value.drafts_directory));
        let configured_staging = configuration
            .as_ref()
            .map(|value| PathBuf::from(&value.staging_directory));
        let git = tool_diagnostic("git", "Git", &["--version"]);
        let tools = vec![
            git.clone(),
            tool_diagnostic("node", "Node.js", &["--version"]),
            tool_diagnostic("rustc", "Rust", &["--version"]),
            msvc_diagnostic(),
            webview2_diagnostic(),
        ];
        let mut paths = vec![
            inspect_path("app-data", "应用数据目录", &self.app_data_root, true),
            inspect_path(
                "active-drafts",
                "当前草稿目录",
                &self.active_storage.drafts,
                true,
            ),
            inspect_path(
                "active-staging",
                "当前图片暂存目录",
                &self.active_storage.staging,
                true,
            ),
        ];
        if let Some(path) = repository_path.as_deref() {
            paths.push(inspect_path("repository", "本地仓库", path, true));
        }
        if let Some(path) = configured_drafts.as_deref() {
            paths.push(inspect_path(
                "configured-drafts",
                "已配置草稿目录",
                path,
                true,
            ));
        }
        if let Some(path) = configured_staging.as_deref() {
            paths.push(inspect_path(
                "configured-staging",
                "已配置图片暂存目录",
                path,
                true,
            ));
        }

        let local_git = inspect_local_git(repository_path.as_deref(), git.available);
        let application_data = ApplicationDataDiagnostic {
            app_data_directory: display_path(&self.app_data_root),
            configuration_file: display_path(&self.configuration_path()),
            draft_count: count_matching_files(&self.active_storage.drafts, |path| {
                path.extension().and_then(|value| value.to_str()) == Some("json")
            }),
            staged_image_count: count_staged_images(&self.active_storage.staging),
        };

        StartupDiagnostics {
            tools,
            paths,
            local_git,
            image_capabilities: ImageCapabilityDiagnostic {
                supported_input_formats: vec![
                    "JPEG".to_owned(),
                    "PNG".to_owned(),
                    "WebP".to_owned(),
                ],
                output_format: "WebP".to_owned(),
                max_source_bytes: 20 * 1024 * 1024,
                privacy_metadata_removed: true,
            },
            application_data,
        }
    }

    fn configuration(&self) -> OnboardingResult<MutexGuard<'_, Option<OnboardingConfiguration>>> {
        self.configuration
            .lock()
            .map_err(|_| OnboardingError::LockFailed)
    }

    fn lock(&self) -> OnboardingResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| OnboardingError::LockFailed)
    }

    fn configuration_path(&self) -> PathBuf {
        self.root.join(CONFIG_FILE_NAME)
    }

    fn write_configuration(&self, configuration: &OnboardingConfiguration) -> OnboardingResult<()> {
        prepare_directory(&self.root)?;
        let target = self.configuration_path();
        let mut bytes = serde_json::to_vec_pretty(configuration)?;
        bytes.push(b'\n');
        let temporary = self
            .root
            .join(format!(".configuration-{}.tmp", Uuid::new_v4()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        let result = (|| -> OnboardingResult<()> {
            file.write_all(&bytes)?;
            file.sync_all()?;
            install_atomically(&temporary, &target, !target.exists())?;
            sync_directory(&self.root)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}

pub(crate) fn default_storage_paths(app_data_root: &Path) -> StorageRoots {
    StorageRoots {
        drafts: app_data_root.join("drafts").join("v1"),
        staging: app_data_root.join("media-staging").join("v1"),
    }
}

pub(crate) fn configured_storage_paths(root: &Path, defaults: &StorageRoots) -> StorageRoots {
    let Some(configuration) = load_configuration(root)
        .ok()
        .flatten()
        .and_then(normalize_saved_configuration)
    else {
        return defaults.clone();
    };
    StorageRoots {
        drafts: PathBuf::from(configuration.drafts_directory),
        staging: PathBuf::from(configuration.staging_directory),
    }
}

pub(crate) fn prepare_storage_paths(paths: &StorageRoots) -> OnboardingResult<()> {
    prepare_directory(&paths.drafts)?;
    prepare_directory(&paths.staging)
}

#[tauri::command]
pub fn onboarding_status(
    store: tauri::State<'_, OnboardingStore>,
) -> Result<OnboardingStatus, String> {
    store.status()
}

#[tauri::command]
pub fn save_onboarding_configuration(
    store: tauri::State<'_, OnboardingStore>,
    request: SaveOnboardingConfigurationRequest,
) -> Result<OnboardingStatus, String> {
    store.save_configuration(request)
}

fn load_configuration(root: &Path) -> OnboardingResult<Option<OnboardingConfiguration>> {
    let target = root.join(CONFIG_FILE_NAME);
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file()
        || is_link_or_reparse_point(&metadata)
        || metadata.len() > MAX_CONFIG_BYTES
    {
        return Err(OnboardingError::InvalidConfiguration);
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&target)?
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(OnboardingError::InvalidConfiguration);
    }
    let configuration = serde_json::from_slice::<OnboardingConfiguration>(&bytes)?;
    if configuration.format_version != CONFIG_FORMAT_VERSION
        || configuration.repository_path.trim().is_empty()
        || configuration.drafts_directory.trim().is_empty()
        || configuration.staging_directory.trim().is_empty()
    {
        return Err(OnboardingError::InvalidConfiguration);
    }
    Ok(Some(configuration))
}

fn validate_existing_directory(
    value: &str,
    label: &'static str,
    require_write: bool,
) -> OnboardingResult<PathBuf> {
    let candidate = Path::new(value.trim());
    if !candidate.is_absolute() {
        return Err(OnboardingError::InvalidDirectory(label));
    }
    ensure_no_link_components(candidate)?;
    let canonical =
        fs::canonicalize(candidate).map_err(|_| OnboardingError::InvalidDirectory(label))?;
    let metadata =
        fs::symlink_metadata(&canonical).map_err(|_| OnboardingError::InvalidDirectory(label))?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(OnboardingError::InvalidDirectory(label));
    }
    fs::read_dir(&canonical).map_err(|_| OnboardingError::DirectoryUnreadable(label))?;
    if require_write {
        probe_write(&canonical).map_err(|_| OnboardingError::DirectoryUnwritable(label))?;
    }
    Ok(canonical)
}

fn normalize_saved_configuration(
    configuration: OnboardingConfiguration,
) -> Option<OnboardingConfiguration> {
    let repository = validate_existing_directory(
        &configuration.repository_path,
        "repository directory",
        false,
    )
    .ok()?;
    let drafts =
        validate_existing_directory(&configuration.drafts_directory, "draft directory", true)
            .ok()?;
    let staging =
        validate_existing_directory(&configuration.staging_directory, "staging directory", true)
            .ok()?;
    if same_path(&drafts, &staging) {
        return None;
    }
    Some(OnboardingConfiguration {
        format_version: CONFIG_FORMAT_VERSION,
        repository_path: display_path(&repository),
        drafts_directory: display_path(&drafts),
        staging_directory: display_path(&staging),
    })
}

fn inspect_path(id: &str, label: &str, path: &Path, probe_write_access: bool) -> PathDiagnostic {
    let display = display_path(path);
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            return PathDiagnostic {
                id: id.to_owned(),
                label: label.to_owned(),
                path: display,
                exists: false,
                is_directory: false,
                readable: false,
                writable: false,
                note: Some("目录不存在或无法读取。".to_owned()),
            };
        }
    };
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return PathDiagnostic {
            id: id.to_owned(),
            label: label.to_owned(),
            path: display,
            exists: true,
            is_directory: false,
            readable: false,
            writable: false,
            note: Some("路径不是安全的本地目录。".to_owned()),
        };
    }
    let readable = fs::read_dir(path).is_ok();
    let writable = probe_write_access && probe_write(path).is_ok();
    PathDiagnostic {
        id: id.to_owned(),
        label: label.to_owned(),
        path: display,
        exists: true,
        is_directory: true,
        readable,
        writable,
        note: if !readable {
            Some("当前账户没有读取权限。".to_owned())
        } else if probe_write_access && !writable {
            Some("当前账户没有写入权限。".to_owned())
        } else {
            None
        },
    }
}

fn inspect_local_git(repository: Option<&Path>, git_available: bool) -> LocalGitDiagnostic {
    let Some(repository) = repository else {
        return LocalGitDiagnostic {
            inspected: false,
            is_repository: false,
            branch: None,
            head_sha: None,
            worktree_clean: None,
            status_entries: 0,
        };
    };
    if !git_available {
        return LocalGitDiagnostic {
            inspected: true,
            is_repository: false,
            branch: None,
            head_sha: None,
            worktree_clean: None,
            status_entries: 0,
        };
    }
    let is_repository = git_stdout(repository, &["rev-parse", "--is-inside-work-tree"])
        .map(|value| value == "true")
        .unwrap_or(false);
    if !is_repository {
        return LocalGitDiagnostic {
            inspected: true,
            is_repository: false,
            branch: None,
            head_sha: None,
            worktree_clean: None,
            status_entries: 0,
        };
    }
    let status_entries = git_stdout(
        repository,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )
    .map(|value| value.lines().count())
    .unwrap_or(0);
    LocalGitDiagnostic {
        inspected: true,
        is_repository: true,
        branch: git_stdout(repository, &["symbolic-ref", "--quiet", "--short", "HEAD"]).ok(),
        head_sha: git_stdout(repository, &["rev-parse", "--verify", "HEAD"]).ok(),
        worktree_clean: Some(status_entries == 0),
        status_entries,
    }
}

fn tool_diagnostic(id: &str, label: &str, args: &[&str]) -> ToolDiagnostic {
    let output = Command::new(id).args(args).output();
    match output {
        Ok(output) if output.status.success() => ToolDiagnostic {
            id: id.to_owned(),
            label: label.to_owned(),
            available: true,
            version: output_summary(&output),
        },
        _ => ToolDiagnostic {
            id: id.to_owned(),
            label: label.to_owned(),
            available: false,
            version: None,
        },
    }
}

fn msvc_diagnostic() -> ToolDiagnostic {
    let found = Command::new("where.exe")
        .arg("cl.exe")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    if !found {
        return ToolDiagnostic {
            id: "msvc".to_owned(),
            label: "MSVC C++ Build Tools".to_owned(),
            available: false,
            version: None,
        };
    }
    let version = Command::new("cl.exe")
        .arg("/Bv")
        .output()
        .ok()
        .and_then(|output| output_summary(&output));
    ToolDiagnostic {
        id: "msvc".to_owned(),
        label: "MSVC C++ Build Tools".to_owned(),
        available: true,
        version,
    }
}

fn webview2_diagnostic() -> ToolDiagnostic {
    let output = Command::new("reg.exe")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients",
            "/s",
            "/f",
            "WebView2",
        ])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            let registry_output = String::from_utf8_lossy(&output.stdout);
            let key = registry_output
                .lines()
                .map(str::trim)
                .find(|line| line.starts_with("HKEY_"))
                .map(str::to_owned);
            let version = key.as_deref().and_then(|key| {
                Command::new("reg.exe")
                    .args(["query", key, "/v", "pv"])
                    .output()
                    .ok()
                    .filter(|version_output| version_output.status.success())
                    .and_then(|version_output| registry_value(&version_output, "pv"))
            });
            ToolDiagnostic {
                id: "webview2".to_owned(),
                label: "Microsoft Edge WebView2 Runtime".to_owned(),
                available: true,
                version,
            }
        }
        _ => ToolDiagnostic {
            id: "webview2".to_owned(),
            label: "Microsoft Edge WebView2 Runtime".to_owned(),
            available: false,
            version: None,
        },
    }
}

fn registry_value(output: &Output, name: &str) -> Option<String> {
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let value_name = parts.next()?;
            let value_type = parts.next()?;
            if value_name.eq_ignore_ascii_case(name) && value_type.starts_with("REG_") {
                let value = parts.collect::<Vec<_>>().join(" ");
                (!value.is_empty()).then_some(value)
            } else {
                None
            }
        })
}

fn output_summary(output: &Output) -> Option<String> {
    let output = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let summary = output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?
        .chars()
        .take(180)
        .collect::<String>();
    Some(summary)
}

fn git_stdout(root: &Path, args: &[&str]) -> std::io::Result<String> {
    let output = Command::new("git")
        .args([
            "--no-optional-locks",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.untrackedCache=false",
            "-c",
            "core.preloadindex=false",
        ])
        .args(args)
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    } else {
        Err(std::io::Error::other("git inspection failed"))
    }
}

fn count_matching_files(path: &Path, matches: impl Fn(&Path) -> bool) -> usize {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| matches(path))
        .count()
}

fn count_staged_images(path: &Path) -> usize {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            fs::symlink_metadata(&path)
                .ok()
                .filter(|metadata| metadata.is_dir() && !is_link_or_reparse_point(metadata))
                .map(|_| path)
        })
        .map(|draft_path| {
            count_matching_files(&draft_path, |file| {
                file.extension().and_then(|value| value.to_str()) == Some("json")
            })
        })
        .sum()
}

fn prepare_directory(path: &Path) -> OnboardingResult<()> {
    fs::create_dir_all(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(OnboardingError::UnsafePath);
    }
    Ok(())
}

fn probe_write(path: &Path) -> std::io::Result<()> {
    let probe = path.join(format!("{PROBE_FILE_PREFIX}{}", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)?;
    let write_result = file.write_all(b"probe\n").and_then(|_| file.sync_all());
    drop(file);
    let remove_result = fs::remove_file(&probe);
    match (write_result, remove_result) {
        (Err(error), _) => Err(error),
        (_, Err(error)) => Err(error),
        _ => Ok(()),
    }
}

fn ensure_no_link_components(path: &Path) -> OnboardingResult<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if !current.exists() {
            continue;
        }
        let metadata = fs::symlink_metadata(&current)?;
        if is_link_or_reparse_point(&metadata) {
            return Err(OnboardingError::UnsafePath);
        }
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

fn same_path(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    if cfg!(windows) {
        display_path(&left).eq_ignore_ascii_case(&display_path(&right))
    } else {
        left == right
    }
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(local) = value.strip_prefix(r"\\?\") {
            return local.to_owned();
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::{
        configured_storage_paths, default_storage_paths, same_path, OnboardingStore,
        SaveOnboardingConfigurationRequest,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn saves_paths_and_uses_them_on_the_next_launch() {
        let temporary = tempdir().expect("creates temporary directory");
        let app_data = temporary.path().join("app-data");
        let configuration_root = app_data.join("onboarding").join("v1");
        let repository = temporary.path().join("repository");
        let drafts = temporary.path().join("drafts");
        let staging = temporary.path().join("staging");
        fs::create_dir_all(&repository).expect("creates repository directory");
        fs::create_dir_all(&drafts).expect("creates drafts directory");
        fs::create_dir_all(&staging).expect("creates staging directory");
        let defaults = default_storage_paths(&app_data);
        fs::create_dir_all(&defaults.drafts).expect("creates default drafts directory");
        fs::create_dir_all(&defaults.staging).expect("creates default staging directory");
        let store = OnboardingStore::new(
            configuration_root.clone(),
            app_data,
            defaults.clone(),
            defaults.clone(),
        )
        .expect("starts onboarding store");

        assert!(!store.status().expect("reads status").configured);
        store
            .save_configuration(SaveOnboardingConfigurationRequest {
                repository_path: repository.to_string_lossy().into_owned(),
                drafts_directory: drafts.to_string_lossy().into_owned(),
                staging_directory: staging.to_string_lossy().into_owned(),
            })
            .expect("saves configuration");

        let resolved = configured_storage_paths(&configuration_root, &defaults);
        assert!(same_path(
            &resolved.drafts,
            &fs::canonicalize(drafts).expect("canonical drafts")
        ));
        assert!(same_path(
            &resolved.staging,
            &fs::canonicalize(staging).expect("canonical staging")
        ));
    }

    #[test]
    fn rejects_a_file_where_a_writable_storage_directory_is_required() {
        let temporary = tempdir().expect("creates temporary directory");
        let app_data = temporary.path().join("app-data");
        let configuration_root = app_data.join("onboarding").join("v1");
        let repository = temporary.path().join("repository");
        let staging = temporary.path().join("staging");
        let draft_file = temporary.path().join("not-a-directory");
        fs::create_dir_all(&repository).expect("creates repository directory");
        fs::create_dir_all(&staging).expect("creates staging directory");
        fs::write(&draft_file, b"fixture").expect("creates file fixture");
        let defaults = default_storage_paths(&app_data);
        fs::create_dir_all(&defaults.drafts).expect("creates default drafts directory");
        fs::create_dir_all(&defaults.staging).expect("creates default staging directory");
        let store = OnboardingStore::new(configuration_root, app_data, defaults.clone(), defaults)
            .expect("starts onboarding store");

        let error = store
            .save_configuration(SaveOnboardingConfigurationRequest {
                repository_path: repository.to_string_lossy().into_owned(),
                drafts_directory: draft_file.to_string_lossy().into_owned(),
                staging_directory: staging.to_string_lossy().into_owned(),
            })
            .expect_err("rejects file storage path");
        assert!(error.contains("draft directory"));
    }

    #[test]
    fn treats_a_saved_configuration_with_missing_storage_as_first_run() {
        let temporary = tempdir().expect("creates temporary directory");
        let app_data = temporary.path().join("app-data");
        let configuration_root = app_data.join("onboarding").join("v1");
        let repository = temporary.path().join("repository");
        let drafts = temporary.path().join("drafts");
        let staging = temporary.path().join("staging");
        fs::create_dir_all(&repository).expect("creates repository directory");
        fs::create_dir_all(&drafts).expect("creates drafts directory");
        fs::create_dir_all(&staging).expect("creates staging directory");
        let defaults = default_storage_paths(&app_data);
        fs::create_dir_all(&defaults.drafts).expect("creates default drafts directory");
        fs::create_dir_all(&defaults.staging).expect("creates default staging directory");
        let store = OnboardingStore::new(
            configuration_root.clone(),
            app_data.clone(),
            defaults.clone(),
            defaults.clone(),
        )
        .expect("starts onboarding store");
        store
            .save_configuration(SaveOnboardingConfigurationRequest {
                repository_path: repository.to_string_lossy().into_owned(),
                drafts_directory: drafts.to_string_lossy().into_owned(),
                staging_directory: staging.to_string_lossy().into_owned(),
            })
            .expect("saves configuration");
        fs::remove_dir_all(&staging).expect("removes staged storage fixture");

        let reopened =
            OnboardingStore::new(configuration_root, app_data, defaults.clone(), defaults)
                .expect("reopens onboarding store");
        assert!(!reopened.status().expect("reads reopened status").configured);
    }
}
