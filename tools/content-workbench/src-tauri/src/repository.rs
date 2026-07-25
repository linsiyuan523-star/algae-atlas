use crate::{
    drafts::{install_atomically, sync_directory},
    media::{sha256_hex, MediaStore},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashSet},
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Output},
    sync::{Mutex, MutexGuard},
};
use thiserror::Error;
use uuid::{Uuid, Version};

const MAX_PACKAGE_JSON_BYTES: u64 = 1024 * 1024;
const MAX_PLANNED_TARGETS: usize = 256;
const MAX_TARGET_LENGTH: usize = 512;
const MAX_TEXT_FILE_BYTES: usize = 2 * 1024 * 1024;
const MAX_PUBLICATION_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BUNDLE_BYTES: u64 = 512 * 1024 * 1024;

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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryTextFile {
    pub path: String,
    pub contents: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryImageFile {
    pub path: String,
    pub staged_name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryLocalCommitRequest {
    pub plan: RepositoryDryRunRequest,
    pub expected_head_sha: String,
    pub expected_base_branch: String,
    pub draft_id: String,
    pub text_files: Vec<RepositoryTextFile>,
    pub image_files: Vec<RepositoryImageFile>,
    pub confirmed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryLocalCommitResult {
    pub branch_name: String,
    pub previous_head_sha: String,
    pub commit_sha: String,
    pub commit_message: String,
    pub committed_paths: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryBundlePreflightRequest {
    pub repository_path: String,
    pub destination_directory: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryBundlePreflightResult {
    pub repository_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_repository_path: Option<String>,
    pub destination_directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_commit_sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_branch_name: Option<String>,
    pub changed_files: Vec<String>,
    pub conflicts: Vec<DryRunConflict>,
    pub ready: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryBundleExportRequest {
    pub repository_path: String,
    pub destination_directory: String,
    pub expected_branch_name: String,
    pub expected_head_sha: String,
    pub confirmed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryBundleExportResult {
    pub branch_name: String,
    pub head_sha: String,
    pub destination_directory: String,
    pub bundle_file_name: String,
    pub bundle_size_bytes: u64,
    pub sha256: String,
    pub import_branch_name: String,
    pub artifact_names: Vec<String>,
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
    #[error("local commit request is invalid: {0}")]
    InvalidCommitRequest(&'static str),
    #[error("bundle export request is invalid: {0}")]
    InvalidBundleRequest(&'static str),
    #[error("repository state blocks the local content commit")]
    RepositoryBlocked,
    #[error("repository state changed after the dry-run")]
    RepositoryChanged,
    #[error("repository state blocks the bundle export")]
    BundleBlocked,
    #[error("repository state changed after the bundle preflight")]
    BundleChanged,
    #[error("controlled Git operation failed: {0}")]
    Git(&'static str),
    #[error("publication staging is busy")]
    LockFailed,
    #[error("failed to restore the repository to its pre-operation state")]
    RollbackFailed,
    #[cfg(test)]
    #[error("injected local commit failure")]
    InjectedFailure,
}

type RepositoryResult<T> = Result<T, RepositoryError>;

pub struct RepositoryPublisher {
    staging_root: PathBuf,
    operation_lock: Mutex<()>,
}

impl RepositoryPublisher {
    pub fn new(staging_root: PathBuf) -> Self {
        Self {
            staging_root,
            operation_lock: Mutex::new(()),
        }
    }

    fn lock(&self) -> RepositoryResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| RepositoryError::LockFailed)
    }
}

#[tauri::command]
pub fn repository_export_dry_run(
    request: RepositoryDryRunRequest,
) -> Result<RepositoryDryRunResult, String> {
    inspect_repository_export(request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn repository_local_commit(
    publisher: tauri::State<'_, RepositoryPublisher>,
    media_store: tauri::State<'_, MediaStore>,
    request: RepositoryLocalCommitRequest,
) -> Result<RepositoryLocalCommitResult, String> {
    publish_local_commit(
        &publisher,
        request,
        |draft_id, staged_name| media_store.publication_asset(draft_id, staged_name),
        PublishFault::None,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn repository_bundle_preflight(
    request: RepositoryBundlePreflightRequest,
) -> Result<RepositoryBundlePreflightResult, String> {
    inspect_repository_bundle(request).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn repository_export_bundle(
    publisher: tauri::State<'_, RepositoryPublisher>,
    request: RepositoryBundleExportRequest,
) -> Result<RepositoryBundleExportResult, String> {
    export_repository_bundle(&publisher, request).map_err(|error| error.to_string())
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

fn inspect_repository_bundle(
    request: RepositoryBundlePreflightRequest,
) -> RepositoryResult<RepositoryBundlePreflightResult> {
    validate_bundle_preflight_request(&request)?;
    let selected = canonical_selected_directory(&request.repository_path)?;
    let destination = resolve_bundle_destination(&request.destination_directory)?;
    let mut conflicts = Vec::new();
    let mut canonical_repository_path = None;
    let mut branch_name = None;
    let mut head_sha = None;
    let mut base_commit_sha = None;
    let mut changed_files = Vec::new();

    if destination.exists {
        conflicts.push(conflict(
            "DESTINATION_EXISTS",
            Some(&display_path(&destination.directory)),
            "目标交接目录已经存在；Bundle 导出不会覆盖现有目录。",
        ));
    }
    if path_is_within(&destination.directory, &selected) {
        conflicts.push(conflict(
            "DESTINATION_INSIDE_REPOSITORY",
            Some(&display_path(&destination.directory)),
            "目标交接目录不能位于源仓库内。",
        ));
    }
    if !tool_diagnostic("git", &["--version"]).available {
        conflicts.push(conflict(
            "GIT_UNAVAILABLE",
            None,
            "未检测到 Git，不能创建离线 Bundle。",
        ));
    } else {
        match git_stdout(&selected, &["rev-parse", "--show-toplevel"]) {
            Ok(root_output) => {
                let reported_root = fs::canonicalize(PathBuf::from(root_output))
                    .map_err(|_| RepositoryError::InvalidRepositoryPath)?;
                if paths_equal(&reported_root, &selected) {
                    canonical_repository_path = Some(display_path(&reported_root));
                } else {
                    conflicts.push(conflict(
                        "REPOSITORY_ROOT_REQUIRED",
                        None,
                        "请选择 Git worktree 的根目录，不能选择其子目录。",
                    ));
                }

                let status = git_stdout(
                    &reported_root,
                    &["status", "--porcelain=v1", "--untracked-files=all"],
                );
                match status {
                    Ok(status) if status.is_empty() => {}
                    Ok(_) => conflicts.push(conflict(
                        "WORKTREE_DIRTY",
                        None,
                        "工作区包含已修改、已暂存或未跟踪文件。",
                    )),
                    Err(_) => conflicts.push(conflict(
                        "GIT_STATE_UNAVAILABLE",
                        None,
                        "无法读取仓库工作区状态。",
                    )),
                }

                match git_stdout(&reported_root, &["remote"]) {
                    Ok(remotes) if remotes.is_empty() => {}
                    Ok(_) => conflicts.push(conflict(
                        "REMOTE_PRESENT",
                        None,
                        "Worker 仓库存在 remote，离线导出必须停止。",
                    )),
                    Err(_) => conflicts.push(conflict(
                        "GIT_STATE_UNAVAILABLE",
                        None,
                        "无法确认仓库 remote 状态。",
                    )),
                }
                if git_operation_in_progress(&reported_root) {
                    conflicts.push(conflict(
                        "GIT_OPERATION_IN_PROGRESS",
                        None,
                        "仓库存在未完成的 merge、rebase、cherry-pick 或 revert。",
                    ));
                }

                branch_name = git_stdout(
                    &reported_root,
                    &["symbolic-ref", "--quiet", "--short", "HEAD"],
                )
                .ok();
                let record_id = branch_name
                    .as_deref()
                    .and_then(bundle_record_id)
                    .map(str::to_owned);
                if branch_name.is_none() {
                    conflicts.push(conflict(
                        "DETACHED_HEAD",
                        None,
                        "仓库当前处于 detached HEAD 状态。",
                    ));
                } else if record_id.is_none() {
                    conflicts.push(conflict(
                        "CONTENT_BRANCH_REQUIRED",
                        None,
                        "只能导出 content/YYYYMMDD-<id> 本地内容分支。",
                    ));
                }

                head_sha = git_stdout(&reported_root, &["rev-parse", "--verify", "HEAD"])
                    .ok()
                    .filter(|value| valid_object_id(value));
                if head_sha.is_none() {
                    conflicts.push(conflict(
                        "HEAD_UNAVAILABLE",
                        None,
                        "仓库没有可验证的 HEAD commit。",
                    ));
                }

                if let (Some(branch), Some(head)) = (&branch_name, &head_sha) {
                    let branch_ref = format!("refs/heads/{branch}");
                    if match git_stdout(&reported_root, &["rev-parse", "--verify", &branch_ref]) {
                        Ok(resolved) => resolved != *head,
                        Err(_) => true,
                    } {
                        conflicts.push(conflict(
                            "BRANCH_HEAD_MISMATCH",
                            None,
                            "当前分支引用与 HEAD 不一致。",
                        ));
                    }
                }

                match git_stdout(
                    &reported_root,
                    &["rev-list", "--parents", "-n", "1", "HEAD"],
                ) {
                    Ok(parents) => {
                        let commits = parents.split_whitespace().collect::<Vec<_>>();
                        if commits.len() == 2 && commits.iter().all(|value| valid_object_id(value))
                        {
                            base_commit_sha = Some(commits[1].to_owned());
                        } else {
                            conflicts.push(conflict(
                                "SINGLE_COMMIT_BRANCH_REQUIRED",
                                None,
                                "内容分支 HEAD 必须是一个单父提交。",
                            ));
                        }
                    }
                    Err(_) => conflicts.push(conflict(
                        "HEAD_UNAVAILABLE",
                        None,
                        "无法读取内容提交的父提交。",
                    )),
                }

                if let Some(record_id) = record_id {
                    let expected_subject = format!("content: publish {record_id}");
                    if match git_stdout(&reported_root, &["log", "-1", "--format=%s", "HEAD"]) {
                        Ok(subject) => subject != expected_subject,
                        Err(_) => true,
                    } {
                        conflicts.push(conflict(
                            "CONTENT_COMMIT_REQUIRED",
                            None,
                            "当前 HEAD 不是工作台生成的规范内容提交。",
                        ));
                    }
                }

                match git_command(
                    &reported_root,
                    &[
                        "diff-tree",
                        "--no-commit-id",
                        "--name-only",
                        "--no-renames",
                        "-r",
                        "-z",
                        "HEAD",
                    ],
                ) {
                    Ok(output) if output.status.success() => {
                        changed_files = nul_paths(&output.stdout)?.into_iter().collect();
                        if changed_files.is_empty()
                            || changed_files
                                .iter()
                                .any(|path| !is_publication_bundle_path(path))
                        {
                            conflicts.push(conflict(
                                "UNEXPECTED_COMMIT_PATH",
                                None,
                                "内容提交包含计划外路径，不能导出。",
                            ));
                        }
                    }
                    _ => conflicts.push(conflict(
                        "GIT_STATE_UNAVAILABLE",
                        None,
                        "无法核对内容提交的文件清单。",
                    )),
                }

                match git_stdout(&reported_root, &["ls-files", "-ci", "--exclude-standard"]) {
                    Ok(paths) if paths.is_empty() => {}
                    Ok(paths) => {
                        for path in paths.lines().take(20) {
                            conflicts.push(conflict(
                                "TRACKED_BUILD_ARTIFACT",
                                Some(path),
                                "Bundle 历史包含被忽略但仍受 Git 跟踪的文件。",
                            ));
                        }
                    }
                    Err(_) => conflicts.push(conflict(
                        "GIT_STATE_UNAVAILABLE",
                        None,
                        "无法扫描受跟踪的构建产物。",
                    )),
                }

                match git_stdout(&reported_root, &["rev-list", "--objects", "HEAD"]) {
                    Ok(objects) => {
                        let mut unsafe_paths = BTreeSet::new();
                        for path in objects
                            .lines()
                            .filter_map(|line| line.split_once(' ').map(|(_, path)| path))
                        {
                            if is_sensitive_or_generated_path(path) {
                                unsafe_paths.insert(path.to_owned());
                            }
                        }
                        for path in unsafe_paths.into_iter().take(20) {
                            conflicts.push(conflict(
                                "UNSAFE_HISTORY_PATH",
                                Some(&path),
                                "Bundle 历史包含秘密文件名或构建产物路径。",
                            ));
                        }
                    }
                    Err(_) => conflicts.push(conflict(
                        "GIT_STATE_UNAVAILABLE",
                        None,
                        "无法扫描 Bundle 完整历史。",
                    )),
                }
            }
            Err(_) => conflicts.push(conflict(
                "NOT_GIT_REPOSITORY",
                None,
                "所选目录不是 Git worktree。",
            )),
        }
    }

    let bundle_file_name = branch_name.as_deref().and_then(bundle_file_name);
    let import_branch_name = branch_name.as_deref().and_then(import_branch_name);
    let ready = canonical_repository_path.is_some()
        && branch_name.is_some()
        && head_sha.is_some()
        && base_commit_sha.is_some()
        && bundle_file_name.is_some()
        && import_branch_name.is_some()
        && conflicts.is_empty();

    Ok(RepositoryBundlePreflightResult {
        repository_path: request.repository_path.trim().to_owned(),
        canonical_repository_path,
        destination_directory: request.destination_directory.trim().to_owned(),
        branch_name,
        head_sha,
        base_commit_sha,
        bundle_file_name,
        import_branch_name,
        changed_files,
        conflicts,
        ready,
    })
}

fn validate_bundle_preflight_request(
    request: &RepositoryBundlePreflightRequest,
) -> RepositoryResult<()> {
    if request.repository_path.trim().is_empty()
        || request.destination_directory.trim().is_empty()
        || request.repository_path.contains('\0')
        || request.destination_directory.contains('\0')
    {
        return Err(RepositoryError::InvalidBundleRequest("path"));
    }
    Ok(())
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

struct BundleDestination {
    directory: PathBuf,
    parent: PathBuf,
    exists: bool,
}

struct BundleArtifactContext<'a> {
    bundle_name: &'a str,
    branch_name: &'a str,
    head_sha: &'a str,
    base_commit_sha: &'a str,
    import_branch: &'a str,
    bundle_size: u64,
    bundle_sha256: &'a str,
    changed_files: &'a [String],
}

fn resolve_bundle_destination(value: &str) -> RepositoryResult<BundleDestination> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err(RepositoryError::InvalidBundleRequest(
            "destinationDirectory",
        ));
    }
    let selected = PathBuf::from(trimmed);
    if !selected.is_absolute()
        || selected
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(RepositoryError::InvalidBundleRequest(
            "destinationDirectory",
        ));
    }
    let directory_name = selected
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| valid_windows_segment(value))
        .ok_or(RepositoryError::InvalidBundleRequest(
            "destinationDirectory",
        ))?;
    let selected_parent = selected
        .parent()
        .ok_or(RepositoryError::InvalidBundleRequest(
            "destinationDirectory",
        ))?;
    ensure_no_link_components(selected_parent)?;
    let parent_metadata = fs::symlink_metadata(selected_parent)
        .map_err(|_| RepositoryError::InvalidBundleRequest("destinationDirectory"))?;
    if !parent_metadata.is_dir() || is_link_or_reparse_point(&parent_metadata) {
        return Err(RepositoryError::InvalidBundleRequest(
            "destinationDirectory",
        ));
    }
    let canonical_parent = fs::canonicalize(selected_parent)
        .map_err(|_| RepositoryError::InvalidBundleRequest("destinationDirectory"))?;
    let directory = canonical_parent.join(directory_name);
    let exists = match fs::symlink_metadata(&directory) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) {
                return Err(RepositoryError::UnsafeRepositoryPath);
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.into()),
    };
    Ok(BundleDestination {
        directory,
        parent: canonical_parent,
        exists,
    })
}

fn path_is_within(path: &Path, ancestor: &Path) -> bool {
    if cfg!(windows) {
        let path = display_path(path).replace('/', "\\").to_ascii_lowercase();
        let ancestor = display_path(ancestor)
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase();
        path == ancestor || path.starts_with(&format!("{ancestor}\\"))
    } else {
        path.starts_with(ancestor)
    }
}

fn bundle_record_id(branch: &str) -> Option<&str> {
    let suffix = branch.strip_prefix("content/")?;
    let (date, record_id) = suffix.split_once('-')?;
    (date.len() == 8 && date.bytes().all(|byte| byte.is_ascii_digit()) && is_stable_id(record_id))
        .then_some(record_id)
}

fn bundle_file_name(branch: &str) -> Option<String> {
    bundle_record_id(branch)?;
    Some(format!("{}-v1.bundle", branch.replace('/', "-")))
}

fn import_branch_name(branch: &str) -> Option<String> {
    bundle_record_id(branch)?;
    Some(format!("import/{}", branch.replace('/', "-")))
}

fn is_publication_bundle_path(path: &str) -> bool {
    path.starts_with("content/records/")
        || path.starts_with("content/media/")
        || path.starts_with("public/images/uploads/")
}

fn is_sensitive_or_generated_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let file_name = normalized.rsplit('/').next().unwrap_or_default();
    let segments = normalized.split('/').collect::<Vec<_>>();
    let generated = segments.iter().any(|segment| {
        matches!(
            *segment,
            "node_modules" | "dist" | "target" | ".next" | ".wrangler" | "coverage"
        )
    });
    let environment = file_name == ".env"
        || (file_name.starts_with(".env.") && !matches!(file_name, ".env.example" | ".env.sample"));
    let credential = matches!(
        file_name,
        "id_rsa"
            | "id_ed25519"
            | "credentials.json"
            | "service-account.json"
            | "service_account.json"
    ) || [".pem", ".key", ".p12", ".pfx", ".kdbx"]
        .iter()
        .any(|suffix| file_name.ends_with(suffix));
    generated || environment || credential
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
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

fn conflict(code: &str, path: Option<&str>, message: &str) -> DryRunConflict {
    DryRunConflict {
        code: code.to_owned(),
        path: path.map(str::to_owned),
        message: message.to_owned(),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PublishFault {
    None,
    #[cfg(test)]
    AfterStage,
}

#[derive(Debug)]
struct PreparedFile {
    relative: String,
    staged_path: PathBuf,
}

struct StagingGuard {
    root: PathBuf,
}

impl Drop for StagingGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[derive(Default)]
struct RepositoryMutation {
    branch_created: bool,
    index_touched: bool,
    commit_created: bool,
    installed_files: Vec<PathBuf>,
    temporary_files: Vec<PathBuf>,
    created_directories: Vec<PathBuf>,
}

struct TargetCopy {
    relative: String,
    temporary: PathBuf,
    target: PathBuf,
}

fn publish_local_commit<F>(
    publisher: &RepositoryPublisher,
    mut request: RepositoryLocalCommitRequest,
    mut load_image: F,
    fault: PublishFault,
) -> RepositoryResult<RepositoryLocalCommitResult>
where
    F: FnMut(&str, &str) -> Result<Vec<u8>, String>,
{
    validate_local_commit_request(&request)?;
    request.plan.content_targets.sort();
    request.plan.image_targets.sort();
    request
        .text_files
        .sort_by(|left, right| left.path.cmp(&right.path));
    request
        .image_files
        .sort_by(|left, right| left.path.cmp(&right.path));

    let _operation_guard = publisher.lock()?;
    let repository_root = canonical_selected_directory(&request.plan.repository_path)?;
    let (staging, prepared_files) =
        prepare_publication_staging(publisher, &repository_root, &request, &mut load_image)?;

    let inspected = inspect_repository_export(request.plan.clone())?;
    if !inspected.repository_ready {
        return Err(RepositoryError::RepositoryBlocked);
    }
    if inspected.diagnostics.head_sha.as_deref() != Some(&request.expected_head_sha)
        || inspected.diagnostics.current_branch.as_deref() != Some(&request.expected_base_branch)
        || inspected
            .diagnostics
            .canonical_root
            .as_deref()
            .is_none_or(|root| !paths_equal(Path::new(root), &repository_root))
    {
        return Err(RepositoryError::RepositoryChanged);
    }

    let hooks_root = staging.root.join("hooks-disabled");
    fs::create_dir(&hooks_root)?;
    let mut mutation = RepositoryMutation::default();
    let branch_args = vec![
        "switch".to_owned(),
        "-c".to_owned(),
        request.plan.branch_name.clone(),
    ];
    controlled_git_checked(&repository_root, &hooks_root, &branch_args, "create branch")?;
    mutation.branch_created = true;

    let operation = (|| -> RepositoryResult<RepositoryLocalCommitResult> {
        if controlled_git_stdout(
            &repository_root,
            &hooks_root,
            &["symbolic-ref", "--quiet", "--short", "HEAD"],
        )? != request.plan.branch_name
            || controlled_git_stdout(
                &repository_root,
                &hooks_root,
                &["rev-parse", "--verify", "HEAD"],
            )? != request.expected_head_sha
            || !controlled_git_stdout(
                &repository_root,
                &hooks_root,
                &["status", "--porcelain=v1", "--untracked-files=all"],
            )?
            .is_empty()
            || !controlled_git_stdout(&repository_root, &hooks_root, &["remote"])?.is_empty()
            || git_operation_in_progress(&repository_root)
        {
            return Err(RepositoryError::RepositoryChanged);
        }

        let expected_paths = request
            .plan
            .content_targets
            .iter()
            .chain(&request.plan.image_targets)
            .cloned()
            .collect::<Vec<_>>();
        ensure_no_git_filters(&repository_root, &hooks_root, &expected_paths)?;
        install_prepared_files(
            &repository_root,
            &staging.root,
            &prepared_files,
            &mut mutation,
        )?;

        let mut add_args = vec!["add".to_owned(), "--".to_owned()];
        add_args.extend(expected_paths.iter().cloned());
        mutation.index_touched = true;
        controlled_git_checked(&repository_root, &hooks_root, &add_args, "stage files")?;
        verify_staged_files(
            &repository_root,
            &hooks_root,
            &prepared_files,
            &expected_paths,
        )?;

        #[cfg(test)]
        if fault == PublishFault::AfterStage {
            return Err(RepositoryError::InjectedFailure);
        }
        #[cfg(not(test))]
        let _ = fault;

        let commit_message = format!("content: publish {}", request.plan.record_id);
        let commit_args = vec![
            "commit".to_owned(),
            "--no-verify".to_owned(),
            "--no-gpg-sign".to_owned(),
            "-m".to_owned(),
            commit_message.clone(),
        ];
        controlled_git_checked(&repository_root, &hooks_root, &commit_args, "commit")?;
        mutation.commit_created = true;

        let commit_sha = controlled_git_stdout(
            &repository_root,
            &hooks_root,
            &["rev-parse", "--verify", "HEAD"],
        )?;
        verify_completed_commit(
            &repository_root,
            &hooks_root,
            &request,
            &commit_sha,
            &expected_paths,
        )?;

        let mut committed_paths = expected_paths;
        committed_paths.sort();
        Ok(RepositoryLocalCommitResult {
            branch_name: request.plan.branch_name.clone(),
            previous_head_sha: request.expected_head_sha.clone(),
            commit_sha,
            commit_message,
            committed_paths,
        })
    })();

    match operation {
        Ok(result) => Ok(result),
        Err(error) if mutation.commit_created => Err(error),
        Err(error) => {
            rollback_repository_mutation(&repository_root, &hooks_root, &request, &mut mutation)?;
            Err(error)
        }
    }
}

fn export_repository_bundle(
    publisher: &RepositoryPublisher,
    request: RepositoryBundleExportRequest,
) -> RepositoryResult<RepositoryBundleExportResult> {
    validate_bundle_export_request(&request)?;
    let _operation_guard = publisher.lock()?;
    let preflight = inspect_repository_bundle(RepositoryBundlePreflightRequest {
        repository_path: request.repository_path.clone(),
        destination_directory: request.destination_directory.clone(),
    })?;
    if !preflight.ready {
        return Err(RepositoryError::BundleBlocked);
    }
    if preflight.branch_name.as_deref() != Some(&request.expected_branch_name)
        || preflight.head_sha.as_deref() != Some(&request.expected_head_sha)
    {
        return Err(RepositoryError::BundleChanged);
    }

    let repository_root = preflight
        .canonical_repository_path
        .as_deref()
        .map(PathBuf::from)
        .ok_or(RepositoryError::BundleChanged)?;
    let bundle_name = preflight
        .bundle_file_name
        .clone()
        .ok_or(RepositoryError::BundleChanged)?;
    let import_branch = preflight
        .import_branch_name
        .clone()
        .ok_or(RepositoryError::BundleChanged)?;
    let base_commit = preflight
        .base_commit_sha
        .clone()
        .ok_or(RepositoryError::BundleChanged)?;
    let destination = resolve_bundle_destination(&request.destination_directory)?;
    if destination.exists || path_is_within(&destination.directory, &repository_root) {
        return Err(RepositoryError::BundleChanged);
    }

    let staging = create_bundle_staging(publisher, &repository_root)?;
    let hooks_root = staging.root.join("hooks-disabled");
    fs::create_dir(&hooks_root)?;
    let staged_bundle = staging.root.join(&bundle_name);
    controlled_git_checked(
        &repository_root,
        &hooks_root,
        &[
            "bundle".to_owned(),
            "create".to_owned(),
            display_path(&staged_bundle),
            format!("refs/heads/{}", request.expected_branch_name),
        ],
        "create complete bundle",
    )?;
    verify_complete_bundle(
        &repository_root,
        &hooks_root,
        &staged_bundle,
        &request.expected_branch_name,
        &request.expected_head_sha,
    )?;

    let bundle_size = fs::metadata(&staged_bundle)?.len();
    if bundle_size == 0 || bundle_size > MAX_BUNDLE_BYTES {
        return Err(RepositoryError::InvalidBundleRequest("bundle size"));
    }
    let bundle_bytes = fs::read(&staged_bundle)?;
    if bundle_bytes.len() as u64 != bundle_size {
        return Err(RepositoryError::Git("bundle size changed"));
    }
    let bundle_sha256 = sha256_hex(&bundle_bytes).to_ascii_uppercase();
    let artifact_context = BundleArtifactContext {
        bundle_name: &bundle_name,
        branch_name: &request.expected_branch_name,
        head_sha: &request.expected_head_sha,
        base_commit_sha: &base_commit,
        import_branch: &import_branch,
        bundle_size,
        bundle_sha256: &bundle_sha256,
        changed_files: &preflight.changed_files,
    };
    let artifacts = write_bundle_delivery_artifacts(&staging.root, &artifact_context)?;

    let refreshed = inspect_repository_bundle(RepositoryBundlePreflightRequest {
        repository_path: request.repository_path,
        destination_directory: request.destination_directory,
    })?;
    if !refreshed.ready
        || refreshed.branch_name.as_deref() != Some(&request.expected_branch_name)
        || refreshed.head_sha.as_deref() != Some(&request.expected_head_sha)
    {
        return Err(RepositoryError::BundleChanged);
    }

    let temporary_delivery = destination
        .parent
        .join(format!(".algae-bundle-{}.tmp", Uuid::new_v4().simple()));
    fs::create_dir(&temporary_delivery)?;
    let delivery_guard = StagingGuard {
        root: temporary_delivery.clone(),
    };
    for name in &artifacts {
        copy_new_delivery_file(&staging.root.join(name), &temporary_delivery.join(name))?;
    }
    sync_directory(&temporary_delivery)?;
    verify_bundle_delivery(
        &repository_root,
        &hooks_root,
        &temporary_delivery,
        &artifact_context,
        &artifacts,
    )?;

    match fs::symlink_metadata(&destination.directory) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Ok(_) => return Err(RepositoryError::BundleChanged),
        Err(error) => return Err(error.into()),
    }
    fs::rename(&temporary_delivery, &destination.directory)?;
    sync_directory(&destination.parent)?;
    drop(delivery_guard);

    Ok(RepositoryBundleExportResult {
        branch_name: request.expected_branch_name,
        head_sha: request.expected_head_sha,
        destination_directory: display_path(&destination.directory),
        bundle_file_name: bundle_name,
        bundle_size_bytes: bundle_size,
        sha256: bundle_sha256,
        import_branch_name: import_branch,
        artifact_names: artifacts,
    })
}

fn validate_bundle_export_request(request: &RepositoryBundleExportRequest) -> RepositoryResult<()> {
    validate_bundle_preflight_request(&RepositoryBundlePreflightRequest {
        repository_path: request.repository_path.clone(),
        destination_directory: request.destination_directory.clone(),
    })?;
    if !request.confirmed {
        return Err(RepositoryError::InvalidBundleRequest("confirmation"));
    }
    if bundle_record_id(&request.expected_branch_name).is_none() {
        return Err(RepositoryError::InvalidBundleRequest("expectedBranchName"));
    }
    if !valid_object_id(&request.expected_head_sha) {
        return Err(RepositoryError::InvalidBundleRequest("expectedHeadSha"));
    }
    Ok(())
}

fn create_bundle_staging(
    publisher: &RepositoryPublisher,
    repository_root: &Path,
) -> RepositoryResult<StagingGuard> {
    if path_is_within(&publisher.staging_root, repository_root) {
        return Err(RepositoryError::InvalidBundleRequest("staging root"));
    }
    ensure_no_link_components(&publisher.staging_root)?;
    fs::create_dir_all(&publisher.staging_root)?;
    let metadata = fs::symlink_metadata(&publisher.staging_root)?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(RepositoryError::UnsafeRepositoryPath);
    }
    let canonical_staging = fs::canonicalize(&publisher.staging_root)?;
    if path_is_within(&canonical_staging, repository_root) {
        return Err(RepositoryError::InvalidBundleRequest("staging root"));
    }
    let operation_root = canonical_staging.join(Uuid::new_v4().to_string());
    fs::create_dir(&operation_root)?;
    Ok(StagingGuard {
        root: operation_root,
    })
}

fn write_bundle_delivery_artifacts(
    staging_root: &Path,
    context: &BundleArtifactContext<'_>,
) -> RepositoryResult<Vec<String>> {
    let bundle_name = context.bundle_name;
    let branch_name = context.branch_name;
    let head_sha = context.head_sha;
    let base_commit_sha = context.base_commit_sha;
    let import_branch = context.import_branch;
    let bundle_size = context.bundle_size;
    let bundle_sha256 = context.bundle_sha256;
    let changed_files = context.changed_files;
    let sidecar_name = format!("{bundle_name}.sha256.txt");
    let artifacts = vec![
        bundle_name.to_owned(),
        sidecar_name.clone(),
        "MANIFEST.txt".to_owned(),
        "HANDOFF.md".to_owned(),
        "TEST-SUMMARY.txt".to_owned(),
        "CHANGED-FILES.txt".to_owned(),
        "Import-Bundle.ps1".to_owned(),
    ];
    write_delivery_file(
        staging_root,
        &sidecar_name,
        format!("{bundle_sha256}  {bundle_name}\r\n").as_bytes(),
    )?;
    let manifest = format!(
        "FormatVersion=1\r\nBranch={branch_name}\r\nHeadCommit={head_sha}\r\nBaseCommit={base_commit_sha}\r\nBundleFile={bundle_name}\r\nBundleSizeBytes={bundle_size}\r\nBundleSha256={bundle_sha256}\r\nHistory=complete\r\nImportBranch={import_branch}\r\nChangedFileCount={}\r\nArtifacts={}\r\n",
        changed_files.len(),
        artifacts.join(","),
    );
    write_delivery_file(staging_root, "MANIFEST.txt", manifest.as_bytes())?;
    let handoff = format!(
        "# Offline Content Bundle Handoff\n\n- Source branch: `{branch_name}`\n- Source HEAD: `{head_sha}`\n- Base commit: `{base_commit_sha}`\n- Complete bundle: `{bundle_name}`\n- SHA-256: `{bundle_sha256}`\n- Import target: `{import_branch}`\n\nRun `Import-Bundle.ps1` against a clean local repository. It verifies the sidecar and bundle, then creates only the named `import/...` temporary branch. It does not checkout, merge, push, pull, tag, release, or deploy.\n",
    );
    write_delivery_file(staging_root, "HANDOFF.md", handoff.as_bytes())?;
    let summary = format!(
        "Bundle create: PASS\r\nBundle verify: PASS\r\nBundle head: {head_sha} refs/heads/{branch_name}\r\nSHA-256: PASS\r\nCopied bundle hash: PASS\r\nImport script: verifies then fetches only {import_branch}\r\n",
    );
    write_delivery_file(staging_root, "TEST-SUMMARY.txt", summary.as_bytes())?;
    let mut changed = changed_files.to_vec();
    changed.sort();
    write_delivery_file(
        staging_root,
        "CHANGED-FILES.txt",
        format!("{}\r\n", changed.join("\r\n")).as_bytes(),
    )?;
    write_delivery_file(
        staging_root,
        "Import-Bundle.ps1",
        render_bundle_import_script(
            bundle_name,
            &sidecar_name,
            branch_name,
            head_sha,
            import_branch,
            bundle_sha256,
        )
        .as_bytes(),
    )?;
    Ok(artifacts)
}

fn write_delivery_file(root: &Path, name: &str, bytes: &[u8]) -> RepositoryResult<()> {
    if !valid_windows_segment(name) || bytes.is_empty() {
        return Err(RepositoryError::InvalidBundleRequest("delivery artifact"));
    }
    let path = root.join(name);
    let mut output = OpenOptions::new().write(true).create_new(true).open(path)?;
    output.write_all(bytes)?;
    output.sync_all()?;
    Ok(())
}

fn copy_new_delivery_file(source: &Path, destination: &Path) -> RepositoryResult<()> {
    let metadata = fs::symlink_metadata(source)?;
    if !metadata.is_file() || is_link_or_reparse_point(&metadata) {
        return Err(RepositoryError::InvalidBundleRequest("delivery artifact"));
    }
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let copied = std::io::copy(&mut input, &mut output)?;
    output.sync_all()?;
    if copied != metadata.len() {
        return Err(RepositoryError::Storage(std::io::Error::other(
            "incomplete delivery copy",
        )));
    }
    Ok(())
}

fn verify_complete_bundle(
    repository_root: &Path,
    hooks_root: &Path,
    bundle_path: &Path,
    branch_name: &str,
    head_sha: &str,
) -> RepositoryResult<()> {
    controlled_git_checked(
        repository_root,
        hooks_root,
        &[
            "bundle".to_owned(),
            "verify".to_owned(),
            display_path(bundle_path),
        ],
        "verify bundle",
    )?;
    let heads = controlled_git_checked(
        repository_root,
        hooks_root,
        &[
            "bundle".to_owned(),
            "list-heads".to_owned(),
            display_path(bundle_path),
        ],
        "inspect bundle heads",
    )?;
    let expected = format!("{head_sha} refs/heads/{branch_name}");
    if stdout(&heads).lines().collect::<Vec<_>>() != [expected.as_str()] {
        return Err(RepositoryError::Git("bundle heads"));
    }
    let bytes = fs::read(bundle_path)?;
    let header_end = bytes
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|index| index + 2)
        .ok_or(RepositoryError::Git("bundle header"))?;
    let header = std::str::from_utf8(&bytes[..header_end])
        .map_err(|_| RepositoryError::Git("bundle header"))?;
    if header.lines().any(|line| line.starts_with('-')) {
        return Err(RepositoryError::Git("incomplete bundle history"));
    }
    Ok(())
}

fn verify_bundle_delivery(
    repository_root: &Path,
    hooks_root: &Path,
    delivery_directory: &Path,
    context: &BundleArtifactContext<'_>,
    expected_artifacts: &[String],
) -> RepositoryResult<()> {
    let bundle_name = context.bundle_name;
    let branch_name = context.branch_name;
    let head_sha = context.head_sha;
    let expected_size = context.bundle_size;
    let expected_sha256 = context.bundle_sha256;
    let bundle_path = delivery_directory.join(bundle_name);
    let metadata = fs::metadata(&bundle_path)?;
    if metadata.len() != expected_size || metadata.len() > MAX_BUNDLE_BYTES {
        return Err(RepositoryError::Git("copied bundle size"));
    }
    if sha256_hex(&fs::read(&bundle_path)?).to_ascii_uppercase() != expected_sha256 {
        return Err(RepositoryError::Git("copied bundle hash"));
    }
    let sidecar_name = format!("{bundle_name}.sha256.txt");
    if fs::read_to_string(delivery_directory.join(&sidecar_name))?
        != format!("{expected_sha256}  {bundle_name}\r\n")
    {
        return Err(RepositoryError::Git("bundle sidecar"));
    }
    let actual = fs::read_dir(delivery_directory)?
        .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
        .collect::<Result<BTreeSet<_>, _>>()?;
    let expected = expected_artifacts.iter().cloned().collect::<BTreeSet<_>>();
    if actual != expected {
        return Err(RepositoryError::Git("delivery artifact list"));
    }
    verify_complete_bundle(
        repository_root,
        hooks_root,
        &bundle_path,
        branch_name,
        head_sha,
    )
}

fn render_bundle_import_script(
    bundle_name: &str,
    sidecar_name: &str,
    branch_name: &str,
    head_sha: &str,
    import_branch: &str,
    sha256: &str,
) -> String {
    format!(
        r#"param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryPath
)

$ErrorActionPreference = "Stop"
$bundlePath = Join-Path $PSScriptRoot "{bundle_name}"
$sidecarPath = Join-Path $PSScriptRoot "{sidecar_name}"
$sourceRef = "refs/heads/{branch_name}"
$targetRef = "refs/heads/{import_branch}"
$expectedHead = "{head_sha}"
$expectedHash = "{sha256}"

function Get-Sha256Hex {{
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $stream = $null
  try {{
    $stream = [System.IO.File]::OpenRead($LiteralPath)
    $hashBytes = $sha256.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
  }} finally {{
    if ($null -ne $stream) {{ $stream.Dispose() }}
    if ($null -ne $sha256) {{ $sha256.Dispose() }}
  }}
}}

if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) {{
  throw "RepositoryPath must be an existing directory."
}}
$repositoryRoot = (& git -C $RepositoryPath rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) {{ throw "RepositoryPath is not a Git worktree." }}
$statusBefore = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $statusBefore) {{ throw "Target repository must be clean." }}
$headBefore = (& git -C $repositoryRoot rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0) {{ throw "Target repository has no HEAD commit." }}
$branchBefore = (& git -C $repositoryRoot symbolic-ref --quiet --short HEAD)
$branchExit = $LASTEXITCODE
if ($branchExit -ne 0 -and $branchExit -ne 1) {{ throw "Cannot inspect target branch." }}

$actualHash = Get-Sha256Hex -LiteralPath $bundlePath
if ($actualHash -ne $expectedHash) {{ throw "Bundle SHA-256 does not match the manifest." }}
$sidecar = (Get-Content -LiteralPath $sidecarPath -Raw).Trim()
if ($sidecar -ne "$expectedHash  {bundle_name}") {{ throw "Bundle SHA-256 sidecar is invalid." }}
& git -C $repositoryRoot bundle verify $bundlePath
if ($LASTEXITCODE -ne 0) {{ throw "Bundle verification failed." }}
$bundleHead = (& git -C $repositoryRoot bundle list-heads $bundlePath).Trim()
if ($LASTEXITCODE -ne 0 -or $bundleHead -ne "$expectedHead $sourceRef") {{ throw "Bundle head is not the approved content branch." }}
& git -C $repositoryRoot show-ref --verify --quiet $targetRef
if ($LASTEXITCODE -eq 0) {{ throw "Temporary import branch already exists." }}
if ($LASTEXITCODE -ne 1) {{ throw "Cannot verify the temporary import branch." }}

& git -C $repositoryRoot fetch --no-tags --no-write-fetch-head $bundlePath "$sourceRef`:$targetRef"
if ($LASTEXITCODE -ne 0) {{ throw "Bundle import failed." }}
$importedHead = (& git -C $repositoryRoot rev-parse --verify $targetRef).Trim()
if ($LASTEXITCODE -ne 0 -or $importedHead -ne $expectedHead) {{ throw "Imported temporary branch does not match the approved HEAD." }}
$headAfter = (& git -C $repositoryRoot rev-parse --verify HEAD).Trim()
$branchAfter = (& git -C $repositoryRoot symbolic-ref --quiet --short HEAD)
$branchAfterExit = $LASTEXITCODE
$statusAfter = (& git -C $repositoryRoot status --porcelain=v1 --untracked-files=all)
if ($headAfter -ne $headBefore -or $branchAfter -ne $branchBefore -or $branchAfterExit -ne $branchExit -or $statusAfter) {{
  throw "Import changed the checked-out branch or worktree."
}}
Write-Output "Imported $sourceRef into $targetRef without checkout or merge."
"#,
    )
}

fn validate_local_commit_request(request: &RepositoryLocalCommitRequest) -> RepositoryResult<()> {
    validate_request(&request.plan)?;
    if !request.confirmed {
        return Err(RepositoryError::InvalidCommitRequest("confirmation"));
    }
    if !valid_object_id(&request.expected_head_sha) {
        return Err(RepositoryError::InvalidCommitRequest("expectedHeadSha"));
    }
    if request.expected_base_branch.is_empty()
        || request.expected_base_branch.len() > 255
        || request.expected_base_branch.starts_with('-')
        || request
            .expected_base_branch
            .chars()
            .any(|character| character.is_control())
    {
        return Err(RepositoryError::InvalidCommitRequest("expectedBaseBranch"));
    }
    let draft_id = Uuid::parse_str(&request.draft_id)
        .map_err(|_| RepositoryError::InvalidCommitRequest("draftId"))?;
    if draft_id.get_version() != Some(Version::Random) || draft_id.to_string() != request.draft_id {
        return Err(RepositoryError::InvalidCommitRequest("draftId"));
    }

    let content_paths = request
        .text_files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<HashSet<_>>();
    let planned_content = request
        .plan
        .content_targets
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if content_paths.len() != request.text_files.len() || content_paths != planned_content {
        return Err(RepositoryError::InvalidCommitRequest("textFiles"));
    }

    let image_paths = request
        .image_files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<HashSet<_>>();
    let planned_images = request
        .plan
        .image_targets
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if image_paths.len() != request.image_files.len() || image_paths != planned_images {
        return Err(RepositoryError::InvalidCommitRequest("imageFiles"));
    }

    for file in &request.text_files {
        validate_publication_text(file, &request.plan)?;
    }
    for file in &request.image_files {
        validate_publication_image(file)?;
    }
    Ok(())
}

fn validate_publication_text(
    file: &RepositoryTextFile,
    plan: &RepositoryDryRunRequest,
) -> RepositoryResult<()> {
    if file.contents.is_empty()
        || file.contents.len() > MAX_TEXT_FILE_BYTES
        || file.contents.starts_with('\u{feff}')
        || file.contents.contains('\r')
        || file.contents.contains('\0')
        || !file.contents.ends_with('\n')
    {
        return Err(RepositoryError::InvalidCommitRequest("text contents"));
    }
    if file.path.ends_with(".md") {
        return Ok(());
    }

    let value: Value = serde_json::from_str(&file.contents)
        .map_err(|_| RepositoryError::InvalidCommitRequest("JSON contents"))?;
    let object = value
        .as_object()
        .ok_or(RepositoryError::InvalidCommitRequest("JSON object"))?;
    if file.path.ends_with("/record.json") {
        if object.get("id").and_then(Value::as_str) != Some(&plan.record_id)
            || object.get("type").and_then(Value::as_str) != Some(&plan.content_type)
        {
            return Err(RepositoryError::InvalidCommitRequest("record identity"));
        }
    } else if let Some(id) = media_metadata_id(&file.path) {
        let public_path = object
            .get("filePath")
            .and_then(Value::as_str)
            .ok_or(RepositoryError::InvalidCommitRequest("media filePath"))?;
        if object.get("id").and_then(Value::as_str) != Some(id)
            || !plan.image_targets.iter().any(|path| path == public_path)
            || image_target_id(public_path) != Some(id)
            || public_path.ends_with(".thumbnail.webp")
        {
            return Err(RepositoryError::InvalidCommitRequest("media identity"));
        }
    }
    Ok(())
}

fn validate_publication_image(file: &RepositoryImageFile) -> RepositoryResult<()> {
    if file.staged_name.is_empty()
        || file.staged_name.len() > 255
        || file.staged_name.contains(['/', '\\'])
        || file.path.rsplit('/').next() != Some(&file.staged_name)
        || image_target_id(&file.path) != image_file_id(&file.staged_name)
    {
        return Err(RepositoryError::InvalidCommitRequest("staged image"));
    }
    Ok(())
}

fn valid_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64)
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn prepare_publication_staging<F>(
    publisher: &RepositoryPublisher,
    repository_root: &Path,
    request: &RepositoryLocalCommitRequest,
    load_image: &mut F,
) -> RepositoryResult<(StagingGuard, Vec<PreparedFile>)>
where
    F: FnMut(&str, &str) -> Result<Vec<u8>, String>,
{
    if publisher.staging_root.starts_with(repository_root) {
        return Err(RepositoryError::InvalidCommitRequest("staging root"));
    }
    ensure_no_link_components(&publisher.staging_root)?;
    fs::create_dir_all(&publisher.staging_root)?;
    let metadata = fs::symlink_metadata(&publisher.staging_root)?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(RepositoryError::UnsafeRepositoryPath);
    }
    let canonical_staging = fs::canonicalize(&publisher.staging_root)?;
    if canonical_staging.starts_with(repository_root) {
        return Err(RepositoryError::InvalidCommitRequest("staging root"));
    }

    let operation_root = canonical_staging.join(Uuid::new_v4().to_string());
    fs::create_dir(&operation_root)?;
    let guard = StagingGuard {
        root: operation_root,
    };
    let mut prepared = Vec::new();
    let mut total_bytes = 0_u64;

    for file in &request.text_files {
        total_bytes = total_bytes
            .checked_add(file.contents.len() as u64)
            .ok_or(RepositoryError::InvalidCommitRequest("publication size"))?;
        let staged_path = write_staging_file(&guard.root, &file.path, file.contents.as_bytes())?;
        prepared.push(PreparedFile {
            relative: file.path.clone(),
            staged_path,
        });
    }
    for file in &request.image_files {
        let bytes = load_image(&request.draft_id, &file.staged_name)
            .map_err(|_| RepositoryError::InvalidCommitRequest("staged image"))?;
        if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
            return Err(RepositoryError::InvalidCommitRequest("staged image bytes"));
        }
        total_bytes = total_bytes
            .checked_add(bytes.len() as u64)
            .ok_or(RepositoryError::InvalidCommitRequest("publication size"))?;
        let staged_path = write_staging_file(&guard.root, &file.path, &bytes)?;
        prepared.push(PreparedFile {
            relative: file.path.clone(),
            staged_path,
        });
    }
    if total_bytes > MAX_PUBLICATION_BYTES {
        return Err(RepositoryError::InvalidCommitRequest("publication size"));
    }
    prepared.sort_by(|left, right| left.relative.cmp(&right.relative));
    sync_directory(&guard.root)?;
    Ok((guard, prepared))
}

fn write_staging_file(root: &Path, relative: &str, bytes: &[u8]) -> RepositoryResult<PathBuf> {
    let target = join_relative(root, relative);
    let parent = target
        .parent()
        .ok_or(RepositoryError::InvalidCommitRequest("target parent"))?;
    fs::create_dir_all(parent)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)?;
    output.write_all(bytes)?;
    output.sync_all()?;
    Ok(target)
}

fn join_relative(root: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
}

fn install_prepared_files(
    repository_root: &Path,
    staging_root: &Path,
    files: &[PreparedFile],
    mutation: &mut RepositoryMutation,
) -> RepositoryResult<()> {
    let operation_id = staging_root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(RepositoryError::InvalidCommitRequest("operation id"))?;
    let mut copies = Vec::new();

    for (index, file) in files.iter().enumerate() {
        if inspect_target(repository_root, &file.relative)? != TargetInspection::New {
            return Err(RepositoryError::RepositoryChanged);
        }
        let target = join_relative(repository_root, &file.relative);
        let parent = target
            .parent()
            .ok_or(RepositoryError::InvalidCommitRequest("target parent"))?;
        create_safe_directories(repository_root, parent, &mut mutation.created_directories)?;

        let temporary = parent.join(format!(".algae-publish-{operation_id}-{index}.tmp"));
        let mut source = File::open(&file.staged_path)?;
        let mut destination = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        mutation.temporary_files.push(temporary.clone());
        std::io::copy(&mut source, &mut destination)?;
        destination.sync_all()?;
        copies.push(TargetCopy {
            relative: file.relative.clone(),
            temporary,
            target,
        });
    }

    for copy in copies {
        if inspect_target(repository_root, &copy.relative)? != TargetInspection::New {
            return Err(RepositoryError::RepositoryChanged);
        }
        install_atomically(&copy.temporary, &copy.target, true)?;
        mutation.installed_files.push(copy.target.clone());
        if let Some(parent) = copy.target.parent() {
            sync_directory(parent)?;
        }
    }
    Ok(())
}

fn create_safe_directories(
    root: &Path,
    parent: &Path,
    created: &mut Vec<PathBuf>,
) -> RepositoryResult<()> {
    let relative = parent
        .strip_prefix(root)
        .map_err(|_| RepositoryError::InvalidCommitRequest("target parent"))?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(segment) = component else {
            return Err(RepositoryError::InvalidCommitRequest("target parent"));
        };
        let expected = segment
            .to_str()
            .ok_or(RepositoryError::InvalidCommitRequest("target parent"))?;
        let mut exact = None;
        for entry in fs::read_dir(&current)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name == expected {
                exact = Some(entry.path());
                break;
            }
            if name.eq_ignore_ascii_case(expected) {
                return Err(RepositoryError::RepositoryChanged);
            }
        }
        current.push(segment);
        if let Some(existing) = exact {
            let metadata = fs::symlink_metadata(existing)?;
            if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
                return Err(RepositoryError::RepositoryChanged);
            }
        } else {
            fs::create_dir(&current)?;
            created.push(current.clone());
        }
    }
    Ok(())
}

fn verify_staged_files(
    root: &Path,
    hooks_root: &Path,
    prepared: &[PreparedFile],
    expected_paths: &[String],
) -> RepositoryResult<()> {
    let output = controlled_git_checked(
        root,
        hooks_root,
        &[
            "diff".to_owned(),
            "--cached".to_owned(),
            "--name-only".to_owned(),
            "--no-renames".to_owned(),
            "-z".to_owned(),
        ],
        "verify staged paths",
    )?;
    let actual = nul_paths(&output.stdout)?;
    let expected = expected_paths.iter().cloned().collect::<BTreeSet<_>>();
    if actual != expected {
        return Err(RepositoryError::Git("unexpected staged paths"));
    }

    for file in prepared {
        let staged_bytes = fs::read(&file.staged_path)?;
        let blob = controlled_git_checked(
            root,
            hooks_root,
            &["show".to_owned(), format!(":{}", file.relative)],
            "read staged blob",
        )?;
        if blob.stdout != staged_bytes {
            return Err(RepositoryError::Git("staged bytes differ"));
        }
    }
    controlled_git_checked(
        root,
        hooks_root,
        &[
            "diff".to_owned(),
            "--cached".to_owned(),
            "--check".to_owned(),
        ],
        "check staged diff",
    )?;
    let status = controlled_git_stdout(
        root,
        hooks_root,
        &["status", "--porcelain=v1", "--untracked-files=all"],
    )?;
    let actual_status = status.lines().map(str::to_owned).collect::<BTreeSet<_>>();
    let expected_status = expected_paths
        .iter()
        .map(|path| format!("A  {path}"))
        .collect::<BTreeSet<_>>();
    if actual_status != expected_status
        || !controlled_git_stdout(root, hooks_root, &["remote"])?.is_empty()
        || git_operation_in_progress(root)
    {
        return Err(RepositoryError::Git("unexpected worktree state"));
    }
    Ok(())
}

fn ensure_no_git_filters(
    root: &Path,
    hooks_root: &Path,
    expected_paths: &[String],
) -> RepositoryResult<()> {
    let mut args = vec![
        "check-attr".to_owned(),
        "-z".to_owned(),
        "filter".to_owned(),
        "--".to_owned(),
    ];
    args.extend(expected_paths.iter().cloned());
    let output = controlled_git_checked(root, hooks_root, &args, "inspect Git filters")?;
    let fields = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>();
    if fields.len() != expected_paths.len() * 3
        || fields.chunks_exact(3).any(|fields| {
            fields[1] != b"filter" || (!matches!(fields[2], b"unspecified" | b"unset"))
        })
    {
        return Err(RepositoryError::Git("Git clean filter is not allowed"));
    }
    Ok(())
}

fn verify_completed_commit(
    root: &Path,
    hooks_root: &Path,
    request: &RepositoryLocalCommitRequest,
    commit_sha: &str,
    expected_paths: &[String],
) -> RepositoryResult<()> {
    if commit_sha == request.expected_head_sha || !valid_object_id(commit_sha) {
        return Err(RepositoryError::Git("HEAD did not advance"));
    }
    if controlled_git_stdout(root, hooks_root, &["rev-parse", "HEAD^"])?
        != request.expected_head_sha
        || controlled_git_stdout(
            root,
            hooks_root,
            &["symbolic-ref", "--quiet", "--short", "HEAD"],
        )? != request.plan.branch_name
        || !controlled_git_stdout(
            root,
            hooks_root,
            &["status", "--porcelain=v1", "--untracked-files=all"],
        )?
        .is_empty()
        || !controlled_git_stdout(root, hooks_root, &["remote"])?.is_empty()
    {
        return Err(RepositoryError::Git("post-commit state"));
    }

    let output = controlled_git_checked(
        root,
        hooks_root,
        &[
            "diff-tree".to_owned(),
            "--no-commit-id".to_owned(),
            "--name-only".to_owned(),
            "--no-renames".to_owned(),
            "-r".to_owned(),
            "-z".to_owned(),
            "HEAD".to_owned(),
        ],
        "verify commit paths",
    )?;
    if nul_paths(&output.stdout)? != expected_paths.iter().cloned().collect() {
        return Err(RepositoryError::Git("unexpected committed paths"));
    }
    Ok(())
}

fn rollback_repository_mutation(
    root: &Path,
    hooks_root: &Path,
    request: &RepositoryLocalCommitRequest,
    mutation: &mut RepositoryMutation,
) -> RepositoryResult<()> {
    let mut succeeded = true;
    if mutation.index_touched {
        let mut args = vec![
            "rm".to_owned(),
            "--cached".to_owned(),
            "--ignore-unmatch".to_owned(),
            "--".to_owned(),
        ];
        args.extend(
            request
                .plan
                .content_targets
                .iter()
                .chain(&request.plan.image_targets)
                .cloned(),
        );
        succeeded &= controlled_git_command(root, hooks_root, &args)
            .map(|output| output.status.success())
            .unwrap_or(false);
    }

    for path in mutation.installed_files.iter().rev() {
        succeeded &= remove_operation_file(path);
    }
    for path in mutation.temporary_files.iter().rev() {
        succeeded &= remove_operation_file(path);
    }
    for path in mutation.created_directories.iter().rev() {
        match fs::remove_dir(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => succeeded = false,
        }
    }

    if mutation.branch_created {
        let switch_args = vec![
            "switch".to_owned(),
            "--".to_owned(),
            request.expected_base_branch.clone(),
        ];
        succeeded &= controlled_git_command(root, hooks_root, &switch_args)
            .map(|output| output.status.success())
            .unwrap_or(false);
        let delete_args = vec![
            "branch".to_owned(),
            "-d".to_owned(),
            "--".to_owned(),
            request.plan.branch_name.clone(),
        ];
        succeeded &= controlled_git_command(root, hooks_root, &delete_args)
            .map(|output| output.status.success())
            .unwrap_or(false);
    }

    let restored = controlled_git_stdout(
        root,
        hooks_root,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
    )
    .is_ok_and(|branch| branch == request.expected_base_branch)
        && controlled_git_stdout(root, hooks_root, &["rev-parse", "--verify", "HEAD"])
            .is_ok_and(|head| head == request.expected_head_sha)
        && controlled_git_stdout(
            root,
            hooks_root,
            &["status", "--porcelain=v1", "--untracked-files=all"],
        )
        .is_ok_and(|status| status.is_empty());
    if succeeded && restored {
        Ok(())
    } else {
        Err(RepositoryError::RollbackFailed)
    }
}

fn remove_operation_file(path: &Path) -> bool {
    match fs::remove_file(path) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    }
}

fn controlled_git_command(
    root: &Path,
    hooks_root: &Path,
    args: &[String],
) -> std::io::Result<Output> {
    Command::new("git")
        .args([
            "--no-optional-locks",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.untrackedCache=false",
            "-c",
            "core.preloadindex=false",
            "-c",
            "core.autocrlf=false",
            "-c",
            "core.safecrlf=true",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "submodule.recurse=false",
        ])
        .arg("-c")
        .arg(format!("core.hooksPath={}", display_path(hooks_root)))
        .args(args)
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .output()
}

fn controlled_git_checked(
    root: &Path,
    hooks_root: &Path,
    args: &[String],
    operation: &'static str,
) -> RepositoryResult<Output> {
    let output = controlled_git_command(root, hooks_root, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(RepositoryError::Git(operation))
    }
}

fn controlled_git_stdout(
    root: &Path,
    hooks_root: &Path,
    args: &[&str],
) -> RepositoryResult<String> {
    let owned = args
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    let output = controlled_git_checked(root, hooks_root, &owned, "inspect state")?;
    Ok(stdout(&output))
}

fn nul_paths(bytes: &[u8]) -> RepositoryResult<BTreeSet<String>> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .map(|part| {
            std::str::from_utf8(part)
                .map(str::to_owned)
                .map_err(|_| RepositoryError::Git("non-UTF-8 path"))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        export_repository_bundle, inspect_repository_bundle, inspect_repository_export,
        publish_local_commit, PublishFault, RepositoryBundleExportRequest,
        RepositoryBundlePreflightRequest, RepositoryDryRunRequest, RepositoryDryRunResult,
        RepositoryError, RepositoryImageFile, RepositoryLocalCommitRequest, RepositoryPublisher,
        RepositoryTextFile,
    };
    use std::{
        collections::BTreeMap,
        fs,
        path::{Path, PathBuf},
        process::{Command, Output},
    };
    use tempfile::tempdir;

    const RECORD_ID: &str = "fictional-dry-run";
    const DRAFT_ID: &str = "11111111-1111-4111-8111-111111111111";
    const IMAGE_ID: &str = "22222222-2222-4222-8222-222222222222";
    const ACCEPTANCE_RECORD_ID: &str = "stage-08c-team-news";
    const ACCEPTANCE_DRAFT_ID: &str = "33333333-3333-4333-8333-333333333333";
    const ACCEPTANCE_COVER_ID: &str = "44444444-4444-4444-8444-444444444444";
    const ACCEPTANCE_BODY_ID: &str = "55555555-5555-4555-8555-555555555555";

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

    fn run_import_script(script: &Path, repository_root: &Path) -> Output {
        let script = script.to_string_lossy().replace('\'', "''");
        let repository_root = repository_root.to_string_lossy().replace('\'', "''");
        let command = format!(
            "$null = Get-Command Join-Path,Test-Path,Get-Content,Write-Output -ErrorAction SilentlyContinue; $hashCommand = Get-Command Get-FileHash -ErrorAction SilentlyContinue; if ($null -ne $hashCommand) {{ Remove-Item Function:\\Get-FileHash -ErrorAction Stop }}; $env:PSModulePath = ''; & '{script}' -RepositoryPath '{repository_root}'"
        );
        Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &command,
            ])
            .output()
            .expect("runs import script without PowerShell module auto-loading")
    }

    fn request(root: &Path) -> RepositoryDryRunRequest {
        RepositoryDryRunRequest {
            repository_path: root.to_string_lossy().into_owned(),
            record_id: RECORD_ID.to_owned(),
            content_type: "science-article".to_owned(),
            branch_name: format!("content/20260724-{RECORD_ID}"),
            content_targets: vec![
                format!("content/records/science-article/{RECORD_ID}/record.json"),
                format!("content/records/science-article/{RECORD_ID}/zh.md"),
                format!("content/media/{IMAGE_ID}.json"),
            ],
            image_targets: vec![
                format!("public/images/uploads/2026/07/{IMAGE_ID}.webp"),
                format!("public/images/uploads/2026/07/{IMAGE_ID}.thumbnail.webp"),
            ],
        }
    }

    fn local_commit_request(root: &Path) -> RepositoryLocalCommitRequest {
        let record_path = format!("content/records/science-article/{RECORD_ID}/record.json");
        let body_path = format!("content/records/science-article/{RECORD_ID}/zh.md");
        let metadata_path = format!("content/media/{IMAGE_ID}.json");
        let image_path = format!("public/images/uploads/2026/07/{IMAGE_ID}.webp");
        RepositoryLocalCommitRequest {
            plan: RepositoryDryRunRequest {
                repository_path: root.to_string_lossy().into_owned(),
                record_id: RECORD_ID.to_owned(),
                content_type: "science-article".to_owned(),
                branch_name: format!("content/20260724-{RECORD_ID}"),
                content_targets: vec![
                    record_path.clone(),
                    body_path.clone(),
                    metadata_path.clone(),
                ],
                image_targets: vec![image_path.clone()],
            },
            expected_head_sha: git(root, &["rev-parse", "HEAD"]),
            expected_base_branch: git(root, &["branch", "--show-current"]),
            draft_id: DRAFT_ID.to_owned(),
            text_files: vec![
                RepositoryTextFile {
                    path: record_path,
                    contents: format!(
                        "{{\n  \"schemaVersion\": 1,\n  \"id\": \"{RECORD_ID}\",\n  \"type\": \"science-article\"\n}}\n"
                    ),
                },
                RepositoryTextFile {
                    path: body_path,
                    contents: "# Fictional local commit\n".to_owned(),
                },
                RepositoryTextFile {
                    path: metadata_path,
                    contents: format!(
                        "{{\n  \"id\": \"{IMAGE_ID}\",\n  \"filePath\": \"{image_path}\"\n}}\n"
                    ),
                },
            ],
            image_files: vec![RepositoryImageFile {
                path: image_path,
                staged_name: format!("{IMAGE_ID}.webp"),
            }],
            confirmed: true,
        }
    }

    fn acceptance_local_commit_request(root: &Path) -> RepositoryLocalCommitRequest {
        let record_root = format!("content/records/team-news/{ACCEPTANCE_RECORD_ID}");
        let record_path = format!("{record_root}/record.json");
        let body_path = format!("{record_root}/zh.md");
        let cover_metadata_path = format!("content/media/{ACCEPTANCE_COVER_ID}.json");
        let body_metadata_path = format!("content/media/{ACCEPTANCE_BODY_ID}.json");
        let cover_path = format!("public/images/uploads/2026/07/{ACCEPTANCE_COVER_ID}.webp");
        let cover_thumbnail_path =
            format!("public/images/uploads/2026/07/{ACCEPTANCE_COVER_ID}.thumbnail.webp");
        let body_image_path = format!("public/images/uploads/2026/07/{ACCEPTANCE_BODY_ID}.webp");
        let record = serde_json::json!({
            "schemaVersion": 1,
            "id": ACCEPTANCE_RECORD_ID,
            "type": "team-news",
            "createdAt": "2026-07-24T09:30:00+08:00",
            "updatedAt": "2026-07-24T09:30:00+08:00",
            "authors": ["stage-08c-author"],
            "tags": ["offline-acceptance"],
            "media": [ACCEPTANCE_COVER_ID, ACCEPTANCE_BODY_ID],
            "shared": {
                "eventDate": "2026-07-24",
                "locationLabel": { "zh": "离线验收环境" },
                "category": "research",
                "pinned": false,
                "coverMediaId": ACCEPTANCE_COVER_ID,
                "galleryMediaIds": [],
                "relatedContentIds": [],
                "participantAuthorIds": [],
                "sources": [{
                    "id": "stage-08c-source",
                    "kind": "other",
                    "title": "Stage 8C 本地验收记录",
                    "verificationStatus": "pending"
                }],
                "disclosureStatus": "approved"
            },
            "locales": {
                "zh": {
                    "state": "approved",
                    "title": "Stage 8C 中文团队动态验收",
                    "summary": "验证离线内容发布候选流程。",
                    "bodyFile": "zh.md",
                    "fields": {
                        "participantDescription": "仅包含虚构验收数据。",
                        "captions": {}
                    },
                    "translationOrigin": "source-authored",
                    "review": {
                        "status": "reviewed",
                        "updatedAt": "2026-07-24",
                        "reviewedAt": "2026-07-24",
                        "version": "1.0",
                        "reviewerIds": ["stage-08c-reviewer"],
                        "references": []
                    }
                },
                "en": { "state": "missing" }
            }
        });
        let media_contents = |id: &str, path: &str, alt: &str| {
            let value = serde_json::json!({
                "schemaVersion": 1,
                "id": id,
                "filePath": path,
                "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "mimeType": "image/webp",
                "bytes": 9,
                "width": 1200,
                "height": 800,
                "uploadedAt": "2026-07-24T09:30:00+08:00",
                "creatorOrProvider": "Stage 8C acceptance author",
                "license": {
                    "identifier": "team-owned",
                    "name": "Stage 8C offline acceptance fixture",
                    "attribution": "Stage 8C acceptance author",
                    "usageScope": "public-site"
                },
                "rightsStatus": "approved",
                "identificationStatus": "not-applicable",
                "identifiablePeople": false,
                "consentState": "not-applicable",
                "alt": { "zh": alt },
                "relatedContentIds": [],
                "legacy": false
            });
            format!("{}\n", serde_json::to_string_pretty(&value).unwrap())
        };

        RepositoryLocalCommitRequest {
            plan: RepositoryDryRunRequest {
                repository_path: root.to_string_lossy().into_owned(),
                record_id: ACCEPTANCE_RECORD_ID.to_owned(),
                content_type: "team-news".to_owned(),
                branch_name: format!("content/20260724-{ACCEPTANCE_RECORD_ID}"),
                content_targets: vec![
                    record_path.clone(),
                    body_path.clone(),
                    cover_metadata_path.clone(),
                    body_metadata_path.clone(),
                ],
                image_targets: vec![
                    cover_path.clone(),
                    cover_thumbnail_path.clone(),
                    body_image_path.clone(),
                ],
            },
            expected_head_sha: git(root, &["rev-parse", "HEAD"]),
            expected_base_branch: git(root, &["branch", "--show-current"]),
            draft_id: ACCEPTANCE_DRAFT_ID.to_owned(),
            text_files: vec![
                RepositoryTextFile {
                    path: record_path,
                    contents: format!("{}\n", serde_json::to_string_pretty(&record).unwrap()),
                },
                RepositoryTextFile {
                    path: body_path,
                    contents: format!(
                        "## Stage 8C 离线发布验收\n\n正文只包含虚构数据。\n\n![Stage 8C 中文正文验收图](media:{ACCEPTANCE_BODY_ID})\n"
                    ),
                },
                RepositoryTextFile {
                    path: cover_metadata_path,
                    contents: media_contents(
                        ACCEPTANCE_COVER_ID,
                        &cover_path,
                        "Stage 8C 中文封面验收图",
                    ),
                },
                RepositoryTextFile {
                    path: body_metadata_path,
                    contents: media_contents(
                        ACCEPTANCE_BODY_ID,
                        &body_image_path,
                        "Stage 8C 中文正文验收图",
                    ),
                },
            ],
            image_files: vec![
                RepositoryImageFile {
                    path: cover_path,
                    staged_name: format!("{ACCEPTANCE_COVER_ID}.webp"),
                },
                RepositoryImageFile {
                    path: cover_thumbnail_path,
                    staged_name: format!("{ACCEPTANCE_COVER_ID}.thumbnail.webp"),
                },
                RepositoryImageFile {
                    path: body_image_path,
                    staged_name: format!("{ACCEPTANCE_BODY_ID}.webp"),
                },
            ],
            confirmed: true,
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

    fn bundle_conflict_codes(result: &super::RepositoryBundlePreflightResult) -> Vec<&str> {
        result
            .conflicts
            .iter()
            .map(|conflict| conflict.code.as_str())
            .collect()
    }

    fn create_content_commit(
        root: &Path,
        publisher: &RepositoryPublisher,
    ) -> super::RepositoryLocalCommitResult {
        publish_local_commit(
            publisher,
            local_commit_request(root),
            |draft_id, staged_name| {
                assert_eq!(draft_id, DRAFT_ID);
                assert_eq!(staged_name, format!("{IMAGE_ID}.webp"));
                Ok(vec![0x52, 0x49, 0x46, 0x46, 0x2d, 0x57, 0x45, 0x42, 0x50])
            },
            PublishFault::None,
        )
        .expect("creates local content commit")
    }

    #[test]
    fn local_commit_creates_one_content_branch_commit_without_advancing_main() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        let request = local_commit_request(&root);
        let base = request.expected_head_sha.clone();

        let result = publish_local_commit(
            &publisher,
            request,
            |draft_id, staged_name| {
                assert_eq!(draft_id, DRAFT_ID);
                assert_eq!(staged_name, format!("{IMAGE_ID}.webp"));
                Ok(vec![0x52, 0x49, 0x46, 0x46, 0x2d, 0x57, 0x45, 0x42, 0x50])
            },
            PublishFault::None,
        )
        .expect("creates local content commit");

        assert_eq!(
            git(&root, &["branch", "--show-current"]),
            result.branch_name
        );
        assert_eq!(git(&root, &["rev-parse", "main"]), base);
        assert_eq!(git(&root, &["rev-parse", "HEAD^"]), base);
        assert_eq!(git(&root, &["rev-list", "--count", "main..HEAD"]), "1");
        assert_eq!(
            git(&root, &["show", "-s", "--format=%s", "HEAD"]),
            result.commit_message
        );
        assert!(git(&root, &["status", "--short"]).is_empty());
        assert_eq!(
            fs::read(root.join(format!("public/images/uploads/2026/07/{IMAGE_ID}.webp")))
                .expect("reads committed image"),
            vec![0x52, 0x49, 0x46, 0x46, 0x2d, 0x57, 0x45, 0x42, 0x50]
        );
        assert_eq!(result.committed_paths.len(), 4);
    }

    #[test]
    fn local_commit_blocks_existing_target_without_repository_mutation() {
        let (temporary, root) = repository_fixture();
        let existing = root
            .join("content")
            .join("records")
            .join("science-article")
            .join(RECORD_ID);
        fs::create_dir_all(&existing).expect("creates existing target parent");
        fs::write(existing.join("record.json"), b"{}\n").expect("writes existing target");
        git(&root, &["add", "--", "content"]);
        git(&root, &["commit", "-m", "test: add conflicting content"]);
        let request = local_commit_request(&root);
        let before = snapshot(&root);
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));

        let error =
            publish_local_commit(&publisher, request, |_, _| Ok(vec![1]), PublishFault::None)
                .expect_err("blocks existing target");

        assert!(matches!(error, RepositoryError::RepositoryBlocked));
        assert_eq!(snapshot(&root), before);
        assert_eq!(git(&root, &["branch", "--show-current"]), "main");
    }

    #[test]
    fn local_commit_failure_restores_branch_head_index_and_files() {
        let (temporary, root) = repository_fixture();
        let staging_root = temporary.path().join("publication-staging");
        let publisher = RepositoryPublisher::new(staging_root.clone());
        let request = local_commit_request(&root);
        let base = request.expected_head_sha.clone();
        let index_before = git(&root, &["ls-files", "--stage"]);

        let error = publish_local_commit(
            &publisher,
            request,
            |_, _| Ok(vec![0x52, 0x49, 0x46, 0x46]),
            PublishFault::AfterStage,
        )
        .expect_err("injects failure after exact staging");

        assert!(matches!(error, RepositoryError::InjectedFailure));
        assert_eq!(git(&root, &["branch", "--show-current"]), "main");
        assert_eq!(git(&root, &["rev-parse", "HEAD"]), base);
        assert_eq!(git(&root, &["ls-files", "--stage"]), index_before);
        assert!(git(&root, &["status", "--short"]).is_empty());
        assert!(git(
            &root,
            &["branch", "--list", &format!("content/20260724-{RECORD_ID}")]
        )
        .is_empty());
        assert!(!root.join("content").exists());
        assert!(!root.join("public").exists());
        assert_eq!(
            fs::read_dir(staging_root)
                .expect("reads staging root")
                .count(),
            0
        );
    }

    #[test]
    fn protected_main_target_is_rejected_before_any_write() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        let mut request = local_commit_request(&root);
        request.plan.branch_name = "main".to_owned();
        let before = snapshot(&root);

        assert!(
            publish_local_commit(&publisher, request, |_, _| Ok(vec![1]), PublishFault::None,)
                .is_err()
        );
        assert_eq!(snapshot(&root), before);
        assert_eq!(git(&root, &["branch", "--show-current"]), "main");
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

    #[test]
    fn bundle_export_creates_verified_delivery_and_temporary_branch_import() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        let commit = create_content_commit(&root, &publisher);
        let usb_root = temporary.path().join("usb");
        fs::create_dir(&usb_root).expect("creates USB parent");
        let destination = usb_root.join("content-handoff");
        let preflight_request = RepositoryBundlePreflightRequest {
            repository_path: root.to_string_lossy().into_owned(),
            destination_directory: destination.to_string_lossy().into_owned(),
        };

        let preflight =
            inspect_repository_bundle(preflight_request.clone()).expect("preflights bundle");

        assert!(preflight.ready, "{:#?}", preflight.conflicts);
        assert_eq!(
            preflight.branch_name.as_deref(),
            Some(commit.branch_name.as_str())
        );
        assert_eq!(
            preflight.head_sha.as_deref(),
            Some(commit.commit_sha.as_str())
        );
        assert_eq!(preflight.changed_files.len(), 4);

        let result = export_repository_bundle(
            &publisher,
            RepositoryBundleExportRequest {
                repository_path: preflight_request.repository_path,
                destination_directory: preflight_request.destination_directory,
                expected_branch_name: commit.branch_name.clone(),
                expected_head_sha: commit.commit_sha.clone(),
                confirmed: true,
            },
        )
        .expect("exports bundle delivery");

        assert!(destination.is_dir());
        assert_eq!(
            result.bundle_file_name,
            "content-20260724-fictional-dry-run-v1.bundle"
        );
        assert_eq!(result.artifact_names.len(), 7);
        assert!(result
            .artifact_names
            .contains(&"Import-Bundle.ps1".to_owned()));
        assert_eq!(
            fs::read_to_string(destination.join(format!("{}.sha256.txt", result.bundle_file_name)))
                .expect("reads sidecar"),
            format!("{}  {}\r\n", result.sha256, result.bundle_file_name)
        );
        git(
            &root,
            &[
                "bundle",
                "verify",
                destination
                    .join(&result.bundle_file_name)
                    .to_string_lossy()
                    .as_ref(),
            ],
        );
        assert!(git(&root, &["status", "--short"]).is_empty());

        let (_integration_temporary, integration_root) = repository_fixture();
        let integration_head = git(&integration_root, &["rev-parse", "HEAD"]);
        let script = destination.join("Import-Bundle.ps1");
        let script_contents = fs::read_to_string(&script).expect("reads import script");
        assert!(script_contents.contains("function Get-Sha256Hex"));
        assert!(!script_contents.contains("Get-FileHash"));
        let imported = run_import_script(&script, &integration_root);
        assert!(
            imported.status.success(),
            "{}",
            String::from_utf8_lossy(&imported.stderr)
        );
        assert_eq!(
            git(&integration_root, &["branch", "--show-current"]),
            "main"
        );
        assert_eq!(
            git(&integration_root, &["rev-parse", "HEAD"]),
            integration_head
        );
        assert_eq!(
            git(
                &integration_root,
                &[
                    "rev-parse",
                    "--verify",
                    &format!("refs/heads/{}", result.import_branch_name)
                ],
            ),
            commit.commit_sha
        );
        assert!(git(&integration_root, &["status", "--short"]).is_empty());

        let sidecar = destination.join(format!("{}.sha256.txt", result.bundle_file_name));
        let valid_sidecar = fs::read(&sidecar).expect("reads valid sidecar");
        fs::write(
            &sidecar,
            format!("{}  {}\r\n", "0".repeat(64), result.bundle_file_name),
        )
        .expect("writes invalid sidecar");
        let (_invalid_temporary, invalid_root) = repository_fixture();
        let invalid_head = git(&invalid_root, &["rev-parse", "HEAD"]);
        let invalid_import = run_import_script(&script, &invalid_root);
        assert!(!invalid_import.status.success());
        assert_eq!(git(&invalid_root, &["branch", "--show-current"]), "main");
        assert_eq!(git(&invalid_root, &["rev-parse", "HEAD"]), invalid_head);
        assert!(git(&invalid_root, &["status", "--short"]).is_empty());
        assert!(git(
            &invalid_root,
            &["branch", "--list", &result.import_branch_name]
        )
        .is_empty());

        fs::write(&sidecar, valid_sidecar).expect("restores valid sidecar");
        fs::remove_file(&sidecar).expect("removes sidecar");
        let (_missing_temporary, missing_root) = repository_fixture();
        let missing_head = git(&missing_root, &["rev-parse", "HEAD"]);
        let missing_import = run_import_script(&script, &missing_root);
        assert!(!missing_import.status.success());
        assert_eq!(git(&missing_root, &["branch", "--show-current"]), "main");
        assert_eq!(git(&missing_root, &["rev-parse", "HEAD"]), missing_head);
        assert!(git(&missing_root, &["status", "--short"]).is_empty());
        assert!(git(
            &missing_root,
            &["branch", "--list", &result.import_branch_name]
        )
        .is_empty());
    }

    #[test]
    fn stage_8c_team_news_candidate_commits_bundles_and_imports_offline() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        let request = acceptance_local_commit_request(&root);
        let base_commit = request.expected_head_sha.clone();
        let commit = publish_local_commit(
            &publisher,
            request,
            |draft_id, staged_name| {
                assert_eq!(draft_id, ACCEPTANCE_DRAFT_ID);
                assert!(matches!(
                    staged_name,
                    name if name == format!("{ACCEPTANCE_COVER_ID}.webp")
                        || name == format!("{ACCEPTANCE_COVER_ID}.thumbnail.webp")
                        || name == format!("{ACCEPTANCE_BODY_ID}.webp")
                ));
                Ok(format!("RIFF-{staged_name}-WEBP").into_bytes())
            },
            PublishFault::None,
        )
        .expect("commits Stage 8C content candidate");

        assert_eq!(commit.previous_head_sha, base_commit);
        assert_eq!(commit.committed_paths.len(), 7);
        assert_eq!(git(&root, &["rev-list", "--count", "main..HEAD"]), "1");
        assert!(git(&root, &["status", "--short"]).is_empty());
        assert!(!root
            .join(format!(
                "content/records/team-news/{ACCEPTANCE_RECORD_ID}/en.md"
            ))
            .exists());

        let usb_root = temporary.path().join("usb");
        fs::create_dir(&usb_root).expect("creates acceptance USB parent");
        let destination = usb_root.join("stage-08c-content-candidate");
        let preflight_request = RepositoryBundlePreflightRequest {
            repository_path: root.to_string_lossy().into_owned(),
            destination_directory: destination.to_string_lossy().into_owned(),
        };
        let preflight = inspect_repository_bundle(preflight_request.clone())
            .expect("preflights Stage 8C bundle");
        assert!(preflight.ready, "{:#?}", preflight.conflicts);
        assert_eq!(preflight.changed_files.len(), 7);

        let result = export_repository_bundle(
            &publisher,
            RepositoryBundleExportRequest {
                repository_path: preflight_request.repository_path,
                destination_directory: preflight_request.destination_directory,
                expected_branch_name: commit.branch_name.clone(),
                expected_head_sha: commit.commit_sha.clone(),
                confirmed: true,
            },
        )
        .expect("exports Stage 8C bundle");
        assert_eq!(
            result.bundle_file_name,
            "content-20260724-stage-08c-team-news-v1.bundle"
        );
        assert_eq!(result.artifact_names.len(), 7);

        let (_integration_temporary, integration_root) = repository_fixture();
        let integration_head = git(&integration_root, &["rev-parse", "HEAD"]);
        let imported = run_import_script(&destination.join("Import-Bundle.ps1"), &integration_root);
        assert!(
            imported.status.success(),
            "{}",
            String::from_utf8_lossy(&imported.stderr)
        );
        assert_eq!(
            git(&integration_root, &["rev-parse", "HEAD"]),
            integration_head
        );
        let imported_ref = format!("refs/heads/{}", result.import_branch_name);
        assert_eq!(
            git(&integration_root, &["rev-parse", "--verify", &imported_ref]),
            commit.commit_sha
        );
        let imported_paths = git(
            &integration_root,
            &["ls-tree", "-r", "--name-only", &imported_ref],
        );
        assert!(imported_paths.contains(&format!(
            "content/records/team-news/{ACCEPTANCE_RECORD_ID}/zh.md"
        )));
        assert!(imported_paths.contains(&format!(
            "public/images/uploads/2026/07/{ACCEPTANCE_COVER_ID}.thumbnail.webp"
        )));
        assert!(!imported_paths.contains(&format!(
            "content/records/team-news/{ACCEPTANCE_RECORD_ID}/en.md"
        )));
        assert!(git(&integration_root, &["status", "--short"]).is_empty());
    }

    #[test]
    fn bundle_preflight_blocks_dirty_remote_and_existing_destination() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        create_content_commit(&root, &publisher);
        let usb_root = temporary.path().join("usb");
        fs::create_dir(&usb_root).expect("creates USB parent");
        let destination = usb_root.join("existing-delivery");
        fs::create_dir(&destination).expect("creates existing delivery");
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

        let result = inspect_repository_bundle(RepositoryBundlePreflightRequest {
            repository_path: root.to_string_lossy().into_owned(),
            destination_directory: destination.to_string_lossy().into_owned(),
        })
        .expect("inspects blocked bundle");
        let codes = bundle_conflict_codes(&result);

        assert!(!result.ready);
        assert!(codes.contains(&"WORKTREE_DIRTY"));
        assert!(codes.contains(&"REMOTE_PRESENT"));
        assert!(codes.contains(&"DESTINATION_EXISTS"));
        assert_eq!(fs::read(root.join("operator-note.txt")).unwrap(), b"keep\n");
    }

    #[test]
    fn bundle_export_rejects_a_stale_preflight_head_without_creating_delivery() {
        let (temporary, root) = repository_fixture();
        let publisher = RepositoryPublisher::new(temporary.path().join("publication-staging"));
        let commit = create_content_commit(&root, &publisher);
        let usb_root = temporary.path().join("usb");
        fs::create_dir(&usb_root).expect("creates USB parent");
        let destination = usb_root.join("stale-delivery");

        let error = export_repository_bundle(
            &publisher,
            RepositoryBundleExportRequest {
                repository_path: root.to_string_lossy().into_owned(),
                destination_directory: destination.to_string_lossy().into_owned(),
                expected_branch_name: commit.branch_name,
                expected_head_sha: "a".repeat(40),
                confirmed: true,
            },
        )
        .expect_err("rejects stale bundle preflight");

        assert!(matches!(error, RepositoryError::BundleChanged));
        assert!(!destination.exists());
        assert!(git(&root, &["status", "--short"]).is_empty());
    }
}
