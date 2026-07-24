use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    process::{Command, Output},
};
use thiserror::Error;

const MAX_PACKAGE_JSON_BYTES: u64 = 1024 * 1024;
const MAX_PLANNED_TARGETS: usize = 256;
const MAX_TARGET_LENGTH: usize = 512;

const CONTENT_TYPES: [&str; 11] = [
    "team-news",
    "research-output",
    "research-project",
    "learning-resource",
    "algae-profile",
    "live-feed-profile",
    "coastal-observation",
    "science-article",
    "team-member",
    "collaboration",
    "research-profile",
];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryDryRunRequest {
    pub repository_path: String,
    pub record_id: String,
    pub content_type: String,
    pub branch_name: String,
    pub content_targets: Vec<String>,
    pub image_targets: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDiagnostic {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    pub name: String,
    pub command: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDiagnostics {
    pub selected_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_root: Option<String>,
    pub is_git_repository: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_clean: Option<bool>,
    pub status: Vec<String>,
    pub remotes: Vec<String>,
    pub git: ToolDiagnostic,
    pub node: ToolDiagnostic,
    pub project_scripts: Vec<ProjectScript>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTarget {
    pub path: String,
    pub category: String,
    pub state: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunConflict {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedGitOperation {
    pub program: String,
    pub args: Vec<String>,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDryRunResult {
    pub diagnostics: RepositoryDiagnostics,
    pub content_targets: Vec<PlannedTarget>,
    pub image_targets: Vec<PlannedTarget>,
    pub conflicts: Vec<DryRunConflict>,
    pub planned_git_operations: Vec<PlannedGitOperation>,
    pub repository_ready: bool,
}

#[derive(Debug, Error)]
enum RepositoryError {
    #[error("repository path must be an existing absolute directory")]
    InvalidRepositoryPath,
    #[error("repository path contains a link or reparse point")]
    UnsafeRepositoryPath,
    #[error("export dry-run request is invalid: {0}")]
    InvalidRequest(&'static str),
    #[error("repository inspection failed: {0}")]
    Storage(#[from] std::io::Error),
}

type RepositoryResult<T> = Result<T, RepositoryError>;

#[tauri::command]
pub fn repository_export_dry_run(
    request: RepositoryDryRunRequest,
) -> Result<RepositoryDryRunResult, String> {
    inspect_repository_export(request).map_err(|error| error.to_string())
}

fn inspect_repository_export(
    mut request: RepositoryDryRunRequest,
) -> RepositoryResult<RepositoryDryRunResult> {
    validate_request(&request)?;
    request.content_targets.sort();
    request.image_targets.sort();

    let selected = canonical_selected_directory(&request.repository_path)?;
    let selected_display = display_path(&selected);
    let git = tool_diagnostic("git", &["--version"]);
    let node = tool_diagnostic("node", &["--version"]);
    let (project_scripts, package_conflict) = inspect_project_scripts(&selected)?;
    let mut conflicts = Vec::new();
    if let Some(conflict) = package_conflict {
        conflicts.push(conflict);
    }
    if !git.available {
        conflicts.push(conflict(
            "GIT_UNAVAILABLE",
            None,
            "未检测到 Git，不能诊断所选仓库。",
        ));
    }
    if !node.available {
        conflicts.push(conflict(
            "NODE_UNAVAILABLE",
            None,
            "未检测到 Node，不能确认项目脚本运行环境。",
        ));
    }

    let mut diagnostics = RepositoryDiagnostics {
        selected_path: selected_display,
        canonical_root: None,
        is_git_repository: false,
        current_branch: None,
        head_sha: None,
        worktree_clean: None,
        status: Vec::new(),
        remotes: Vec::new(),
        git,
        node,
        project_scripts,
    };
    let mut target_root = None;

    if diagnostics.git.available {
        match git_stdout(&selected, &["rev-parse", "--show-toplevel"]) {
            Ok(root_output) => {
                let reported_root = PathBuf::from(root_output);
                let canonical_root = fs::canonicalize(reported_root)
                    .map_err(|_| RepositoryError::InvalidRepositoryPath)?;
                diagnostics.canonical_root = Some(display_path(&canonical_root));
                diagnostics.is_git_repository = true;

                if !paths_equal(&selected, &canonical_root) {
                    conflicts.push(conflict(
                        "REPOSITORY_ROOT_REQUIRED",
                        None,
                        "请选择 Git worktree 的根目录，不能选择其子目录。",
                    ));
                } else {
                    target_root = Some(canonical_root.clone());
                }

                diagnostics.head_sha =
                    git_stdout(&canonical_root, &["rev-parse", "--verify", "HEAD"]).ok();
                if diagnostics.head_sha.is_none() {
                    conflicts.push(conflict(
                        "HEAD_UNAVAILABLE",
                        None,
                        "仓库没有可用的 HEAD commit。",
                    ));
                }

                diagnostics.current_branch = git_stdout(
                    &canonical_root,
                    &["symbolic-ref", "--quiet", "--short", "HEAD"],
                )
                .ok();
                if diagnostics.current_branch.is_none() {
                    conflicts.push(conflict(
                        "DETACHED_HEAD",
                        None,
                        "仓库当前处于 detached HEAD 状态。",
                    ));
                }

                diagnostics.status = git_stdout(
                    &canonical_root,
                    &["status", "--porcelain=v1", "--untracked-files=all"],
                )
                .map(|output| output.lines().map(str::to_owned).collect())
                .unwrap_or_else(|_| vec!["状态读取失败".to_owned()]);
                diagnostics.worktree_clean = Some(diagnostics.status.is_empty());
                if !diagnostics.status.is_empty() {
                    conflicts.push(conflict(
                        "WORKTREE_DIRTY",
                        None,
                        "工作区包含已修改、已暂存或未跟踪文件。",
                    ));
                }

                diagnostics.remotes = git_stdout(&canonical_root, &["remote"])
                    .map(|output| output.lines().map(str::to_owned).collect())
                    .unwrap_or_default();
                if !diagnostics.remotes.is_empty() {
                    conflicts.push(conflict(
                        "REMOTE_PRESENT",
                        None,
                        "Worker 仓库存在 remote，导出流程必须停止。",
                    ));
                }

                if git_succeeds(
                    &canonical_root,
                    &[
                        "show-ref",
                        "--verify",
                        "--quiet",
                        &format!("refs/heads/{}", request.branch_name),
                    ],
                ) {
                    conflicts.push(conflict(
                        "BRANCH_EXISTS",
                        None,
                        "拟创建的本地内容分支已经存在。",
                    ));
                }

                if git_operation_in_progress(&canonical_root) {
                    conflicts.push(conflict(
                        "GIT_OPERATION_IN_PROGRESS",
                        None,
                        "仓库存在未完成的 merge、rebase、cherry-pick 或 revert。",
                    ));
                }
            }
            Err(_) => conflicts.push(conflict(
                "NOT_GIT_REPOSITORY",
                None,
                "所选目录不是 Git worktree。",
            )),
        }
    }

    let content_targets = inspect_targets(
        target_root.as_deref(),
        &request.content_targets,
        "content",
        &mut conflicts,
    )?;
    let image_targets = inspect_targets(
        target_root.as_deref(),
        &request.image_targets,
        "image",
        &mut conflicts,
    )?;
    let planned_git_operations = planned_git_operations(&request);
    let repository_ready = diagnostics.is_git_repository && conflicts.is_empty();

    Ok(RepositoryDryRunResult {
        diagnostics,
        content_targets,
        image_targets,
        conflicts,
        planned_git_operations,
        repository_ready,
    })
}

fn validate_request(request: &RepositoryDryRunRequest) -> RepositoryResult<()> {
    if !is_stable_id(&request.record_id) {
        return Err(RepositoryError::InvalidRequest("recordId"));
    }
    if !CONTENT_TYPES.contains(&request.content_type.as_str()) {
        return Err(RepositoryError::InvalidRequest("contentType"));
    }
    if !valid_branch_name(&request.branch_name, &request.record_id) {
        return Err(RepositoryError::InvalidRequest("branchName"));
    }
    let count = request.content_targets.len() + request.image_targets.len();
    if count == 0 || count > MAX_PLANNED_TARGETS {
        return Err(RepositoryError::InvalidRequest("target count"));
    }

    let required_record = format!(
        "content/records/{}/{}/record.json",
        request.content_type, request.record_id
    );
    if !request
        .content_targets
        .iter()
        .any(|path| path == &required_record)
    {
        return Err(RepositoryError::InvalidRequest("record target"));
    }

    let mut normalized = HashSet::new();
    for path in &request.content_targets {
        validate_content_target(path, &request.content_type, &request.record_id)?;
        if !normalized.insert(path.to_ascii_lowercase()) {
            return Err(RepositoryError::InvalidRequest("duplicate target"));
        }
    }
    for path in &request.image_targets {
        validate_image_target(path)?;
        if !normalized.insert(path.to_ascii_lowercase()) {
            return Err(RepositoryError::InvalidRequest("duplicate target"));
        }
    }

    let metadata_ids = request
        .content_targets
        .iter()
        .filter_map(|path| media_metadata_id(path))
        .collect::<HashSet<_>>();
    for path in &request.image_targets {
        let image_id =
            image_target_id(path).ok_or(RepositoryError::InvalidRequest("image target id"))?;
        if !metadata_ids.contains(image_id) {
            return Err(RepositoryError::InvalidRequest("image metadata target"));
        }
    }
    Ok(())
}

fn canonical_selected_directory(value: &str) -> RepositoryResult<PathBuf> {
    if value.trim().is_empty() || value.contains('\0') {
        return Err(RepositoryError::InvalidRepositoryPath);
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(RepositoryError::InvalidRepositoryPath);
    }
    ensure_no_link_components(&path)?;
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| RepositoryError::InvalidRepositoryPath)?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(RepositoryError::InvalidRepositoryPath);
    }
    fs::canonicalize(path).map_err(|_| RepositoryError::InvalidRepositoryPath)
}

fn inspect_project_scripts(
    root: &Path,
) -> RepositoryResult<(Vec<ProjectScript>, Option<DryRunConflict>)> {
    let package_path = root.join("package.json");
    let metadata = match fs::symlink_metadata(&package_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((
                Vec::new(),
                Some(conflict(
                    "PACKAGE_JSON_MISSING",
                    Some("package.json"),
                    "仓库根目录缺少 package.json。",
                )),
            ));
        }
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file()
        || is_link_or_reparse_point(&metadata)
        || metadata.len() > MAX_PACKAGE_JSON_BYTES
    {
        return Ok((
            Vec::new(),
            Some(conflict(
                "PACKAGE_JSON_INVALID",
                Some("package.json"),
                "package.json 不是可安全读取的常规文件。",
            )),
        ));
    }
    let bytes = fs::read(package_path)?;
    let value: Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(_) => {
            return Ok((
                Vec::new(),
                Some(conflict(
                    "PACKAGE_JSON_INVALID",
                    Some("package.json"),
                    "package.json 不是有效 JSON。",
                )),
            ));
        }
    };
    let mut scripts = value
        .get("scripts")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|scripts| scripts.iter())
        .filter_map(|(name, command)| {
            command.as_str().map(|command| ProjectScript {
                name: name.clone(),
                command: command.to_owned(),
            })
        })
        .collect::<Vec<_>>();
    scripts.sort_by(|left, right| left.name.cmp(&right.name));
    Ok((scripts, None))
}

fn inspect_targets(
    root: Option<&Path>,
    paths: &[String],
    category: &str,
    conflicts: &mut Vec<DryRunConflict>,
) -> RepositoryResult<Vec<PlannedTarget>> {
    paths
        .iter()
        .map(|relative| {
            let state = if let Some(root) = root {
                match inspect_target(root, relative)? {
                    TargetInspection::New => "new",
                    TargetInspection::Existing => {
                        conflicts.push(conflict(
                            "TARGET_EXISTS",
                            Some(relative),
                            "目标路径已存在，本次 dry-run 不允许覆盖。",
                        ));
                        "existing"
                    }
                    TargetInspection::CaseConflict => {
                        conflicts.push(conflict(
                            "PATH_CASE_CONFLICT",
                            Some(relative),
                            "目标路径与仓库中的现有路径仅大小写不同。",
                        ));
                        "case-conflict"
                    }
                    TargetInspection::Unsafe => {
                        conflicts.push(conflict(
                            "UNSAFE_TARGET_PATH",
                            Some(relative),
                            "目标路径包含符号链接、junction 或其他 reparse point。",
                        ));
                        "unsafe"
                    }
                }
            } else {
                "unchecked"
            };
            Ok(PlannedTarget {
                path: relative.clone(),
                category: category.to_owned(),
                state: state.to_owned(),
            })
        })
        .collect()
}

enum TargetInspection {
    New,
    Existing,
    CaseConflict,
    Unsafe,
}

fn inspect_target(root: &Path, relative: &str) -> RepositoryResult<TargetInspection> {
    let mut current = root.to_path_buf();
    for segment in relative.split('/') {
        if !current.is_dir() {
            return Ok(TargetInspection::Unsafe);
        }

        let mut exact = None;
        let mut collision = None;
        for entry in fs::read_dir(&current)? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if name == segment {
                exact = Some(entry.path());
                break;
            }
            if name.eq_ignore_ascii_case(segment) {
                collision = Some(entry.path());
            }
        }
        if let Some(collision) = collision {
            let metadata = fs::symlink_metadata(collision)?;
            return Ok(if is_link_or_reparse_point(&metadata) {
                TargetInspection::Unsafe
            } else {
                TargetInspection::CaseConflict
            });
        }
        let Some(exact) = exact else {
            return Ok(TargetInspection::New);
        };
        let metadata = fs::symlink_metadata(&exact)?;
        if is_link_or_reparse_point(&metadata) {
            return Ok(TargetInspection::Unsafe);
        }
        current = exact;
    }
    Ok(TargetInspection::Existing)
}

fn planned_git_operations(request: &RepositoryDryRunRequest) -> Vec<PlannedGitOperation> {
    let mut paths = request
        .content_targets
        .iter()
        .chain(&request.image_targets)
        .cloned()
        .collect::<Vec<_>>();
    paths.sort();

    let mut add_args = vec!["add".to_owned(), "--".to_owned()];
    add_args.extend(paths.iter().cloned());
    let mut verify_args = vec![
        "diff".to_owned(),
        "--cached".to_owned(),
        "--name-only".to_owned(),
        "--".to_owned(),
    ];
    verify_args.extend(paths);

    vec![
        PlannedGitOperation {
            program: "git".to_owned(),
            args: vec![
                "switch".to_owned(),
                "-c".to_owned(),
                request.branch_name.clone(),
            ],
            description: "创建本地内容分支".to_owned(),
        },
        PlannedGitOperation {
            program: "git".to_owned(),
            args: add_args,
            description: "仅暂存计划内文件".to_owned(),
        },
        PlannedGitOperation {
            program: "git".to_owned(),
            args: verify_args,
            description: "复核暂存文件清单".to_owned(),
        },
        PlannedGitOperation {
            program: "git".to_owned(),
            args: vec![
                "commit".to_owned(),
                "-m".to_owned(),
                format!("content: publish {}", request.record_id),
            ],
            description: "创建本地内容提交".to_owned(),
        },
        PlannedGitOperation {
            program: "git".to_owned(),
            args: vec!["status".to_owned(), "--short".to_owned()],
            description: "确认提交后工作区干净".to_owned(),
        },
    ]
}

fn validate_content_target(
    path: &str,
    content_type: &str,
    record_id: &str,
) -> RepositoryResult<()> {
    validate_relative_path(path)?;
    let record_prefix = format!("content/records/{content_type}/{record_id}/");
    if let Some(file_name) = path.strip_prefix(&record_prefix) {
        if matches!(file_name, "record.json" | "zh.md" | "en.md") {
            return Ok(());
        }
    }
    if media_metadata_id(path).is_some() {
        return Ok(());
    }
    Err(RepositoryError::InvalidRequest("content target"))
}

fn validate_image_target(path: &str) -> RepositoryResult<()> {
    validate_relative_path(path)?;
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() != 6
        || parts[0] != "public"
        || parts[1] != "images"
        || parts[2] != "uploads"
        || parts[3].len() != 4
        || !parts[3].bytes().all(|byte| byte.is_ascii_digit())
        || !matches!(
            parts[4],
            "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"
        )
        || image_file_id(parts[5]).is_none()
    {
        return Err(RepositoryError::InvalidRequest("image target"));
    }
    Ok(())
}

fn validate_relative_path(path: &str) -> RepositoryResult<()> {
    if path.is_empty()
        || path.len() > MAX_TARGET_LENGTH
        || path.contains('\\')
        || path.starts_with('/')
        || path.ends_with('/')
        || path.contains("//")
        || Path::new(path).is_absolute()
    {
        return Err(RepositoryError::InvalidRequest("target path"));
    }
    let components = Path::new(path).components().collect::<Vec<_>>();
    if components.is_empty()
        || components
            .iter()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(RepositoryError::InvalidRequest("target path"));
    }
    for segment in path.split('/') {
        if !valid_windows_segment(segment) {
            return Err(RepositoryError::InvalidRequest("target path segment"));
        }
    }
    Ok(())
}

fn valid_windows_segment(value: &str) -> bool {
    if value.is_empty()
        || value.ends_with(['.', ' '])
        || value.chars().any(|character| {
            character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
        })
    {
        return false;
    }
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    !matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn media_metadata_id(path: &str) -> Option<&str> {
    let id = path.strip_prefix("content/media/")?.strip_suffix(".json")?;
    is_stable_id(id).then_some(id)
}

fn image_target_id(path: &str) -> Option<&str> {
    image_file_id(path.rsplit('/').next()?)
}

fn image_file_id(file_name: &str) -> Option<&str> {
    for suffix in [".thumbnail.webp", ".webp", ".jpeg", ".jpg", ".png", ".avif"] {
        if let Some(id) = file_name.strip_suffix(suffix) {
            return is_stable_id(id).then_some(id);
        }
    }
    None
}

fn is_stable_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn valid_branch_name(value: &str, record_id: &str) -> bool {
    let Some(suffix) = value.strip_prefix("content/") else {
        return false;
    };
    let Some((date, id)) = suffix.split_once('-') else {
        return false;
    };
    date.len() == 8 && date.bytes().all(|byte| byte.is_ascii_digit()) && id == record_id
}

fn tool_diagnostic(program: &str, args: &[&str]) -> ToolDiagnostic {
    match Command::new(program).args(args).output() {
        Ok(output) if output.status.success() => ToolDiagnostic {
            available: true,
            version: Some(stdout(&output)),
        },
        _ => ToolDiagnostic {
            available: false,
            version: None,
        },
    }
}

fn git_command(root: &Path, args: &[&str]) -> std::io::Result<Output> {
    Command::new("git")
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
        .output()
}

fn git_stdout(root: &Path, args: &[&str]) -> std::io::Result<String> {
    let output = git_command(root, args)?;
    if output.status.success() {
        Ok(stdout(&output))
    } else {
        Err(std::io::Error::other("git command failed"))
    }
}

fn git_succeeds(root: &Path, args: &[&str]) -> bool {
    git_command(root, args)
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_owned()
}

fn git_operation_in_progress(root: &Path) -> bool {
    [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
    ]
    .iter()
    .any(|marker| {
        git_stdout(root, &["rev-parse", "--git-path", marker])
            .map(PathBuf::from)
            .map(|path| {
                if path.is_absolute() {
                    path.exists()
                } else {
                    root.join(path).exists()
                }
            })
            .unwrap_or(false)
    })
}

fn ensure_no_link_components(path: &Path) -> RepositoryResult<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if !current.exists() {
            continue;
        }
        let metadata = fs::symlink_metadata(&current)?;
        if is_link_or_reparse_point(&metadata) {
            return Err(RepositoryError::UnsafeRepositoryPath);
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

fn paths_equal(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        display_path(left).eq_ignore_ascii_case(&display_path(right))
    } else {
        left == right
    }
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn conflict(code: &str, path: Option<&str>, message: &str) -> DryRunConflict {
    DryRunConflict {
        code: code.to_owned(),
        path: path.map(str::to_owned),
        message: message.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::{inspect_repository_export, RepositoryDryRunRequest, RepositoryDryRunResult};
    use std::{
        collections::BTreeMap,
        fs,
        path::{Path, PathBuf},
        process::Command,
    };
    use tempfile::tempdir;

    const RECORD_ID: &str = "fictional-dry-run";

    fn git(root: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(args)
            .current_dir(root)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("runs git fixture command");
        assert!(
            output.status.success(),
            "git fixture command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_owned()
    }

    fn repository_fixture() -> (tempfile::TempDir, PathBuf) {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("repository");
        fs::create_dir(&root).expect("creates repository directory");
        fs::write(
            root.join("package.json"),
            b"{\n  \"scripts\": {\n    \"check\": \"tsc --noEmit\",\n    \"test\": \"vitest run\"\n  }\n}\n",
        )
        .expect("writes package fixture");
        git(&root, &["init", "-b", "main"]);
        git(&root, &["config", "user.name", "Dry Run Test"]);
        git(&root, &["config", "user.email", "dry-run@example.invalid"]);
        git(&root, &["add", "--", "package.json"]);
        git(&root, &["commit", "-m", "test: initialize repository"]);
        git(&root, &["status", "--short"]);
        (temporary, root)
    }

    fn request(root: &Path) -> RepositoryDryRunRequest {
        let image_id = "22222222-2222-4222-8222-222222222222";
        RepositoryDryRunRequest {
            repository_path: root.to_string_lossy().into_owned(),
            record_id: RECORD_ID.to_owned(),
            content_type: "science-article".to_owned(),
            branch_name: format!("content/20260724-{RECORD_ID}"),
            content_targets: vec![
                format!("content/records/science-article/{RECORD_ID}/record.json"),
                format!("content/records/science-article/{RECORD_ID}/zh.md"),
                format!("content/media/{image_id}.json"),
            ],
            image_targets: vec![
                format!("public/images/uploads/2026/07/{image_id}.webp"),
                format!("public/images/uploads/2026/07/{image_id}.thumbnail.webp"),
            ],
        }
    }

    fn snapshot(root: &Path) -> BTreeMap<String, Option<Vec<u8>>> {
        fn visit(root: &Path, current: &Path, snapshot: &mut BTreeMap<String, Option<Vec<u8>>>) {
            let mut entries = fs::read_dir(current)
                .expect("reads snapshot directory")
                .collect::<Result<Vec<_>, _>>()
                .expect("reads snapshot entries");
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                let relative = path
                    .strip_prefix(root)
                    .expect("relative snapshot path")
                    .to_string_lossy()
                    .replace('\\', "/");
                let metadata = fs::symlink_metadata(&path).expect("reads snapshot metadata");
                if metadata.is_dir() {
                    snapshot.insert(format!("{relative}/"), None);
                    visit(root, &path, snapshot);
                } else {
                    snapshot.insert(relative, Some(fs::read(path).expect("reads snapshot file")));
                }
            }
        }

        let mut result = BTreeMap::new();
        visit(root, root, &mut result);
        result
    }

    fn conflict_codes(result: &RepositoryDryRunResult) -> Vec<&str> {
        result
            .conflicts
            .iter()
            .map(|conflict| conflict.code.as_str())
            .collect()
    }

    #[test]
    fn dry_run_reports_repository_and_targets_without_writing_any_byte() {
        let (_temporary, root) = repository_fixture();
        let before = snapshot(&root);
        let head_before = git(&root, &["rev-parse", "HEAD"]);

        let result = inspect_repository_export(request(&root)).expect("runs dry-run");

        assert!(result.repository_ready);
        assert!(result.conflicts.is_empty());
        assert!(result.diagnostics.is_git_repository);
        assert_eq!(result.diagnostics.current_branch.as_deref(), Some("main"));
        assert_eq!(result.diagnostics.worktree_clean, Some(true));
        assert_eq!(result.diagnostics.remotes, Vec::<String>::new());
        assert_eq!(
            result
                .diagnostics
                .project_scripts
                .iter()
                .map(|script| script.name.as_str())
                .collect::<Vec<_>>(),
            vec!["check", "test"]
        );
        assert!(result
            .content_targets
            .iter()
            .chain(&result.image_targets)
            .all(|target| target.state == "new"));
        assert_eq!(result.planned_git_operations.len(), 5);

        assert_eq!(snapshot(&root), before, "dry-run changed repository bytes");
        assert_eq!(git(&root, &["rev-parse", "HEAD"]), head_before);
        assert!(git(&root, &["status", "--short"]).is_empty());
    }

    #[test]
    fn dry_run_reports_existing_targets_dirty_state_remote_and_branch_conflicts() {
        let (_temporary, root) = repository_fixture();
        let record_root = root
            .join("content")
            .join("records")
            .join("science-article")
            .join(RECORD_ID);
        fs::create_dir_all(&record_root).expect("creates existing record directory");
        fs::write(record_root.join("record.json"), b"{}\n").expect("writes conflict target");
        fs::write(root.join("operator-note.txt"), b"keep\n").expect("writes dirty sentinel");
        git(
            &root,
            &[
                "remote",
                "add",
                "origin",
                "https://example.invalid/repository.git",
            ],
        );
        git(&root, &["branch", &format!("content/20260724-{RECORD_ID}")]);
        let before = snapshot(&root);

        let result = inspect_repository_export(request(&root)).expect("runs conflicting dry-run");
        let codes = conflict_codes(&result);

        assert!(!result.repository_ready);
        assert!(codes.contains(&"TARGET_EXISTS"));
        assert!(codes.contains(&"WORKTREE_DIRTY"));
        assert!(codes.contains(&"REMOTE_PRESENT"));
        assert!(codes.contains(&"BRANCH_EXISTS"));
        assert_eq!(
            snapshot(&root),
            before,
            "conflict scan changed repository bytes"
        );
        assert_eq!(fs::read(root.join("operator-note.txt")).unwrap(), b"keep\n");
    }

    #[test]
    fn non_repository_is_reported_without_mutation() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("not-a-repository");
        fs::create_dir(&root).expect("creates selected directory");
        fs::write(root.join("package.json"), b"{\"scripts\":{}}\n")
            .expect("writes package fixture");
        let before = snapshot(&root);

        let result = inspect_repository_export(request(&root)).expect("reports non-repository");

        assert!(!result.diagnostics.is_git_repository);
        assert!(!result.repository_ready);
        assert!(conflict_codes(&result).contains(&"NOT_GIT_REPOSITORY"));
        assert!(result
            .content_targets
            .iter()
            .chain(&result.image_targets)
            .all(|target| target.state == "unchecked"));
        assert_eq!(snapshot(&root), before);
    }

    #[test]
    fn unsafe_or_out_of_allowlist_targets_are_rejected() {
        let (_temporary, root) = repository_fixture();
        let mut traversal = request(&root);
        traversal.content_targets.push("../outside.txt".to_owned());
        assert!(inspect_repository_export(traversal).is_err());

        let mut code_target = request(&root);
        code_target.content_targets.push("package.json".to_owned());
        assert!(inspect_repository_export(code_target).is_err());

        let mut missing_metadata = request(&root);
        missing_metadata
            .content_targets
            .retain(|path| !path.starts_with("content/media/"));
        assert!(inspect_repository_export(missing_metadata).is_err());
    }

    #[test]
    fn case_colliding_target_is_reported_without_writing() {
        let (_temporary, root) = repository_fixture();
        fs::create_dir(root.join("Content")).expect("creates case-collision fixture");
        let before = snapshot(&root);

        let result = inspect_repository_export(request(&root)).expect("reports case collision");

        assert!(!result.repository_ready);
        assert!(conflict_codes(&result).contains(&"PATH_CASE_CONFLICT"));
        assert_eq!(snapshot(&root), before);
    }
}
