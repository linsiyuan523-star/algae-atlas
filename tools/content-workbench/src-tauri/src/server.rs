use crate::repository::{
    self, RepositoryBundleExportRequest, RepositoryBundlePreflightRequest, RepositoryPublisher,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::HashSet,
    ffi::OsString,
    io::Read,
    path::Path,
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;
use tempfile::Builder;
use uuid::Uuid;

const SSH_HOST: &str = "algae-server";
const CONTROLLER_PATH: &str = "/usr/local/sbin/algae-contentctl";
const REMOTE_INCOMING_ROOT: &str = "algae-server:/home/ubuntu/algae-content-workbench/incoming/";
const REMOTE_INCOMING_DIRECTORY: &str = "/home/ubuntu/algae-content-workbench/incoming";
const MAX_SERVER_JSON_BYTES: usize = 256 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const MAX_LOG_TAIL_BYTES: usize = 4 * 1024;
const MAX_SERVER_ITEMS: usize = 10_000;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const QUERY_TIMEOUT: Duration = Duration::from_secs(30);
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(120);
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const LOCAL_VALIDATOR_TIMEOUT: Duration = Duration::from_secs(90);

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
pub struct PublishContentRequest {
    pub repository_path: String,
    pub content_type: String,
    pub stable_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteServerContentRequest {
    pub content_type: String,
    pub stable_id: String,
}

/// A stable envelope for every server-facing Tauri command.
///
/// The flattened fields contain the controller's validated JSON fields except
/// for the normalized envelope fields (`ok`, `action`, `code`, `message`,
/// `logTail`).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCommandResult {
    pub ok: bool,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_tail: Option<String>,
    #[serde(flatten)]
    pub details: Map<String, Value>,
}

impl ServerCommandResult {
    fn success(action: &str, message: impl Into<String>, details: Option<Value>) -> Self {
        Self {
            ok: true,
            action: action.to_owned(),
            code: None,
            message: message.into(),
            log_tail: None,
            details: details_map(details),
        }
    }

    fn error(
        action: &str,
        code: &str,
        message: impl Into<String>,
        log_tail: Option<String>,
        details: Option<Value>,
    ) -> Self {
        Self {
            ok: false,
            action: action.to_owned(),
            code: Some(code.to_owned()),
            message: message.into(),
            log_tail,
            details: details_map(details),
        }
    }
}

fn details_map(details: Option<Value>) -> Map<String, Value> {
    match details {
        Some(Value::Object(object)) => object,
        _ => Map::new(),
    }
}

#[tauri::command]
pub async fn test_server_connection() -> ServerCommandResult {
    spawn_server_command("connection", test_connection).await
}

#[tauri::command]
pub async fn get_server_status() -> ServerCommandResult {
    spawn_server_command("status", || {
        let response = controller_json(
            "status",
            &["sudo", "-n", CONTROLLER_PATH, "status", "--json"],
            QUERY_TIMEOUT,
        );
        if response.ok {
            validate_status_response(response)
        } else {
            response
        }
    })
    .await
}

#[tauri::command]
pub async fn list_server_content() -> ServerCommandResult {
    spawn_server_command("list", || {
        let response = controller_json(
            "list",
            &["sudo", "-n", CONTROLLER_PATH, "list", "--json"],
            QUERY_TIMEOUT,
        );
        if response.ok {
            validate_list_response(response)
        } else {
            response
        }
    })
    .await
}

#[tauri::command]
pub async fn publish_content_to_server(
    app: tauri::AppHandle,
    request: PublishContentRequest,
) -> Result<ServerCommandResult, String> {
    let publisher = app.state::<RepositoryPublisher>().inner().clone();
    Ok(spawn_server_command("publish", move || publish_content(&publisher, request)).await)
}

#[tauri::command]
pub async fn delete_server_content(request: DeleteServerContentRequest) -> ServerCommandResult {
    spawn_server_command("delete", move || {
        if let Err(field) = validate_content_identity(&request.content_type, &request.stable_id) {
            return invalid_request("delete", field);
        }

        let response = controller_json(
            "delete",
            &[
                "sudo",
                "-n",
                CONTROLLER_PATH,
                "delete",
                "--type",
                &request.content_type,
                "--id",
                &request.stable_id,
                "--json",
            ],
            PUBLISH_TIMEOUT,
        );
        validate_mutation_identity(response, &request.content_type, &request.stable_id)
    })
    .await
}

async fn spawn_server_command<F>(action: &'static str, operation: F) -> ServerCommandResult
where
    F: FnOnce() -> ServerCommandResult + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(operation).await {
        Ok(result) => result,
        Err(_) => ServerCommandResult::error(
            action,
            "COMMAND_ABORTED",
            "The server command stopped before producing a result.",
            None,
            None,
        ),
    }
}

fn publish_content(
    publisher: &RepositoryPublisher,
    request: PublishContentRequest,
) -> ServerCommandResult {
    if let Err(field) = validate_publish_request(&request) {
        return invalid_request("publish", field);
    }

    let connection = test_connection();
    if !connection.ok {
        return ServerCommandResult {
            action: "publish".to_owned(),
            ..connection
        };
    }

    let temporary = match Builder::new().prefix("algae-server-publish-").tempdir() {
        Ok(temporary) => temporary,
        Err(_) => {
            return ServerCommandResult::error(
                "publish",
                "TEMPORARY_DIRECTORY_FAILED",
                "Could not create a temporary Bundle delivery directory.",
                None,
                None,
            );
        }
    };
    let job_id = Uuid::new_v4().simple().to_string();
    let upload_root = temporary.path().join(&job_id);
    // The controller requires the uploaded delivery itself to be the direct
    // child of its incoming root, so the job directory contains the nine
    // standard artifacts without an extra nesting level. The destination must
    // stay absent until the existing atomic Bundle exporter installs it.
    let delivery = upload_root.clone();

    let export = match export_server_delivery(publisher, &request, &delivery) {
        Ok(export) => export,
        Err(error) => return *error,
    };
    if let Err(error) = validate_portable_bundle(&delivery, &export.bundle_file_name) {
        return *error;
    }
    if let Err(error) = upload_delivery(&upload_root) {
        return *error;
    }

    let remote_delivery = format!("{REMOTE_INCOMING_DIRECTORY}/{job_id}");
    let response = controller_json(
        "publish",
        &[
            "sudo",
            "-n",
            CONTROLLER_PATH,
            "publish",
            "--bundle",
            &remote_delivery,
            "--json",
        ],
        PUBLISH_TIMEOUT,
    );
    validate_mutation_identity(response, &request.content_type, &request.stable_id)
}

fn validate_publish_request(request: &PublishContentRequest) -> Result<(), &'static str> {
    if request.repository_path.trim().is_empty()
        || request.repository_path.len() > 32 * 1024
        || request.repository_path.contains('\0')
    {
        return Err("repositoryPath");
    }
    validate_content_identity(&request.content_type, &request.stable_id)
}

fn validate_content_identity(content_type: &str, stable_id: &str) -> Result<(), &'static str> {
    if !CONTENT_TYPES.contains(&content_type) {
        return Err("contentType");
    }
    if !is_stable_id(stable_id) {
        return Err("stableId");
    }
    Ok(())
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

fn invalid_request(action: &str, field: &str) -> ServerCommandResult {
    ServerCommandResult::error(
        action,
        "INVALID_REQUEST",
        format!("The {field} field is invalid."),
        None,
        None,
    )
}

fn export_server_delivery(
    publisher: &RepositoryPublisher,
    request: &PublishContentRequest,
    delivery: &Path,
) -> Result<repository::RepositoryBundleExportResult, Box<ServerCommandResult>> {
    let destination_directory = display_path(delivery);
    let preflight = repository::inspect_repository_bundle(RepositoryBundlePreflightRequest {
        repository_path: request.repository_path.clone(),
        destination_directory: destination_directory.clone(),
    })
    .map_err(|_| {
        Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_PREFLIGHT_FAILED",
            "The repository could not be inspected for a Bundle delivery.",
            None,
            None,
        ))
    })?;

    if !preflight.ready {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_PREFLIGHT_FAILED",
            "The repository is not ready for direct server publishing.",
            None,
            Some(json!({ "conflicts": preflight.conflicts })),
        )));
    }
    if !bundle_matches_request(&preflight, &request.content_type, &request.stable_id) {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_SCOPE_MISMATCH",
            "The current Bundle does not match the requested content type and stable ID.",
            None,
            Some(json!({ "changedFiles": preflight.changed_files })),
        )));
    }

    let branch_name = preflight.branch_name.ok_or_else(|| {
        Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_PREFLIGHT_FAILED",
            "The content branch could not be determined.",
            None,
            None,
        ))
    })?;
    let head_sha = preflight.head_sha.ok_or_else(|| {
        Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_PREFLIGHT_FAILED",
            "The Bundle commit could not be determined.",
            None,
            None,
        ))
    })?;

    repository::export_repository_bundle(
        publisher,
        RepositoryBundleExportRequest {
            repository_path: request.repository_path.clone(),
            destination_directory,
            expected_branch_name: branch_name,
            expected_head_sha: head_sha,
            confirmed: true,
        },
    )
    .map_err(|_| {
        Box::new(ServerCommandResult::error(
            "publish",
            "BUNDLE_EXPORT_FAILED",
            "The standard Bundle delivery could not be created.",
            None,
            None,
        ))
    })
}

fn bundle_matches_request(
    preflight: &repository::RepositoryBundlePreflightResult,
    content_type: &str,
    stable_id: &str,
) -> bool {
    let Some(branch) = preflight.branch_name.as_deref() else {
        return false;
    };
    if repository::bundle_record_id(branch) != Some(stable_id) {
        return false;
    }

    let record_prefix = format!("content/records/{content_type}/{stable_id}/");
    let required_record = format!("{record_prefix}record.json");
    preflight
        .changed_files
        .iter()
        .any(|path| path == &required_record)
        && preflight
            .changed_files
            .iter()
            .all(|path| server_bundle_path_allowed(path, &record_prefix))
}

fn server_bundle_path_allowed(path: &str, record_prefix: &str) -> bool {
    if let Some(file_name) = path.strip_prefix(record_prefix) {
        return matches!(file_name, "record.json" | "zh.md" | "en.md");
    }
    ["content/authors/", "content/media/"]
        .iter()
        .filter_map(|prefix| path.strip_prefix(prefix))
        .any(valid_content_metadata_name)
        || valid_public_image_path(path)
}

fn valid_public_image_path(path: &str) -> bool {
    let Some(relative) = path.strip_prefix("public/images/uploads/") else {
        return false;
    };
    let parts = relative.split('/').collect::<Vec<_>>();
    parts.len() == 3
        && parts[0].len() == 4
        && parts[0].bytes().all(|byte| byte.is_ascii_digit())
        && matches!(
            parts[1],
            "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"
        )
        && valid_public_image_name(parts[2])
}

fn valid_public_image_name(file_name: &str) -> bool {
    [".thumbnail.webp", ".webp", ".jpeg", ".jpg", ".png", ".avif"]
        .iter()
        .find_map(|suffix| file_name.strip_suffix(suffix))
        .is_some_and(is_stable_id)
}

fn valid_content_metadata_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && !value.contains('/')
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_alphanumeric())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn validate_portable_bundle(
    delivery: &Path,
    bundle_file_name: &str,
) -> Result<(), Box<ServerCommandResult>> {
    let validator = delivery.join("validate-bundle.mjs");
    let bundle = delivery.join(bundle_file_name);
    let output = run_process(CommandSpec::new(
        "node",
        vec![validator.into_os_string(), bundle.into_os_string()],
        LOCAL_VALIDATOR_TIMEOUT,
    ))
    .map_err(|failure| Box::new(process_failure("publish", "LOCAL_VALIDATOR", failure)))?;
    if output.stdout.truncated {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "OUTPUT_LIMIT_EXCEEDED",
            "The local Bundle validator produced too much output.",
            output.stderr.log_tail(),
            None,
        )));
    }
    let stdout = String::from_utf8_lossy(&output.stdout.bytes);
    if !output.status.success() || !stdout.lines().any(|line| line == "VALIDATION_RESULT=PASS") {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "LOCAL_VALIDATION_FAILED",
            "The local portable Bundle validator rejected the delivery.",
            output
                .stderr
                .log_tail()
                .or_else(|| bounded_log_tail(&stdout)),
            None,
        )));
    }
    Ok(())
}

fn upload_delivery(upload_root: &Path) -> Result<(), Box<ServerCommandResult>> {
    let output = run_process(scp_command_spec(upload_root))
        .map_err(|failure| Box::new(process_failure("publish", "UPLOAD", failure)))?;
    if output.stdout.truncated {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "OUTPUT_LIMIT_EXCEEDED",
            "The Bundle upload produced too much output.",
            output.stderr.log_tail(),
            None,
        )));
    }
    if !output.status.success() {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "UPLOAD_FAILED",
            "The Bundle delivery could not be uploaded to the server.",
            output.stderr.log_tail(),
            None,
        )));
    }
    Ok(())
}

fn test_connection() -> ServerCommandResult {
    let output = match run_process(ssh_command_spec(
        &["printf", "ALGAE_SSH_OK"],
        CONNECT_TIMEOUT,
    )) {
        Ok(output) => output,
        Err(failure) => return process_failure("connection", "SSH", failure),
    };
    if output.stdout.truncated {
        return ServerCommandResult::error(
            "connection",
            "OUTPUT_LIMIT_EXCEEDED",
            "The SSH connection test produced too much output.",
            output.stderr.log_tail(),
            None,
        );
    }
    let stdout = String::from_utf8_lossy(&output.stdout.bytes);
    if output.status.success() && stdout.trim() == "ALGAE_SSH_OK" {
        return ServerCommandResult::success(
            "connection",
            "SSH connection is available.",
            Some(json!({ "host": SSH_HOST })),
        );
    }
    ServerCommandResult::error(
        "connection",
        "SSH_UNAVAILABLE",
        "The server could not be reached with the configured SSH profile.",
        output
            .stderr
            .log_tail()
            .or_else(|| bounded_log_tail(&stdout)),
        None,
    )
}

fn controller_json(action: &str, remote_args: &[&str], timeout: Duration) -> ServerCommandResult {
    let output = match run_process(ssh_command_spec(remote_args, timeout)) {
        Ok(output) => output,
        Err(failure) => return process_failure(action, "SERVER", failure),
    };
    if output.stdout.truncated {
        return ServerCommandResult::error(
            action,
            "OUTPUT_LIMIT_EXCEEDED",
            "The server controller produced too much output.",
            output.stderr.log_tail(),
            None,
        );
    }

    let parsed = parse_server_json(&output.stdout.bytes, action);
    match parsed {
        Ok(mut response) => {
            if !output.status.success() && response.ok {
                return ServerCommandResult::error(
                    action,
                    "SERVER_COMMAND_FAILED",
                    "The server controller exited before completing the request.",
                    output.stderr.log_tail(),
                    (!response.details.is_empty()).then_some(Value::Object(response.details)),
                );
            }
            if !response.ok && response.log_tail.is_none() {
                response.log_tail = output.stderr.log_tail();
            }
            response
        }
        Err(_) => {
            let ssh_unavailable = output.status.code() == Some(255);
            ServerCommandResult::error(
                action,
                if ssh_unavailable {
                    "SSH_UNAVAILABLE"
                } else if output.status.success() {
                    "SERVER_RESPONSE_INVALID"
                } else {
                    "SERVER_COMMAND_FAILED"
                },
                if ssh_unavailable {
                    "The server could not be reached with the configured SSH profile."
                } else if output.status.success() {
                    "The server controller returned invalid JSON."
                } else {
                    "The server controller did not complete the request."
                },
                output.stderr.log_tail(),
                None,
            )
        }
    }
}

fn parse_server_json(bytes: &[u8], expected_action: &str) -> Result<ServerCommandResult, ()> {
    if bytes.is_empty() || bytes.len() > MAX_SERVER_JSON_BYTES {
        return Err(());
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| ())?;
    let mut object = value.as_object().cloned().ok_or(())?;
    let ok = object.get("ok").and_then(Value::as_bool).ok_or(())?;
    let action = match object.get("action") {
        Some(Value::String(action)) if action == expected_action && valid_action(action) => {
            action.clone()
        }
        None if !ok && valid_action(expected_action) => expected_action.to_owned(),
        _ => return Err(()),
    };

    let code = object.remove("code");
    let message = object.remove("message");
    let log_tail = object.remove("logTail");
    object.remove("ok");
    object.remove("action");

    let code = match code {
        Some(Value::String(code)) if valid_error_code(&code) => Some(code),
        Some(_) => return Err(()),
        None if !ok => return Err(()),
        None => None,
    };
    let message = match message {
        Some(Value::String(message)) if valid_message(&message) => message,
        Some(_) => return Err(()),
        None if ok => "Server request completed.".to_owned(),
        None => return Err(()),
    };
    let log_tail = match log_tail {
        Some(Value::String(log_tail)) => bounded_log_tail(&log_tail),
        Some(_) => return Err(()),
        None => None,
    };

    Ok(ServerCommandResult {
        ok,
        action,
        code,
        message,
        log_tail,
        details: object,
    })
}

fn validate_list_response(response: ServerCommandResult) -> ServerCommandResult {
    let valid = response
        .details
        .get("items")
        .and_then(Value::as_array)
        .is_some_and(|items| {
            if items.len() > MAX_SERVER_ITEMS {
                return false;
            }
            let mut identities = HashSet::with_capacity(items.len());
            items.iter().all(|item| {
                if !valid_server_content_item(item) {
                    return false;
                }
                let Some(object) = item.as_object() else {
                    return false;
                };
                let Some(content_type) = object.get("contentType").and_then(Value::as_str) else {
                    return false;
                };
                let Some(stable_id) = object.get("stableId").and_then(Value::as_str) else {
                    return false;
                };
                identities.insert((content_type.to_owned(), stable_id.to_owned()))
            })
        });
    if valid {
        response
    } else {
        ServerCommandResult::error(
            "list",
            "SERVER_RESPONSE_INVALID",
            "The server content list has an invalid structure.",
            None,
            None,
        )
    }
}

fn validate_status_response(response: ServerCommandResult) -> ServerCommandResult {
    let valid = [
        "ready",
        "contentRepositoryReady",
        "serviceActive",
        "healthy",
    ]
    .iter()
    .all(|key| matches!(response.details.get(*key), Some(Value::Bool(_))))
        && ["currentRelease", "previousRelease"].iter().all(|key| {
            match response.details.get(*key) {
                Some(Value::String(value)) => value.len() <= 4 * 1024,
                Some(Value::Null) | None => true,
                Some(_) => false,
            }
        });
    if valid {
        response
    } else {
        ServerCommandResult::error(
            "status",
            "SERVER_RESPONSE_INVALID",
            "The server status has an invalid structure.",
            None,
            None,
        )
    }
}

fn valid_server_content_item(value: &Value) -> bool {
    let Some(item) = value.as_object() else {
        return false;
    };
    let Some(content_type) = item.get("contentType").and_then(Value::as_str) else {
        return false;
    };
    let Some(stable_id) = item.get("stableId").and_then(Value::as_str) else {
        return false;
    };
    if validate_content_identity(content_type, stable_id).is_err() {
        return false;
    }
    ["title", "url", "zhUrl", "urlZh", "status", "updatedAt"]
        .iter()
        .all(|key| match item.get(*key) {
            Some(Value::String(value)) if matches!(*key, "url" | "zhUrl" | "urlZh") => {
                valid_https_url(value)
            }
            Some(Value::String(value)) => value.len() <= 8 * 1024,
            Some(Value::Null) | None => true,
            Some(_) => false,
        })
}

fn validate_mutation_identity(
    response: ServerCommandResult,
    content_type: &str,
    stable_id: &str,
) -> ServerCommandResult {
    if !response.ok {
        return response;
    }
    let content_type_matches = matches!(response.details.get("contentType"), Some(Value::String(value)) if value == content_type);
    let stable_id_matches = matches!(response.details.get("stableId"), Some(Value::String(value)) if value == stable_id);
    let url_valid = ["url", "zhUrl", "urlZh"].iter().any(|key| {
        response
            .details
            .get(*key)
            .and_then(Value::as_str)
            .is_some_and(valid_https_url)
    });
    let release_valid = response
        .details
        .get("releaseSha")
        .and_then(Value::as_str)
        .is_some_and(valid_release_sha);
    let publish_details_valid = response.action != "publish" || (url_valid && release_valid);
    if content_type_matches && stable_id_matches && publish_details_valid {
        response
    } else {
        ServerCommandResult::error(
            &response.action,
            "SERVER_RESPONSE_MISMATCH",
            "The server response does not match the requested content item.",
            None,
            None,
        )
    }
}

fn valid_https_url(value: &str) -> bool {
    if value.len() > 8 * 1024
        || !value.starts_with("https://")
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
    {
        return false;
    }
    let authority = value[8..].split(['/', '?', '#']).next().unwrap_or_default();
    !authority.is_empty()
        && !authority.starts_with('.')
        && !authority.ends_with('.')
        && !authority.contains(['@', '\\'])
        && authority.split_once(':').is_none_or(|(_, port)| {
            !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn valid_release_sha(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_action(value: &str) -> bool {
    matches!(value, "status" | "list" | "publish" | "delete")
}

fn valid_error_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

fn valid_message(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 16 * 1024 && !value.chars().any(char::is_control)
}

fn process_failure(action: &str, phase: &str, failure: ProcessFailure) -> ServerCommandResult {
    let (code, message) = match failure {
        ProcessFailure::Spawn => (
            format!("{phase}_TOOL_UNAVAILABLE"),
            "The required local OpenSSH or validator tool is unavailable.",
        ),
        ProcessFailure::Timeout => (
            format!("{phase}_TIMEOUT"),
            "The server operation timed out and the local process was stopped.",
        ),
        ProcessFailure::Wait | ProcessFailure::Capture => (
            format!("{phase}_PROCESS_FAILED"),
            "The local server operation could not be completed.",
        ),
    };
    ServerCommandResult::error(action, &code, message, None, None)
}

#[derive(Clone, Debug)]
struct CommandSpec {
    program: &'static str,
    args: Vec<OsString>,
    timeout: Duration,
}

impl CommandSpec {
    fn new(program: &'static str, args: Vec<OsString>, timeout: Duration) -> Self {
        Self {
            program,
            args,
            timeout,
        }
    }
}

fn ssh_command_spec(remote_args: &[&str], timeout: Duration) -> CommandSpec {
    let mut args = ssh_option_args();
    args.push(OsString::from(SSH_HOST));
    args.extend(remote_args.iter().map(OsString::from));
    CommandSpec::new("ssh", args, timeout)
}

fn scp_command_spec(source: &Path) -> CommandSpec {
    let mut args = vec![OsString::from("-q"), OsString::from("-r")];
    args.extend(ssh_option_args());
    args.push(source.as_os_str().to_owned());
    args.push(OsString::from(REMOTE_INCOMING_ROOT));
    CommandSpec::new("scp", args, UPLOAD_TIMEOUT)
}

fn ssh_option_args() -> Vec<OsString> {
    [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
    ]
    .into_iter()
    .map(OsString::from)
    .collect()
}

#[derive(Debug)]
enum ProcessFailure {
    Spawn,
    Wait,
    Capture,
    Timeout,
}

#[derive(Debug)]
struct ProcessOutput {
    status: ExitStatus,
    stdout: CapturedOutput,
    stderr: CapturedOutput,
}

#[derive(Debug)]
struct CapturedOutput {
    bytes: Vec<u8>,
    truncated: bool,
}

impl CapturedOutput {
    fn log_tail(&self) -> Option<String> {
        bounded_log_tail(&String::from_utf8_lossy(&self.bytes))
    }
}

fn run_process(spec: CommandSpec) -> Result<ProcessOutput, ProcessFailure> {
    let mut command = Command::new(spec.program);
    command
        .args(&spec.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|_| ProcessFailure::Spawn)?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(ProcessFailure::Capture);
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(ProcessFailure::Capture);
        }
    };
    let stdout_reader = thread::spawn(move || capture_stream(stdout, MAX_SERVER_JSON_BYTES, false));
    let stderr_reader = thread::spawn(move || capture_stream(stderr, MAX_STDERR_BYTES, true));

    let deadline = Instant::now() + spec.timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                child.wait().map_err(|_| ProcessFailure::Wait)?;
                // A tool may have spawned a descendant that still owns a
                // pipe. Do not let a timed-out UI command wait indefinitely
                // for that descendant; the direct child has been terminated.
                drop(stdout_reader);
                drop(stderr_reader);
                return Err(ProcessFailure::Timeout);
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                drop(stdout_reader);
                drop(stderr_reader);
                return Err(ProcessFailure::Wait);
            }
        }
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| ProcessFailure::Capture)?
        .map_err(|_| ProcessFailure::Capture)?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| ProcessFailure::Capture)?
        .map_err(|_| ProcessFailure::Capture)?;
    Ok(ProcessOutput {
        status,
        stdout,
        stderr,
    })
}

fn capture_stream<R: Read>(
    mut reader: R,
    limit: usize,
    keep_tail: bool,
) -> std::io::Result<CapturedOutput> {
    let mut bytes = Vec::with_capacity(limit);
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        if keep_tail {
            bytes.extend_from_slice(&buffer[..count]);
            if bytes.len() > limit {
                let excess = bytes.len() - limit;
                bytes.drain(..excess);
                truncated = true;
            }
            continue;
        }
        let available = limit.saturating_sub(bytes.len());
        let retained = available.min(count);
        bytes.extend_from_slice(&buffer[..retained]);
        if retained != count {
            truncated = true;
        }
    }
    Ok(CapturedOutput { bytes, truncated })
}

fn bounded_log_tail(value: &str) -> Option<String> {
    let mut cleaned = value
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect::<String>();
    if cleaned.trim().is_empty() {
        return None;
    }
    if cleaned.len() > MAX_LOG_TAIL_BYTES {
        const TRUNCATION_MARKER: &str = "[truncated] ";
        let tail_limit = MAX_LOG_TAIL_BYTES.saturating_sub(TRUNCATION_MARKER.len());
        let mut start = cleaned.len() - tail_limit;
        while !cleaned.is_char_boundary(start) {
            start += 1;
        }
        cleaned = format!("{TRUNCATION_MARKER}{}", &cleaned[start..]);
    }
    Some(cleaned.trim().to_owned())
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        bundle_matches_request, parse_server_json, scp_command_spec, ssh_command_spec,
        valid_https_url, validate_content_identity, validate_list_response,
        validate_mutation_identity, validate_status_response, CapturedOutput, ServerCommandResult,
    };
    use crate::repository::RepositoryBundlePreflightResult;
    use serde_json::json;
    use std::{ffi::OsString, path::Path, time::Duration};

    fn preflight(branch: &str, changed_files: Vec<&str>) -> RepositoryBundlePreflightResult {
        RepositoryBundlePreflightResult {
            repository_path: "C:\\fake".to_owned(),
            canonical_repository_path: Some("C:\\fake".to_owned()),
            destination_directory: "C:\\delivery".to_owned(),
            branch_name: Some(branch.to_owned()),
            head_sha: Some("a".repeat(40)),
            base_commit_sha: Some("b".repeat(40)),
            bundle_file_name: Some("content-20260726-example-v1.bundle".to_owned()),
            import_branch_name: Some("import/content-20260726-example".to_owned()),
            changed_files: changed_files.into_iter().map(str::to_owned).collect(),
            conflicts: Vec::new(),
            ready: true,
        }
    }

    #[test]
    fn validates_only_known_content_types_and_safe_stable_ids() {
        assert!(validate_content_identity("science-article", "example-id-2").is_ok());
        for invalid in ["../example", "example;whoami", "Example", "example_id", ""] {
            assert!(validate_content_identity("science-article", invalid).is_err());
        }
        assert!(validate_content_identity("unknown-type", "example-id").is_err());
    }

    #[test]
    fn bundle_scope_requires_the_requested_record_and_no_other_record() {
        let valid = preflight(
            "content/20260726-example-id",
            vec![
                "content/records/science-article/example-id/record.json",
                "content/records/science-article/example-id/zh.md",
                "content/media/example-image.json",
            ],
        );
        assert!(bundle_matches_request(
            &valid,
            "science-article",
            "example-id"
        ));

        let other_record = preflight(
            "content/20260726-example-id",
            vec![
                "content/records/science-article/example-id/record.json",
                "content/records/science-article/other-id/record.json",
            ],
        );
        assert!(!bundle_matches_request(
            &other_record,
            "science-article",
            "example-id"
        ));

        let image_delivery = preflight(
            "content/direct-0123456789abcdef0123456789abcdef-example-id",
            vec![
                "content/records/science-article/example-id/record.json",
                "public/images/uploads/2026/07/example.webp",
            ],
        );
        assert!(bundle_matches_request(
            &image_delivery,
            "science-article",
            "example-id"
        ));

        let unsafe_image_delivery = preflight(
            "content/direct-0123456789abcdef0123456789abcdef-example-id",
            vec![
                "content/records/science-article/example-id/record.json",
                "public/images/uploads/2026/07/example.svg",
            ],
        );
        assert!(!bundle_matches_request(
            &unsafe_image_delivery,
            "science-article",
            "example-id"
        ));
    }

    #[test]
    fn parses_one_structured_server_json_object_and_preserves_details() {
        let result = parse_server_json(
            br#"{"ok":true,"action":"publish","contentType":"science-article","stableId":"example-id","releaseSha":"abc123","message":"Published"}"#,
            "publish",
        )
        .expect("parses response");
        assert!(result.ok);
        assert_eq!(result.message, "Published");
        assert_eq!(
            result
                .details
                .get("stableId")
                .and_then(|value| value.as_str()),
            Some("example-id")
        );
        let serialized = serde_json::to_value(&result).expect("serializes response");
        assert_eq!(
            serialized.get("stableId").and_then(|value| value.as_str()),
            Some("example-id")
        );
        assert!(serialized.get("details").is_none());
    }

    #[test]
    fn rejects_unstructured_or_mismatched_server_output() {
        assert!(parse_server_json(b"Published successfully", "publish").is_err());
        assert!(parse_server_json(br#"{"ok":true,"action":"delete"}"#, "publish").is_err());
        assert!(parse_server_json(
            br#"{"ok":false,"action":"publish","message":"failed"}"#,
            "publish"
        )
        .is_err());
        assert!(parse_server_json(br#"{"ok":true,"action":"publish"} extra"#, "publish").is_err());
        let controller_error = parse_server_json(
            br#"{"ok":false,"code":"BUILD_FAILED","message":"Website build failed"}"#,
            "publish",
        )
        .expect("accepts the controller error envelope without a repeated action");
        assert!(!controller_error.ok);
        assert_eq!(controller_error.action, "publish");
        assert_eq!(controller_error.code.as_deref(), Some("BUILD_FAILED"));
    }

    #[test]
    fn validates_list_items_before_returning_them_to_the_frontend() {
        let response = ServerCommandResult::success(
            "list",
            "Listed",
            Some(json!({
                "items": [{
                    "contentType": "science-article",
                    "stableId": "example-id",
                    "title": "Example",
                    "url": "https://example.invalid/zh/example-id",
                    "updatedAt": "2026-07-26T00:00:00Z"
                }]
            })),
        );
        assert!(validate_list_response(response).ok);

        let invalid = ServerCommandResult::success(
            "list",
            "Listed",
            Some(json!({ "items": [{ "contentType": "bad", "stableId": "../bad" }] })),
        );
        assert!(!validate_list_response(invalid).ok);
    }

    #[test]
    fn validates_status_shape_before_returning_it_to_the_frontend() {
        let response = ServerCommandResult::success(
            "status",
            "Checked",
            Some(json!({
                "ready": true,
                "contentRepositoryReady": true,
                "serviceActive": true,
                "healthy": false,
                "currentRelease": "/srv/algae-atlas/releases/example",
                "previousRelease": null
            })),
        );
        assert!(validate_status_response(response).ok);

        let invalid =
            ServerCommandResult::success("status", "Checked", Some(json!({ "ready": "yes" })));
        assert!(!validate_status_response(invalid).ok);
        let incomplete = ServerCommandResult::success(
            "status",
            "Checked",
            Some(json!({
                "ready": true,
                "contentRepositoryReady": true,
                "serviceActive": true,
            })),
        );
        assert!(!validate_status_response(incomplete).ok);
    }

    #[test]
    fn validates_mutation_identity_before_exposing_success() {
        let response = ServerCommandResult::success(
            "publish",
            "Published",
            Some(json!({
                "contentType": "science-article",
                "stableId": "example-id",
                "url": "https://example.invalid/zh/example-id",
                "releaseSha": "a".repeat(40)
            })),
        );
        assert!(validate_mutation_identity(response, "science-article", "example-id").ok);

        let missing_publish_details = ServerCommandResult::success(
            "publish",
            "Published",
            Some(json!({
                "contentType": "science-article",
                "stableId": "example-id"
            })),
        );
        assert!(
            !validate_mutation_identity(missing_publish_details, "science-article", "example-id")
                .ok
        );

        let mismatched = ServerCommandResult::success(
            "publish",
            "Published",
            Some(json!({
                "contentType": "science-article",
                "stableId": "other-id"
            })),
        );
        assert!(!validate_mutation_identity(mismatched, "science-article", "example-id").ok);

        assert!(valid_https_url("https://example.invalid/zh/example-id"));
        for invalid_url in [
            "http://example.invalid/zh/example-id",
            "https://user@example.invalid/zh/example-id",
            "https://example.invalid/zh/example-id\n",
        ] {
            assert!(!valid_https_url(invalid_url));
        }
    }

    #[test]
    fn ssh_and_scp_specs_keep_fixed_commands_and_derived_paths_separate() {
        let ssh = ssh_command_spec(
            &[
                "sudo",
                "-n",
                "/usr/local/sbin/algae-contentctl",
                "delete",
                "--type",
                "science-article",
                "--id",
                "example-id",
                "--json",
            ],
            Duration::from_secs(1),
        );
        assert_eq!(ssh.program, "ssh");
        assert_eq!(ssh.args.last(), Some(&OsString::from("--json")));
        assert!(ssh.args.iter().any(|argument| argument == "algae-server"));

        let scp = scp_command_spec(Path::new("C:\\safe\\job"));
        assert_eq!(scp.program, "scp");
        assert_eq!(scp.args[0], OsString::from("-q"));
        assert_eq!(
            scp.args.last(),
            Some(&OsString::from(
                "algae-server:/home/ubuntu/algae-content-workbench/incoming/"
            ))
        );
    }

    #[test]
    fn log_capture_retains_a_bounded_tail() {
        let capture = CapturedOutput {
            bytes: b"first\nlast\n".to_vec(),
            truncated: false,
        };
        assert_eq!(capture.log_tail().as_deref(), Some("first\nlast"));

        let long = CapturedOutput {
            bytes: vec![b'x'; 32 * 1024],
            truncated: true,
        };
        assert!(long.log_tail().expect("bounded log").len() <= super::MAX_LOG_TAIL_BYTES);
    }
}
