use crate::repository::{
    self, RepositoryBundleExportRequest, RepositoryBundlePreflightRequest, RepositoryPublisher,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
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
use tauri::{Emitter, Manager};
use tempfile::Builder;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

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
const MIN_UPLOAD_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_UPLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const UPLOAD_TIMEOUT_GRACE: Duration = Duration::from_secs(60);
const MIN_UPLOAD_BYTES_PER_SECOND: u64 = 8 * 1024;
const UPLOAD_PERMISSIONS_TIMEOUT: Duration = Duration::from_secs(30);
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const LOCAL_VALIDATOR_TIMEOUT: Duration = Duration::from_secs(90);
const PUBLISH_PROGRESS_EVENT: &str = "server-publish-progress";
const MAX_NETWORK_ATTEMPTS: usize = 3;
const REQUIRED_PUBLISH_PROTOCOL_VERSION: u64 = 1;
const REQUIRED_QUEUE_PROTOCOL_VERSION: u64 = 1;
const REQUIRED_SYNC_PROTOCOL_VERSION: u64 = 1;

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
    pub transaction_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishStatusRequest {
    pub transaction_id: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncStatusRequest {
    #[serde(default)]
    pub transaction_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteServerContentRequest {
    pub content_type: String,
    pub stable_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ControllerStatusProtocol {
    ready: bool,
    content_repository_ready: bool,
    current_release: Option<String>,
    previous_release: Option<String>,
    service_active: bool,
    healthy: bool,
    #[serde(default)]
    publish_protocol_version: Option<u64>,
    #[serde(default)]
    queue_protocol_version: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
struct PendingStatusProtocol {
    schema_version: u64,
    published_content_commit: String,
    pending_content_commit: String,
    syncing_content_commit: Option<String>,
    has_pending_changes: bool,
    pending_upload_count: u64,
    latest_upload_transaction_id: Option<String>,
    active_sync_transaction_id: Option<String>,
    last_sync_transaction_id: Option<String>,
    last_sync_status: Option<SyncStatusProtocol>,
    blocked_content_commit: Option<String>,
    next_scheduled_sync_at: String,
    sync_timer_active: bool,
    server_time: String,
    site_commit: String,
    queue_protocol_version: u64,
    sync_protocol_version: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum UploadStatusProtocol {
    Failed,
    Queued,
    Coalesced,
    Syncing,
    Published,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueueUploadProtocol {
    schema_version: u64,
    transaction_id: String,
    bundle_sha256: String,
    source_commit: String,
    content_commit: String,
    status: UploadStatusProtocol,
    queued_at: String,
    coalesced_into_commit: String,
    included_in_sync_transaction_id: String,
    published_release_id: String,
    #[serde(default)]
    published_at: String,
    retryable: bool,
    error_code: String,
    content_type: String,
    stable_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum SyncStatusProtocol {
    Created,
    Snapshotting,
    PreparingSource,
    PreparingDependencies,
    Checking,
    Building,
    Switching,
    Verifying,
    Published,
    FailedRetryable,
    FailedBlocked,
    Recovering,
    SkippedNoPending,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum SyncTriggerProtocol {
    Scheduled,
    Manual,
    Recovery,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
struct SyncTransactionProtocol {
    schema_version: u64,
    sync_transaction_id: String,
    active_sync_transaction_id: String,
    last_sync_transaction_id: String,
    status: SyncStatusProtocol,
    stage: SyncStatusProtocol,
    trigger: SyncTriggerProtocol,
    content_commit: String,
    source_content_commit: String,
    site_commit: String,
    release_id: String,
    release_path: String,
    started_at: String,
    updated_at: String,
    completed_at: String,
    #[serde(default)]
    stage_started_at: String,
    elapsed_ms: u64,
    retryable: bool,
    blocked: bool,
    error_code: String,
    attempt: u64,
    max_attempts: u64,
    recovered: bool,
    switch_completed: bool,
    health_verified: bool,
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
    spawn_server_command("status", query_server_status).await
}

#[tauri::command]
pub async fn negotiate_server_capabilities() -> ServerCommandResult {
    spawn_server_command("capabilities", negotiate_capabilities).await
}

#[tauri::command]
pub async fn get_pending_status() -> ServerCommandResult {
    spawn_server_command("pending-status", query_pending_status).await
}

#[tauri::command]
pub async fn get_sync_status(request: SyncStatusRequest) -> ServerCommandResult {
    spawn_server_command("sync-status", move || {
        if request
            .transaction_id
            .as_deref()
            .is_some_and(|transaction_id| !is_sync_transaction_id(transaction_id))
        {
            return invalid_request("sync-status", "transactionId");
        }
        query_sync_status(request.transaction_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn sync_pending_now() -> ServerCommandResult {
    spawn_server_command("sync-pending", || {
        let response = controller_json("sync-pending", &manual_sync_remote_args(), PUBLISH_TIMEOUT);
        validate_sync_response(response, "sync-pending")
    })
    .await
}

fn manual_sync_remote_args() -> [&'static str; 7] {
    [
        "sudo",
        "-n",
        CONTROLLER_PATH,
        "sync-pending",
        "--trigger",
        "manual",
        "--json",
    ]
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
pub async fn get_publish_status(request: PublishStatusRequest) -> ServerCommandResult {
    spawn_server_command("publish-status", move || {
        if !is_publish_transaction_id(&request.transaction_id) {
            return invalid_request("publish-status", "transactionId");
        }
        query_publish_status(&request.transaction_id)
    })
    .await
}

#[tauri::command]
pub async fn publish_content_to_server(
    app: tauri::AppHandle,
    request: PublishContentRequest,
) -> Result<ServerCommandResult, String> {
    let publisher = app.state::<RepositoryPublisher>().inner().clone();
    let publish_app = app.clone();
    Ok(spawn_server_command("publish", move || {
        publish_content(&publish_app, &publisher, request)
    })
    .await)
}

#[tauri::command]
pub async fn queue_content_to_server(
    app: tauri::AppHandle,
    request: PublishContentRequest,
) -> Result<ServerCommandResult, String> {
    let publisher = app.state::<RepositoryPublisher>().inner().clone();
    let publish_app = app.clone();
    Ok(spawn_server_command("queue-upload", move || {
        queue_content(&publish_app, &publisher, request)
    })
    .await)
}

#[tauri::command]
pub async fn queue_delete_content_from_server(
    app: tauri::AppHandle,
    request: PublishContentRequest,
) -> Result<ServerCommandResult, String> {
    let publisher = app.state::<RepositoryPublisher>().inner().clone();
    let publish_app = app.clone();
    Ok(spawn_server_command("queue-upload", move || {
        if let Err(field) = validate_publish_request(&request) {
            return invalid_request("queue-upload", field);
        }
        let existing = query_publish_status(&request.transaction_id);
        if existing.ok && !status_allows_publish_retry(&existing) {
            return transaction_result_from_status(existing, &request, PublishMode::Queue);
        }
        if !existing.ok && existing.code.as_deref() != Some("TRANSACTION_NOT_FOUND") {
            return transaction_error_for(existing, &request.transaction_id, PublishMode::Queue);
        }
        if repository::ensure_direct_delete_commit(
            &publisher,
            &request.repository_path,
            &request.content_type,
            &request.stable_id,
            &request.transaction_id,
        )
        .is_err()
        {
            return transaction_error_for(
                ServerCommandResult::error(
                    "queue-upload",
                    "DELETE_COMMIT_FAILED",
                    "The local content deletion commit could not be created safely.",
                    None,
                    None,
                ),
                &request.transaction_id,
                PublishMode::Queue,
            );
        }
        queue_content(&publish_app, &publisher, request)
    })
    .await)
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

fn query_server_status() -> ServerCommandResult {
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
}

fn negotiate_capabilities() -> ServerCommandResult {
    let status = query_server_status();
    if !status.ok {
        return status_with_action(status, "capabilities");
    }
    let Some(protocol) = protocol_details::<ControllerStatusProtocol>(&status) else {
        return protocol_invalid("capabilities", "Server capability status is invalid.");
    };
    let publish_version = protocol.publish_protocol_version.unwrap_or(0);
    let queue_version = protocol.queue_protocol_version.unwrap_or(0);
    if publish_version < REQUIRED_PUBLISH_PROTOCOL_VERSION {
        return ServerCommandResult::error(
            "capabilities",
            "CONTROLLER_UPGRADE_REQUIRED",
            "The server controller must be upgraded before reliable publish transactions can be used.",
            None,
            Some(json!({
                "protocolMode": "incompatible",
                "queueModeActive": false,
                "publishProtocolVersion": publish_version,
                "queueProtocolVersion": queue_version,
                "requiredPublishProtocolVersion": REQUIRED_PUBLISH_PROTOCOL_VERSION,
            })),
        );
    }

    if queue_version < REQUIRED_QUEUE_PROTOCOL_VERSION {
        return capability_result(status, "legacy", false);
    }

    let pending = query_pending_status();
    if pending.ok {
        return capability_result(status, "queue", true);
    }
    if matches!(
        pending.code.as_deref(),
        Some("QUEUE_NOT_INITIALIZED" | "QUEUE_MODE_INACTIVE")
    ) {
        return capability_result(status, "legacy", false);
    }
    status_with_action(pending, "capabilities")
}

fn capability_result(
    mut status: ServerCommandResult,
    protocol_mode: &str,
    queue_mode_active: bool,
) -> ServerCommandResult {
    status.action = "capabilities".to_owned();
    status.message = if queue_mode_active {
        "Asynchronous content queue is active."
    } else {
        "The server is using synchronous legacy publishing."
    }
    .to_owned();
    status.details.insert(
        "protocolMode".to_owned(),
        Value::String(protocol_mode.to_owned()),
    );
    status
        .details
        .insert("queueModeActive".to_owned(), Value::Bool(queue_mode_active));
    status
}

fn status_with_action(mut response: ServerCommandResult, action: &str) -> ServerCommandResult {
    response.action = action.to_owned();
    response
}

fn query_pending_status() -> ServerCommandResult {
    let response = controller_json(
        "pending-status",
        &["sudo", "-n", CONTROLLER_PATH, "pending-status", "--json"],
        QUERY_TIMEOUT,
    );
    validate_pending_status_response(response)
}

fn query_sync_status(transaction_id: Option<&str>) -> ServerCommandResult {
    let mut arguments = vec!["sudo", "-n", CONTROLLER_PATH, "sync-status"];
    if let Some(transaction_id) = transaction_id {
        arguments.push(transaction_id);
    }
    arguments.push("--json");
    let response = controller_json("sync-status", &arguments, QUERY_TIMEOUT);
    validate_sync_response(response, "sync-status")
}

struct PublishTimeline {
    started: Instant,
    started_at: String,
    stage_started: Instant,
    stage_started_at: String,
}

struct PublishTransition<'a> {
    stage: &'a str,
    message: &'a str,
    attempt: usize,
    is_uploading: bool,
    server_started: bool,
    extra: Option<Value>,
}

impl PublishTimeline {
    fn new() -> Self {
        Self {
            started: Instant::now(),
            started_at: current_timestamp(),
            stage_started: Instant::now(),
            stage_started_at: current_timestamp(),
        }
    }

    fn transition(
        &mut self,
        app: &tauri::AppHandle,
        transaction_id: &str,
        transition: PublishTransition<'_>,
    ) {
        let PublishTransition {
            stage,
            message,
            attempt,
            is_uploading,
            server_started,
            extra,
        } = transition;
        self.stage_started = Instant::now();
        self.stage_started_at = current_timestamp();
        let mut payload = json!({
            "transactionId": transaction_id,
            "status": "running",
            "stage": stage,
            "stageStartedAt": self.stage_started_at,
            "startedAt": self.started_at,
            "updatedAt": current_timestamp(),
            "stageElapsedMs": 0,
            "elapsedMs": self.started.elapsed().as_millis() as u64,
            "attempt": attempt,
            "retryable": false,
            "message": message,
            "isUploading": is_uploading,
            "serverStarted": server_started,
            "safeToCancel": !server_started,
            "safeToRetry": false,
        });
        if let (Some(target), Some(source)) = (
            payload.as_object_mut(),
            extra.and_then(|v| v.as_object().cloned()),
        ) {
            target.extend(source);
        }
        let _ = app.emit(PUBLISH_PROGRESS_EVENT, payload);
    }
}

fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned())
}

fn is_publish_transaction_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn is_sync_transaction_id(value: &str) -> bool {
    is_publish_transaction_id(value)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PublishMode {
    Legacy,
    Queue,
}

impl PublishMode {
    fn action(self) -> &'static str {
        match self {
            Self::Legacy => "publish",
            Self::Queue => "queue-upload",
        }
    }
}

fn publish_content(
    app: &tauri::AppHandle,
    publisher: &RepositoryPublisher,
    request: PublishContentRequest,
) -> ServerCommandResult {
    deliver_content(app, publisher, request, PublishMode::Legacy)
}

fn queue_content(
    app: &tauri::AppHandle,
    publisher: &RepositoryPublisher,
    request: PublishContentRequest,
) -> ServerCommandResult {
    deliver_content(app, publisher, request, PublishMode::Queue)
}

fn deliver_content(
    app: &tauri::AppHandle,
    publisher: &RepositoryPublisher,
    request: PublishContentRequest,
    mode: PublishMode,
) -> ServerCommandResult {
    let action = mode.action();
    if let Err(field) = validate_publish_request(&request) {
        return invalid_request(action, field);
    }
    let mut timeline = PublishTimeline::new();
    timeline.transition(
        app,
        &request.transaction_id,
        PublishTransition {
            stage: "checking_server",
            message: "Checking for an existing publish transaction",
            attempt: 1,
            is_uploading: false,
            server_started: false,
            extra: None,
        },
    );

    let existing = query_publish_status(&request.transaction_id);
    if existing.ok {
        if !status_allows_publish_retry(&existing) {
            return transaction_result_from_status(existing, &request, mode);
        }
    } else if existing.code.as_deref() != Some("TRANSACTION_NOT_FOUND") {
        return transaction_error_for(existing, &request.transaction_id, mode);
    }

    let temporary = match Builder::new().prefix("algae-server-publish-").tempdir() {
        Ok(temporary) => temporary,
        Err(_) => {
            return ServerCommandResult::error(
                action,
                "TEMPORARY_DIRECTORY_FAILED",
                "Could not create a temporary Bundle delivery directory.",
                None,
                None,
            );
        }
    };
    let job_id = request.transaction_id.clone();
    let upload_root = temporary.path().join(format!(".partial-{job_id}"));
    let delivery = upload_root.clone();

    timeline.transition(
        app,
        &job_id,
        PublishTransition {
            stage: "generating_bundle",
            message: "Generating the Git Bundle",
            attempt: 1,
            is_uploading: false,
            server_started: false,
            extra: None,
        },
    );
    let export = match export_server_delivery(publisher, &request, &delivery) {
        Ok(export) => export,
        Err(error) => return transaction_error_for(*error, &job_id, mode),
    };
    timeline.transition(
        app,
        &job_id,
        PublishTransition {
            stage: "verifying_sha256",
            message: "Verifying the Bundle SHA-256",
            attempt: 1,
            is_uploading: false,
            server_started: false,
            extra: None,
        },
    );
    if let Err(error) = validate_portable_bundle(&delivery, &export.bundle_file_name) {
        return transaction_error_for(*error, &job_id, mode);
    }

    let current = query_publish_status(&job_id);
    if current.ok {
        if !status_allows_publish_retry(&current) {
            return transaction_result_from_status_with_sha(
                current,
                &request,
                &export.sha256,
                mode,
            );
        }
    } else if current.code.as_deref() != Some("TRANSACTION_NOT_FOUND") {
        return transaction_error_for(current, &job_id, mode);
    }

    let Some(remote_delivery) = remote_delivery_path(&job_id) else {
        return ServerCommandResult::error(
            action,
            "UPLOAD_PATH_INVALID",
            "The uploaded Bundle path could not be derived safely.",
            None,
            None,
        );
    };

    let upload_started = Instant::now();
    let uploaded_at;
    let upload_duration_ms;
    match remote_bundle_state(&job_id, &export.bundle_file_name, &export.sha256) {
        RemoteBundleState::Matches => {
            uploaded_at = current_timestamp();
            upload_duration_ms = 0;
        }
        RemoteBundleState::Missing => {
            timeline.transition(
                app,
                &job_id,
                PublishTransition {
                    stage: "uploading_bundle",
                    message: "Uploading the Bundle",
                    attempt: 1,
                    is_uploading: true,
                    server_started: false,
                    extra: None,
                },
            );
            if let Err(error) = upload_delivery_atomically(
                app,
                &mut timeline,
                &job_id,
                &upload_root,
                &export.bundle_file_name,
                &export.sha256,
                export.bundle_size_bytes,
            ) {
                return transaction_error_for(*error, &job_id, mode);
            }
            uploaded_at = current_timestamp();
            upload_duration_ms = upload_started.elapsed().as_millis() as u64;
        }
        RemoteBundleState::Mismatch => {
            return transaction_error_for(
                ServerCommandResult::error(
                    action,
                    "REMOTE_BUNDLE_MISMATCH",
                    "The transaction already has a different uploaded Bundle.",
                    None,
                    None,
                ),
                &job_id,
                mode,
            );
        }
        RemoteBundleState::Unavailable(error) => {
            return transaction_error_for(error, &job_id, mode);
        }
    }
    timeline.transition(
        app,
        &job_id,
        PublishTransition {
            stage: "bundle_uploaded",
            message: if mode == PublishMode::Queue {
                "Bundle upload is complete; server quick validation is starting"
            } else {
                "Bundle upload is complete; server processing is starting"
            },
            attempt: 1,
            is_uploading: false,
            server_started: false,
            extra: Some(json!({
                "bundleUploadedAt": uploaded_at,
                "bundleUploadDurationMs": upload_duration_ms,
            })),
        },
    );
    timeline.transition(
        app,
        &job_id,
        PublishTransition {
            stage: if mode == PublishMode::Queue {
                "server_validating"
            } else {
                "connecting_server"
            },
            message: if mode == PublishMode::Queue {
                "The server is quickly validating the queued Bundle"
            } else {
                "Connecting to the server publish controller"
            },
            attempt: 1,
            is_uploading: false,
            server_started: true,
            extra: None,
        },
    );
    let server_validation_started = Instant::now();
    let remote_args = content_mutation_remote_args(mode, &job_id, &remote_delivery, &export.sha256);
    let mut response = controller_json(
        action,
        &remote_args,
        if mode == PublishMode::Queue {
            QUERY_TIMEOUT
        } else {
            PUBLISH_TIMEOUT
        },
    );
    if mode == PublishMode::Queue {
        response = validate_queue_upload_response(response, action);
    }
    let server_validation_duration_ms = server_validation_started.elapsed().as_millis() as u64;
    if publish_result_is_ambiguous(&response) {
        timeline.transition(
            app,
            &job_id,
            PublishTransition {
                stage: "confirming_server_status",
                message: "Connection was interrupted; confirming the server transaction status",
                attempt: 1,
                is_uploading: false,
                server_started: true,
                extra: None,
            },
        );
        if let Some(status) = query_publish_status_with_retry(&job_id) {
            let result =
                transaction_result_from_status_with_sha(status, &request, &export.sha256, mode);
            return attach_queue_timings(
                result,
                mode,
                &export,
                &uploaded_at,
                upload_duration_ms,
                server_validation_duration_ms,
                timeline.started.elapsed().as_millis() as u64,
            );
        }
    }
    let result = validate_mutation_identity(
        transaction_error_for(response, &job_id, mode),
        &request.content_type,
        &request.stable_id,
    );
    attach_queue_timings(
        result,
        mode,
        &export,
        &uploaded_at,
        upload_duration_ms,
        server_validation_duration_ms,
        timeline.started.elapsed().as_millis() as u64,
    )
}

fn content_mutation_remote_args<'a>(
    mode: PublishMode,
    transaction_id: &'a str,
    remote_delivery: &'a str,
    bundle_sha256: &'a str,
) -> Vec<&'a str> {
    vec![
        "sudo",
        "-n",
        CONTROLLER_PATH,
        mode.action(),
        "--transaction",
        transaction_id,
        "--bundle",
        remote_delivery,
        "--bundle-sha256",
        bundle_sha256,
        "--json",
    ]
}

fn attach_queue_timings(
    mut response: ServerCommandResult,
    mode: PublishMode,
    export: &repository::RepositoryBundleExportResult,
    uploaded_at: &str,
    upload_duration_ms: u64,
    server_validation_duration_ms: u64,
    total_duration_ms: u64,
) -> ServerCommandResult {
    if mode != PublishMode::Queue {
        return response;
    }
    response.details.extend(details_map(Some(json!({
        "bundleUploadedAt": uploaded_at,
        "bundleUploadDurationMs": upload_duration_ms,
        "bundleGenerationDurationMs": export.bundle_generation_duration_ms,
        "sha256DurationMs": export.sha256_duration_ms,
        "serverValidationDurationMs": server_validation_duration_ms,
        "queueTotalDurationMs": total_duration_ms,
    }))));
    response
}

fn validate_publish_request(request: &PublishContentRequest) -> Result<(), &'static str> {
    if request.repository_path.trim().is_empty()
        || request.repository_path.len() > 32 * 1024
        || request.repository_path.contains('\0')
    {
        return Err("repositoryPath");
    }
    if !is_publish_transaction_id(&request.transaction_id) {
        return Err("transactionId");
    }
    validate_content_identity(&request.content_type, &request.stable_id)
}

fn query_publish_status(transaction_id: &str) -> ServerCommandResult {
    let response = controller_json(
        "publish-status",
        &[
            "sudo",
            "-n",
            CONTROLLER_PATH,
            "publish-status",
            "--transaction",
            transaction_id,
            "--json",
        ],
        QUERY_TIMEOUT,
    );
    if response.ok {
        validate_publish_status_response(response)
    } else {
        publish_error_for_transaction(response, transaction_id)
    }
}

fn status_allows_publish_retry(response: &ServerCommandResult) -> bool {
    matches!(response.details.get("status"), Some(Value::String(status)) if status == "failed")
        && matches!(response.details.get("retryable"), Some(Value::Bool(true)))
        && !matches!(
            response.details.get("switchCompleted"),
            Some(Value::Bool(true))
        )
        && response
            .details
            .get("attempt")
            .and_then(Value::as_u64)
            .is_some_and(|attempt| attempt < MAX_NETWORK_ATTEMPTS as u64)
}

fn transaction_result_from_status(
    response: ServerCommandResult,
    request: &PublishContentRequest,
    mode: PublishMode,
) -> ServerCommandResult {
    transaction_result_from_status_with_sha(response, request, "", mode)
}

fn transaction_result_from_status_with_sha(
    mut response: ServerCommandResult,
    request: &PublishContentRequest,
    expected_sha256: &str,
    mode: PublishMode,
) -> ServerCommandResult {
    let action = mode.action();
    let status = response
        .details
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let transaction_kind_matches = match mode {
        PublishMode::Legacy => matches!(status, "running" | "failed" | "succeeded"),
        PublishMode::Queue => matches!(
            status,
            "FAILED" | "QUEUED" | "COALESCED" | "SYNCING" | "PUBLISHED"
        ),
    };
    let transaction_matches = matches!(
        response.details.get("transactionId"),
        Some(Value::String(value)) if value == &request.transaction_id
    );
    let hash_matches = expected_sha256.is_empty()
        || matches!(
            response.details.get("bundleSha256"),
            Some(Value::String(value)) if value == expected_sha256
        );
    let content_matches = ["contentType", "stableId"].iter().all(|key| {
        let expected = if *key == "contentType" {
            &request.content_type
        } else {
            &request.stable_id
        };
        match response.details.get(*key).and_then(Value::as_str) {
            Some("") | None => true,
            Some(value) => value == expected,
        }
    });
    if !transaction_kind_matches || !transaction_matches || !hash_matches || !content_matches {
        return transaction_error_for(
            ServerCommandResult::error(
                action,
                "TRANSACTION_STATE_MISMATCH",
                "The saved publish transaction does not match this content or Bundle.",
                None,
                None,
            ),
            &request.transaction_id,
            mode,
        );
    }
    response.action = action.to_owned();
    if matches!(status, "failed" | "FAILED") {
        response.ok = false;
        response.code = response
            .details
            .get("errorCode")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| {
                Some(if mode == PublishMode::Queue {
                    "UPLOAD_FAILED".to_owned()
                } else {
                    "PUBLISH_FAILED".to_owned()
                })
            });
    }
    response
}

fn publish_error_for_transaction(
    response: ServerCommandResult,
    transaction_id: &str,
) -> ServerCommandResult {
    transaction_error_for(response, transaction_id, PublishMode::Legacy)
}

fn transaction_error_for(
    mut response: ServerCommandResult,
    transaction_id: &str,
    mode: PublishMode,
) -> ServerCommandResult {
    response.action = mode.action().to_owned();
    response.details.insert(
        "transactionId".to_owned(),
        Value::String(transaction_id.to_owned()),
    );
    if !response.ok {
        let code = response
            .code
            .clone()
            .unwrap_or_else(|| mode.action().to_ascii_uppercase().replace('-', "_"));
        let retryable = retryable_client_error(&code);
        response
            .details
            .entry("errorCode".to_owned())
            .or_insert_with(|| Value::String(code.clone()));
        response
            .details
            .entry("retryable".to_owned())
            .or_insert(Value::Bool(retryable));
        response
            .details
            .entry("userMessage".to_owned())
            .or_insert_with(|| Value::String(response.message.clone()));
        response
            .details
            .entry("technicalSummary".to_owned())
            .or_insert_with(|| Value::String(format!("{code}: {}", response.message)));
        response
            .details
            .entry("failedStage".to_owned())
            .or_insert_with(|| Value::String("client_connection".to_owned()));
    }
    response
}

fn retryable_client_error(code: &str) -> bool {
    matches!(
        code,
        "SSH_UNAVAILABLE"
            | "SSH_TIMEOUT"
            | "SERVER_TIMEOUT"
            | "SERVER_PROCESS_FAILED"
            | "SERVER_COMMAND_FAILED"
            | "SERVER_RESPONSE_INVALID"
            | "UPLOAD_FAILED"
            | "UPLOAD_TIMEOUT"
            | "UPLOAD_PROCESS_FAILED"
            | "STATUS_QUERY_FAILED"
            | "STATUS_QUERY_TIMEOUT"
            | "STATUS_QUERY_PROCESS_FAILED"
            | "STATUS_QUERY_TOOL_UNAVAILABLE"
    )
}

fn publish_result_is_ambiguous(response: &ServerCommandResult) -> bool {
    !response.ok && response.code.as_deref().is_some_and(retryable_client_error)
}

fn query_publish_status_with_retry(transaction_id: &str) -> Option<ServerCommandResult> {
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        let response = query_publish_status(transaction_id);
        if response.ok {
            return Some(response);
        }
        if !retryable_client_error(response.code.as_deref().unwrap_or_default()) {
            return None;
        }
        if attempt + 1 < MAX_NETWORK_ATTEMPTS {
            thread::sleep(Duration::from_secs([1, 3][attempt.min(1)]));
        }
    }
    None
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

fn upload_delivery_once(
    upload_root: &Path,
    bundle_size_bytes: u64,
) -> Result<(), Box<ServerCommandResult>> {
    let output = run_process(scp_command_spec(
        upload_root,
        upload_timeout(bundle_size_bytes),
    ))
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

fn upload_delivery_atomically(
    app: &tauri::AppHandle,
    timeline: &mut PublishTimeline,
    job_id: &str,
    upload_root: &Path,
    bundle_file_name: &str,
    bundle_sha256: &str,
    bundle_size_bytes: u64,
) -> Result<(), Box<ServerCommandResult>> {
    let mut last_error = None;
    for attempt in 1..=MAX_NETWORK_ATTEMPTS {
        if matches!(
            remote_bundle_state(job_id, bundle_file_name, bundle_sha256),
            RemoteBundleState::Matches
        ) {
            return Ok(());
        }
        if attempt > 1 {
            timeline.transition(
                app,
                job_id,
                PublishTransition {
                    stage: "uploading_bundle",
                    message: "Retrying the interrupted Bundle upload",
                    attempt,
                    is_uploading: true,
                    server_started: false,
                    extra: Some(json!({ "retrying": true })),
                },
            );
        }
        let attempt_result = prepare_remote_partial_upload(job_id)
            .and_then(|_| upload_delivery_once(upload_root, bundle_size_bytes))
            .and_then(|_| secure_uploaded_partial_delivery(job_id))
            .and_then(|_| finalize_remote_upload(job_id));
        match attempt_result {
            Ok(()) => match remote_bundle_state(job_id, bundle_file_name, bundle_sha256) {
                RemoteBundleState::Matches => return Ok(()),
                RemoteBundleState::Mismatch => {
                    return Err(Box::new(ServerCommandResult::error(
                        "publish",
                        "REMOTE_BUNDLE_MISMATCH",
                        "The uploaded Bundle SHA-256 does not match the local Bundle.",
                        None,
                        None,
                    )));
                }
                RemoteBundleState::Missing => {
                    last_error = Some(Box::new(ServerCommandResult::error(
                        "publish",
                        "UPLOAD_FAILED",
                        "The uploaded Bundle was not installed atomically.",
                        None,
                        None,
                    )));
                }
                RemoteBundleState::Unavailable(error) => last_error = Some(Box::new(error)),
            },
            Err(error) => {
                if !retryable_client_error(error.code.as_deref().unwrap_or_default()) {
                    return Err(error);
                }
                last_error = Some(error);
            }
        }
        if attempt < MAX_NETWORK_ATTEMPTS {
            thread::sleep(Duration::from_secs([1, 3][attempt - 1]));
        }
    }
    Err(last_error.unwrap_or_else(|| {
        Box::new(ServerCommandResult::error(
            "publish",
            "UPLOAD_FAILED",
            "The Bundle upload retry limit was reached.",
            None,
            None,
        ))
    }))
}

fn prepare_remote_partial_upload(job_id: &str) -> Result<(), Box<ServerCommandResult>> {
    let command = remote_upload_cleanup_spec(job_id).ok_or_else(upload_path_error)?;
    run_fixed_upload_command(command, "UPLOAD_PREPARE")
}

fn secure_uploaded_partial_delivery(job_id: &str) -> Result<(), Box<ServerCommandResult>> {
    let commands = remote_upload_chmod_specs(job_id).ok_or_else(upload_path_error)?;
    for command in commands {
        run_fixed_upload_command(command, "UPLOAD_PERMISSIONS")?;
    }
    Ok(())
}

fn finalize_remote_upload(job_id: &str) -> Result<(), Box<ServerCommandResult>> {
    let command = remote_upload_finalize_spec(job_id).ok_or_else(upload_path_error)?;
    run_fixed_upload_command(command, "UPLOAD_FINALIZE")
}

fn upload_path_error() -> Box<ServerCommandResult> {
    Box::new(ServerCommandResult::error(
        "publish",
        "UPLOAD_PATH_INVALID",
        "The uploaded Bundle path could not be derived safely.",
        None,
        None,
    ))
}

fn run_fixed_upload_command(
    command: CommandSpec,
    phase: &str,
) -> Result<(), Box<ServerCommandResult>> {
    let output = run_process(command)
        .map_err(|failure| Box::new(process_failure("publish", phase, failure)))?;
    if output.stdout.truncated {
        return Err(Box::new(ServerCommandResult::error(
            "publish",
            "OUTPUT_LIMIT_EXCEEDED",
            "A fixed upload command produced too much output.",
            output.stderr.log_tail(),
            None,
        )));
    }
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr.bytes).to_ascii_lowercase();
    let authentication_failed = stderr.contains("permission denied")
        || stderr.contains("authentication failed")
        || stderr.contains("publickey");
    Err(Box::new(ServerCommandResult::error(
        "publish",
        if authentication_failed {
            "SSH_AUTHENTICATION_FAILED"
        } else {
            "UPLOAD_FAILED"
        },
        if authentication_failed {
            "SSH authentication failed; the upload was not retried."
        } else {
            "The fixed remote upload operation was interrupted."
        },
        output.stderr.log_tail(),
        None,
    )))
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
            if let Some(error) = legacy_controller_protocol_error(&output.stdout.bytes, action) {
                return error;
            }
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

fn legacy_controller_protocol_error(
    bytes: &[u8],
    expected_action: &str,
) -> Option<ServerCommandResult> {
    if !matches!(expected_action, "publish" | "publish-status") {
        return None;
    }
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let object = value.as_object()?;
    let is_legacy_rejection = object.get("ok") == Some(&Value::Bool(false))
        && object.get("action").and_then(Value::as_str) == Some("unknown")
        && object.get("code").and_then(Value::as_str) == Some("INVALID_ARGUMENTS")
        && object.get("message").and_then(Value::as_str) == Some("Unknown argument");
    is_legacy_rejection.then(|| {
        ServerCommandResult::error(
            expected_action,
            "CONTROLLER_UPGRADE_REQUIRED",
            "The server controller must be upgraded before reliable publish transactions can be used.",
            None,
            Some(json!({
                "requiredPublishProtocolVersion": REQUIRED_PUBLISH_PROTOCOL_VERSION,
            })),
        )
    })
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

    let fallback_code = (!ok)
        .then(|| object.get("error_code").and_then(Value::as_str))
        .flatten()
        .filter(|code| valid_error_code(code))
        .map(str::to_owned);
    let code = object.remove("code");
    let message = object.remove("message");
    let log_tail = object.remove("logTail");
    object.remove("ok");
    object.remove("action");

    let code = match code {
        Some(Value::String(code)) if valid_error_code(&code) => Some(code),
        Some(_) => return Err(()),
        None if !ok => Some(fallback_code.ok_or(())?),
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

fn protocol_details<T: DeserializeOwned>(response: &ServerCommandResult) -> Option<T> {
    serde_json::from_value(Value::Object(response.details.clone())).ok()
}

fn protocol_invalid(action: &str, message: &str) -> ServerCommandResult {
    ServerCommandResult::error(action, "CONTROLLER_PROTOCOL_INVALID", message, None, None)
}

fn valid_protocol_text(value: &str, maximum: usize) -> bool {
    value.len() <= maximum && !value.chars().any(char::is_control)
}

fn valid_optional_commit(value: &str) -> bool {
    value.is_empty() || valid_release_sha(value)
}

fn valid_optional_transaction(value: &str) -> bool {
    value.is_empty() || is_publish_transaction_id(value)
}

fn valid_optional_timestamp(value: &str) -> bool {
    value.is_empty() || valid_publish_timestamp(value)
}

fn valid_server_path(value: &str) -> bool {
    value.is_empty()
        || (value.starts_with('/')
            && value.len() <= 4 * 1024
            && !value.contains("..")
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"/._-".contains(&byte)))
}

fn valid_controller_status(protocol: &ControllerStatusProtocol) -> bool {
    let releases_valid = [
        protocol.current_release.as_deref(),
        protocol.previous_release.as_deref(),
    ]
    .into_iter()
    .flatten()
    .all(|value| valid_protocol_text(value, 4 * 1024));
    let versions_valid = [
        protocol.publish_protocol_version,
        protocol.queue_protocol_version,
    ]
    .into_iter()
    .flatten()
    .all(|version| version <= 100);
    let _health_snapshot = (
        protocol.ready,
        protocol.content_repository_ready,
        protocol.service_active,
        protocol.healthy,
    );
    releases_valid && versions_valid
}

fn valid_pending_status(protocol: &PendingStatusProtocol) -> bool {
    protocol.schema_version == REQUIRED_QUEUE_PROTOCOL_VERSION
        && protocol.queue_protocol_version >= REQUIRED_QUEUE_PROTOCOL_VERSION
        && protocol.queue_protocol_version <= 100
        && protocol.sync_protocol_version >= REQUIRED_SYNC_PROTOCOL_VERSION
        && protocol.sync_protocol_version <= 100
        && valid_release_sha(&protocol.published_content_commit)
        && valid_release_sha(&protocol.pending_content_commit)
        && protocol
            .syncing_content_commit
            .as_deref()
            .is_none_or(valid_release_sha)
        && protocol
            .blocked_content_commit
            .as_deref()
            .is_none_or(valid_release_sha)
        && protocol
            .latest_upload_transaction_id
            .as_deref()
            .is_none_or(is_publish_transaction_id)
        && protocol
            .active_sync_transaction_id
            .as_deref()
            .is_none_or(is_sync_transaction_id)
        && protocol
            .last_sync_transaction_id
            .as_deref()
            .is_none_or(is_sync_transaction_id)
        && valid_publish_timestamp(&protocol.next_scheduled_sync_at)
        && valid_publish_timestamp(&protocol.server_time)
        && valid_release_sha(&protocol.site_commit)
        && protocol.pending_upload_count <= MAX_SERVER_ITEMS as u64
        && protocol.has_pending_changes
            == (protocol.pending_content_commit != protocol.published_content_commit)
        && (protocol.sync_timer_active || !protocol.next_scheduled_sync_at.is_empty())
        && protocol
            .last_sync_status
            .is_none_or(|_| protocol.last_sync_transaction_id.is_some())
}

fn valid_queue_upload(protocol: &QueueUploadProtocol) -> bool {
    if protocol.schema_version != REQUIRED_QUEUE_PROTOCOL_VERSION
        || !is_publish_transaction_id(&protocol.transaction_id)
        || !valid_bundle_sha256(&protocol.bundle_sha256)
        || !valid_protocol_text(&protocol.published_release_id, 200)
        || !valid_protocol_text(&protocol.error_code, 200)
        || !valid_optional_transaction(&protocol.included_in_sync_transaction_id)
        || !valid_optional_commit(&protocol.coalesced_into_commit)
        || !valid_optional_timestamp(&protocol.published_at)
        || protocol.retryable
    {
        return false;
    }

    if protocol.status == UploadStatusProtocol::Failed {
        return protocol.source_commit.is_empty()
            && protocol.content_commit.is_empty()
            && protocol.queued_at.is_empty()
            && protocol.coalesced_into_commit.is_empty()
            && !protocol.error_code.is_empty()
            && valid_protocol_text(&protocol.content_type, 200)
            && valid_protocol_text(&protocol.stable_id, 200);
    }

    let identity_valid = CONTENT_TYPES.contains(&protocol.content_type.as_str())
        && is_stable_id(&protocol.stable_id);
    let base_valid = valid_release_sha(&protocol.source_commit)
        && valid_release_sha(&protocol.content_commit)
        && valid_publish_timestamp(&protocol.queued_at)
        && protocol.error_code.is_empty()
        && identity_valid;
    let state_valid = match protocol.status {
        UploadStatusProtocol::Queued => protocol.coalesced_into_commit.is_empty(),
        UploadStatusProtocol::Coalesced => !protocol.coalesced_into_commit.is_empty(),
        UploadStatusProtocol::Syncing => !protocol.included_in_sync_transaction_id.is_empty(),
        UploadStatusProtocol::Published => {
            !protocol.included_in_sync_transaction_id.is_empty()
                && !protocol.published_release_id.is_empty()
                && !protocol.published_at.is_empty()
        }
        UploadStatusProtocol::Failed => false,
    };
    base_valid && state_valid
}

fn valid_sync_transaction(protocol: &SyncTransactionProtocol) -> bool {
    if protocol.schema_version != REQUIRED_SYNC_PROTOCOL_VERSION
        || !is_sync_transaction_id(&protocol.sync_transaction_id)
        || !valid_optional_transaction(&protocol.active_sync_transaction_id)
        || !valid_optional_transaction(&protocol.last_sync_transaction_id)
        || !valid_sync_stage(protocol.status, protocol.stage)
        || !valid_optional_commit(&protocol.content_commit)
        || !valid_optional_commit(&protocol.source_content_commit)
        || !valid_optional_commit(&protocol.site_commit)
        || !valid_protocol_text(&protocol.release_id, 200)
        || !valid_server_path(&protocol.release_path)
        || !valid_publish_timestamp(&protocol.started_at)
        || !valid_publish_timestamp(&protocol.updated_at)
        || !valid_optional_timestamp(&protocol.completed_at)
        || !valid_optional_timestamp(&protocol.stage_started_at)
        || protocol.attempt == 0
        || protocol.attempt > protocol.max_attempts
        || protocol.max_attempts > 100
        || !valid_protocol_text(&protocol.error_code, 200)
    {
        return false;
    }

    let terminal = matches!(
        protocol.status,
        SyncStatusProtocol::Published
            | SyncStatusProtocol::FailedRetryable
            | SyncStatusProtocol::FailedBlocked
            | SyncStatusProtocol::SkippedNoPending
    );
    let state_valid = match protocol.status {
        SyncStatusProtocol::FailedRetryable => {
            protocol.retryable && !protocol.blocked && !protocol.error_code.is_empty()
        }
        SyncStatusProtocol::FailedBlocked => {
            !protocol.retryable && protocol.blocked && !protocol.error_code.is_empty()
        }
        SyncStatusProtocol::Published => {
            !protocol.retryable
                && !protocol.blocked
                && !protocol.release_id.is_empty()
                && !protocol.release_path.is_empty()
                && protocol.switch_completed
                && protocol.health_verified
        }
        _ => !protocol.retryable && !protocol.blocked,
    };
    let _progress_snapshot = (protocol.trigger, protocol.elapsed_ms, protocol.recovered);
    state_valid && terminal == !protocol.completed_at.is_empty()
}

fn valid_sync_stage(status: SyncStatusProtocol, stage: SyncStatusProtocol) -> bool {
    if status == stage {
        return true;
    }
    matches!(
        status,
        SyncStatusProtocol::FailedRetryable | SyncStatusProtocol::FailedBlocked
    ) && matches!(
        stage,
        SyncStatusProtocol::Created
            | SyncStatusProtocol::Snapshotting
            | SyncStatusProtocol::PreparingSource
            | SyncStatusProtocol::PreparingDependencies
            | SyncStatusProtocol::Checking
            | SyncStatusProtocol::Building
            | SyncStatusProtocol::Switching
            | SyncStatusProtocol::Verifying
            | SyncStatusProtocol::Recovering
    )
}

fn validate_pending_status_response(response: ServerCommandResult) -> ServerCommandResult {
    if !response.ok {
        return response;
    }
    match protocol_details::<PendingStatusProtocol>(&response) {
        Some(protocol) if valid_pending_status(&protocol) => response,
        _ => protocol_invalid(
            "pending-status",
            "The pending content status has an invalid protocol structure.",
        ),
    }
}

fn validate_queue_upload_response(
    mut response: ServerCommandResult,
    expected_action: &str,
) -> ServerCommandResult {
    let typed = protocol_details::<QueueUploadProtocol>(&response);
    match typed {
        Some(protocol) if valid_queue_upload(&protocol) => {
            if protocol.status == UploadStatusProtocol::Failed {
                response.ok = false;
                response.code = Some(if protocol.error_code.is_empty() {
                    "UPLOAD_FAILED".to_owned()
                } else {
                    protocol.error_code
                });
            }
            response
        }
        _ if !response.ok && !response.details.contains_key("status") => response,
        _ => protocol_invalid(
            expected_action,
            "The queued upload status has an invalid protocol structure.",
        ),
    }
}

fn validate_sync_response(
    mut response: ServerCommandResult,
    expected_action: &str,
) -> ServerCommandResult {
    let typed = protocol_details::<SyncTransactionProtocol>(&response);
    match typed {
        Some(protocol) if valid_sync_transaction(&protocol) => {
            if expected_action == "sync-pending" {
                match protocol.status {
                    SyncStatusProtocol::FailedBlocked => {
                        response.ok = false;
                        response.code = Some("SYNC_BLOCKED".to_owned());
                    }
                    SyncStatusProtocol::FailedRetryable => {
                        response.ok = false;
                        response.code = Some("SYNC_FAILED_RETRYABLE".to_owned());
                    }
                    _ => {}
                }
            }
            response
        }
        _ if !response.ok && !response.details.contains_key("status") => response,
        _ => protocol_invalid(
            expected_action,
            "The synchronization status has an invalid protocol structure.",
        ),
    }
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
    match protocol_details::<ControllerStatusProtocol>(&response) {
        Some(protocol) if valid_controller_status(&protocol) => response,
        _ => protocol_invalid(
            "status",
            "The server status has an invalid protocol structure.",
        ),
    }
}

fn validate_publish_status_response(response: ServerCommandResult) -> ServerCommandResult {
    if matches!(
        response.details.get("status").and_then(Value::as_str),
        Some("FAILED" | "QUEUED" | "COALESCED" | "SYNCING" | "PUBLISHED")
    ) {
        return validate_queue_upload_response(response, "publish-status");
    }
    let string_field = |key: &str, maximum: usize| {
        response
            .details
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|value| value.len() <= maximum && !value.chars().any(char::is_control))
    };
    let transaction_valid = response
        .details
        .get("transactionId")
        .and_then(Value::as_str)
        .is_some_and(is_publish_transaction_id);
    let hash_valid = response
        .details
        .get("bundleSha256")
        .and_then(Value::as_str)
        .is_some_and(valid_bundle_sha256);
    let status_valid = matches!(
        response.details.get("status"),
        Some(Value::String(value)) if matches!(value.as_str(), "running" | "failed" | "succeeded")
    );
    let stage_valid = response
        .details
        .get("stage")
        .and_then(Value::as_str)
        .is_some_and(valid_publish_stage);
    let booleans_valid = ["retryable", "switchCompleted"]
        .iter()
        .all(|key| matches!(response.details.get(*key), Some(Value::Bool(_))));
    let elapsed_valid = response
        .details
        .get("elapsedMs")
        .and_then(Value::as_u64)
        .is_some();
    let attempt_valid = response
        .details
        .get("attempt")
        .and_then(Value::as_u64)
        .is_some_and(|attempt| (1..=100).contains(&attempt));
    let summaries_valid = [
        "errorCode",
        "failedStage",
        "contentType",
        "stableId",
        "releaseId",
        "sourceMethod",
        "userMessage",
        "technicalSummary",
    ]
    .iter()
    .all(|key| string_field(key, 16 * 1024));
    let timestamps_valid = ["stageStartedAt", "startedAt", "updatedAt"]
        .iter()
        .all(|key| {
            response
                .details
                .get(*key)
                .and_then(Value::as_str)
                .is_some_and(valid_publish_timestamp)
        });
    let identity_valid = response
        .details
        .get("contentType")
        .and_then(Value::as_str)
        .is_some_and(|value| value.is_empty() || CONTENT_TYPES.contains(&value))
        && response
            .details
            .get("stableId")
            .and_then(Value::as_str)
            .is_some_and(|value| value.is_empty() || is_stable_id(value));
    let failure_valid = response
        .details
        .get("failedStage")
        .and_then(Value::as_str)
        .is_some_and(|value| value.is_empty() || valid_publish_stage(value))
        && response
            .details
            .get("errorCode")
            .and_then(Value::as_str)
            .is_some_and(|value| value.is_empty() || valid_error_code(value));
    let source_method_valid = matches!(
        response.details.get("sourceMethod").and_then(Value::as_str),
        Some("" | "cache" | "archive" | "clone")
    );
    let commits_valid = ["contentCommit", "siteCommit", "releaseSha", "contentSha"]
        .iter()
        .all(|key| {
            response
                .details
                .get(*key)
                .and_then(Value::as_str)
                .is_some_and(|value| value.is_empty() || valid_release_sha(value))
        });
    let url_valid = response
        .details
        .get("url")
        .and_then(Value::as_str)
        .is_some_and(|value| value.is_empty() || valid_https_url(value));
    let durations_valid = response
        .details
        .get("stageDurationsMs")
        .and_then(Value::as_object)
        .is_some_and(|durations| {
            durations
                .iter()
                .all(|(stage, value)| valid_publish_stage(stage) && value.as_u64().is_some())
        });
    if transaction_valid
        && hash_valid
        && status_valid
        && stage_valid
        && booleans_valid
        && elapsed_valid
        && attempt_valid
        && summaries_valid
        && timestamps_valid
        && identity_valid
        && failure_valid
        && source_method_valid
        && commits_valid
        && url_valid
        && durations_valid
    {
        response
    } else {
        ServerCommandResult::error(
            "publish-status",
            "SERVER_RESPONSE_INVALID",
            "The publish transaction status has an invalid structure.",
            None,
            None,
        )
    }
}

fn valid_publish_stage(value: &str) -> bool {
    matches!(
        value,
        "saving"
            | "checking_server"
            | "generating_bundle"
            | "verifying_sha256"
            | "uploading_bundle"
            | "bundle_uploaded"
            | "connecting_server"
            | "verifying_bundle"
            | "checking_content_commit"
            | "checking_site_source_cache"
            | "preparing_site_source"
            | "preparing_dependencies"
            | "validating_site"
            | "building_site"
            | "creating_release"
            | "switching_release"
            | "restarting_service"
            | "verifying_production_url"
            | "confirming_server_status"
            | "succeeded"
    )
}

fn valid_publish_timestamp(value: &str) -> bool {
    value.len() <= 64 && OffsetDateTime::parse(value, &Rfc3339).is_ok()
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
    if response.action == "publish" && response.details.contains_key("status") {
        let mut status_response = response.clone();
        status_response.action = "publish-status".to_owned();
        let validated = validate_publish_status_response(status_response);
        if !validated.ok {
            return ServerCommandResult {
                action: "publish".to_owned(),
                ..validated
            };
        }
        if !matches!(
            response.details.get("status"),
            Some(Value::String(status)) if status == "succeeded"
        ) {
            return response;
        }
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
    matches!(
        value,
        "status"
            | "list"
            | "pending-status"
            | "publish-status"
            | "publish"
            | "queue-upload"
            | "sync-status"
            | "sync-pending"
            | "delete"
    )
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

fn remote_delivery_path(job_id: &str) -> Option<String> {
    is_publish_transaction_id(job_id).then(|| format!("{REMOTE_INCOMING_DIRECTORY}/{job_id}"))
}

fn remote_partial_delivery_path(job_id: &str) -> Option<String> {
    is_publish_transaction_id(job_id)
        .then(|| format!("{REMOTE_INCOMING_DIRECTORY}/.partial-{job_id}"))
}

enum RemoteBundleState {
    Matches,
    Missing,
    Mismatch,
    Unavailable(ServerCommandResult),
}

fn remote_bundle_state(
    job_id: &str,
    bundle_file_name: &str,
    expected_sha256: &str,
) -> RemoteBundleState {
    if !valid_remote_bundle_file_name(bundle_file_name) || !valid_bundle_sha256(expected_sha256) {
        return RemoteBundleState::Unavailable(ServerCommandResult::error(
            "publish",
            "UPLOAD_PATH_INVALID",
            "The remote Bundle path or SHA-256 is invalid.",
            None,
            None,
        ));
    }
    let Some(remote_delivery) = remote_delivery_path(job_id) else {
        return RemoteBundleState::Unavailable(*upload_path_error());
    };
    let remote_bundle = format!("{remote_delivery}/{bundle_file_name}");
    let output = match run_process(ssh_command_spec(
        &["/usr/bin/sha256sum", "--", &remote_bundle],
        QUERY_TIMEOUT,
    )) {
        Ok(output) => output,
        Err(failure) => {
            return RemoteBundleState::Unavailable(process_failure(
                "publish",
                "STATUS_QUERY",
                failure,
            ));
        }
    };
    if output.status.success() && !output.stdout.truncated {
        let stdout = String::from_utf8_lossy(&output.stdout.bytes);
        let Some(actual) = stdout.split_whitespace().next() else {
            return RemoteBundleState::Unavailable(ServerCommandResult::error(
                "publish",
                "SERVER_RESPONSE_INVALID",
                "The remote Bundle SHA-256 response is invalid.",
                output.stderr.log_tail(),
                None,
            ));
        };
        return if actual.eq_ignore_ascii_case(expected_sha256) {
            RemoteBundleState::Matches
        } else {
            RemoteBundleState::Mismatch
        };
    }
    if output.status.code() == Some(1) {
        return RemoteBundleState::Missing;
    }
    RemoteBundleState::Unavailable(ServerCommandResult::error(
        "publish",
        if output.status.code() == Some(255) {
            "SSH_UNAVAILABLE"
        } else {
            "STATUS_QUERY_FAILED"
        },
        "The remote Bundle status could not be checked.",
        output.stderr.log_tail(),
        None,
    ))
}

fn valid_remote_bundle_file_name(value: &str) -> bool {
    value.len() <= 512
        && value.ends_with(".bundle")
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'.'
        })
}

fn valid_bundle_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn remote_upload_cleanup_spec(job_id: &str) -> Option<CommandSpec> {
    let partial = remote_partial_delivery_path(job_id)?;
    Some(ssh_command_spec(
        &["/usr/bin/rm", "-rf", "--", &partial],
        UPLOAD_PERMISSIONS_TIMEOUT,
    ))
}

fn remote_upload_finalize_spec(job_id: &str) -> Option<CommandSpec> {
    let partial = remote_partial_delivery_path(job_id)?;
    let delivery = remote_delivery_path(job_id)?;
    Some(ssh_command_spec(
        &["/usr/bin/mv", "-T", "--", &partial, &delivery],
        UPLOAD_PERMISSIONS_TIMEOUT,
    ))
}

fn remote_upload_chmod_specs(job_id: &str) -> Option<[CommandSpec; 2]> {
    let remote_delivery = remote_partial_delivery_path(job_id)?;
    let remote_artifacts = format!("{remote_delivery}/*");
    Some([
        ssh_command_spec(
            &["/usr/bin/chmod", "0700", "--", &remote_delivery],
            UPLOAD_PERMISSIONS_TIMEOUT,
        ),
        ssh_command_spec(
            &["/usr/bin/chmod", "0600", "--", &remote_artifacts],
            UPLOAD_PERMISSIONS_TIMEOUT,
        ),
    ])
}

fn upload_timeout(bundle_size_bytes: u64) -> Duration {
    let transfer_seconds = bundle_size_bytes.saturating_add(MIN_UPLOAD_BYTES_PER_SECOND - 1)
        / MIN_UPLOAD_BYTES_PER_SECOND;
    let estimated = Duration::from_secs(
        UPLOAD_TIMEOUT_GRACE
            .as_secs()
            .saturating_add(transfer_seconds),
    );
    estimated.clamp(MIN_UPLOAD_TIMEOUT, MAX_UPLOAD_TIMEOUT)
}

fn scp_command_spec(source: &Path, timeout: Duration) -> CommandSpec {
    let mut args = vec![OsString::from("-q"), OsString::from("-r")];
    args.extend(ssh_option_args());
    args.push(source.as_os_str().to_owned());
    args.push(OsString::from(REMOTE_INCOMING_ROOT));
    CommandSpec::new("scp", args, timeout)
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
        bundle_matches_request, capability_result, content_mutation_remote_args,
        is_publish_transaction_id, legacy_controller_protocol_error, manual_sync_remote_args,
        parse_server_json, publish_error_for_transaction, remote_upload_chmod_specs,
        remote_upload_cleanup_spec, remote_upload_finalize_spec, retryable_client_error,
        scp_command_spec, ssh_command_spec, status_allows_publish_retry,
        transaction_result_from_status, upload_timeout, valid_https_url, validate_content_identity,
        validate_list_response, validate_mutation_identity, validate_pending_status_response,
        validate_publish_request, validate_publish_status_response, validate_status_response,
        validate_sync_response, CapturedOutput, PublishContentRequest, PublishMode,
        ServerCommandResult, SyncStatusRequest,
    };
    use crate::repository::RepositoryBundlePreflightResult;
    use serde_json::{json, Value};
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

    fn publish_request() -> PublishContentRequest {
        PublishContentRequest {
            repository_path: "C:\\fake".to_owned(),
            content_type: "science-article".to_owned(),
            stable_id: "example-id".to_owned(),
            transaction_id: "0123456789abcdef0123456789abcdef".to_owned(),
        }
    }

    fn publish_status(
        status: &str,
        stage: &str,
        retryable: bool,
        attempt: u64,
        switch_completed: bool,
    ) -> ServerCommandResult {
        ServerCommandResult::success(
            "publish-status",
            "Publish transaction status",
            Some(json!({
                "transactionId": "0123456789abcdef0123456789abcdef",
                "bundleSha256": "A".repeat(64),
                "contentCommit": "b".repeat(40),
                "siteCommit": "c".repeat(40),
                "status": status,
                "stage": stage,
                "failedStage": if status == "failed" { stage } else { "" },
                "stageStartedAt": "2026-07-29T12:00:01.000Z",
                "startedAt": "2026-07-29T12:00:00.000Z",
                "updatedAt": "2026-07-29T12:00:02.000Z",
                "elapsedMs": 2_000,
                "attempt": attempt,
                "retryable": retryable,
                "errorCode": if status == "failed" { "SITE_SOURCE_NETWORK_FAILED" } else { "" },
                "userMessage": "Publish transaction status",
                "technicalSummary": "",
                "releaseId": "20260729T120002Z-example",
                "releaseSha": "c".repeat(40),
                "contentSha": "b".repeat(40),
                "contentType": "science-article",
                "stableId": "example-id",
                "url": "https://example.invalid/zh/example-id",
                "switchCompleted": switch_completed,
                "sourceMethod": "cache",
                "stageDurationsMs": { "verifying_bundle": 250 }
            })),
        )
    }

    fn controller_status(
        publish_protocol_version: Option<u64>,
        queue_protocol_version: Option<u64>,
    ) -> ServerCommandResult {
        ServerCommandResult::success(
            "status",
            "Checked",
            Some(json!({
                "ready": true,
                "contentRepositoryReady": true,
                "serviceActive": true,
                "healthy": true,
                "publishProtocolVersion": publish_protocol_version,
                "queueProtocolVersion": queue_protocol_version,
                "currentRelease": "/srv/algae-atlas/releases/example",
                "previousRelease": null
            })),
        )
    }

    fn pending_status() -> ServerCommandResult {
        ServerCommandResult::success(
            "pending-status",
            "Pending content status checked",
            Some(json!({
                "schema_version": 1,
                "published_content_commit": "a".repeat(40),
                "pending_content_commit": "b".repeat(40),
                "syncing_content_commit": null,
                "has_pending_changes": true,
                "pending_upload_count": 2,
                "latest_upload_transaction_id": "1".repeat(32),
                "active_sync_transaction_id": null,
                "last_sync_transaction_id": "2".repeat(32),
                "last_sync_status": "PUBLISHED",
                "blocked_content_commit": null,
                "next_scheduled_sync_at": "2026-07-30T12:30:00.000Z",
                "sync_timer_active": true,
                "server_time": "2026-07-30T12:15:00.000Z",
                "site_commit": "c".repeat(40),
                "queue_protocol_version": 1,
                "sync_protocol_version": 1
            })),
        )
    }

    fn queue_upload_status(status: &str) -> ServerCommandResult {
        let failed = status == "FAILED";
        ServerCommandResult::success(
            "publish-status",
            "Queued upload status",
            Some(json!({
                "schemaVersion": 1,
                "transactionId": "1".repeat(32),
                "bundleSha256": "A".repeat(64),
                "sourceCommit": if failed { "".to_owned() } else { "a".repeat(40) },
                "contentCommit": if failed { "".to_owned() } else { "b".repeat(40) },
                "status": status,
                "queuedAt": if failed { "" } else { "2026-07-30T12:00:00.000Z" },
                "coalescedIntoCommit": if status == "COALESCED" { "c".repeat(40) } else { String::new() },
                "includedInSyncTransactionId": if matches!(status, "SYNCING" | "PUBLISHED") { "2".repeat(32) } else { String::new() },
                "publishedReleaseId": if status == "PUBLISHED" { "release-example" } else { "" },
                "publishedAt": if status == "PUBLISHED" { "2026-07-30T12:10:00.000Z" } else { "" },
                "retryable": false,
                "errorCode": if failed { "BUNDLE_HASH_MISMATCH" } else { "" },
                "contentType": if failed { "" } else { "science-article" },
                "stableId": if failed { "" } else { "example-id" }
            })),
        )
    }

    fn sync_status(status: &str) -> ServerCommandResult {
        let terminal = matches!(
            status,
            "PUBLISHED" | "FAILED_RETRYABLE" | "FAILED_BLOCKED" | "SKIPPED_NO_PENDING"
        );
        ServerCommandResult::success(
            "sync-status",
            "Synchronization status",
            Some(json!({
                "schema_version": 1,
                "sync_transaction_id": "2".repeat(32),
                "active_sync_transaction_id": if terminal { String::new() } else { "2".repeat(32) },
                "last_sync_transaction_id": if terminal { "2".repeat(32) } else { String::new() },
                "status": status,
                "stage": status,
                "trigger": "manual",
                "content_commit": if status == "SKIPPED_NO_PENDING" { "".to_owned() } else { "b".repeat(40) },
                "source_content_commit": if status == "SKIPPED_NO_PENDING" { "".to_owned() } else { "a".repeat(40) },
                "site_commit": "c".repeat(40),
                "release_id": if status == "PUBLISHED" { "release-example" } else { "" },
                "release_path": if status == "PUBLISHED" { "/srv/algae-atlas/releases/release-example" } else { "" },
                "started_at": "2026-07-30T12:00:00.000Z",
                "updated_at": "2026-07-30T12:00:02.000Z",
                "completed_at": if terminal { "2026-07-30T12:00:02.000Z" } else { "" },
                "elapsed_ms": 2_000,
                "retryable": status == "FAILED_RETRYABLE",
                "blocked": status == "FAILED_BLOCKED",
                "error_code": if status.starts_with("FAILED_") { "BUILD_FAILED" } else { "" },
                "attempt": 1,
                "max_attempts": 3,
                "recovered": false,
                "switch_completed": status == "PUBLISHED",
                "health_verified": status == "PUBLISHED"
            })),
        )
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
    fn identifies_the_legacy_controller_transaction_rejection() {
        let bytes = br#"{"ok":false,"action":"unknown","code":"INVALID_ARGUMENTS","message":"Unknown argument"}"#;
        let error = legacy_controller_protocol_error(bytes, "publish-status")
            .expect("legacy transaction command is recognized");
        assert!(!error.ok);
        assert_eq!(error.action, "publish-status");
        assert_eq!(error.code.as_deref(), Some("CONTROLLER_UPGRADE_REQUIRED"));
        assert!(legacy_controller_protocol_error(bytes, "status").is_none());
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
                "publishProtocolVersion": 1,
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

        let invalid_protocol = ServerCommandResult::success(
            "status",
            "Checked",
            Some(json!({
                "ready": true,
                "contentRepositoryReady": true,
                "serviceActive": true,
                "healthy": true,
                "publishProtocolVersion": "1"
            })),
        );
        assert!(!validate_status_response(invalid_protocol).ok);
    }

    #[test]
    fn capability_results_distinguish_legacy_and_queue_modes() {
        let legacy = capability_result(controller_status(Some(1), Some(1)), "legacy", false);
        assert!(legacy.ok);
        assert_eq!(legacy.action, "capabilities");
        assert_eq!(legacy.details.get("protocolMode"), Some(&json!("legacy")));
        assert_eq!(legacy.details.get("queueModeActive"), Some(&json!(false)));

        let queue = capability_result(controller_status(Some(1), Some(1)), "queue", true);
        assert!(queue.ok);
        assert_eq!(queue.details.get("protocolMode"), Some(&json!("queue")));
        assert_eq!(queue.details.get("queueModeActive"), Some(&json!(true)));

        assert!(validate_status_response(controller_status(None, None)).ok);
        assert!(!validate_status_response(controller_status(Some(101), Some(1))).ok);
    }

    #[test]
    fn validates_pending_status_exactly_and_rejects_corrupt_protocol() {
        assert!(validate_pending_status_response(pending_status()).ok);

        let mut inconsistent = pending_status();
        inconsistent
            .details
            .insert("has_pending_changes".to_owned(), json!(false));
        let rejected = validate_pending_status_response(inconsistent);
        assert!(!rejected.ok);
        assert_eq!(
            rejected.code.as_deref(),
            Some("CONTROLLER_PROTOCOL_INVALID")
        );

        let mut unknown = pending_status();
        unknown.details.insert("unexpected".to_owned(), json!(true));
        assert!(!validate_pending_status_response(unknown).ok);
    }

    #[test]
    fn validates_every_queued_upload_state_and_rejects_malformed_identity() {
        for status in ["FAILED", "QUEUED", "COALESCED", "SYNCING", "PUBLISHED"] {
            let response = validate_publish_status_response(queue_upload_status(status));
            assert!(response.ok || status == "FAILED", "status {status}");
            if status == "FAILED" {
                assert_eq!(response.code.as_deref(), Some("BUNDLE_HASH_MISMATCH"));
            }
        }

        let mut malformed = queue_upload_status("QUEUED");
        malformed
            .details
            .insert("transactionId".to_owned(), json!("../unsafe"));
        let rejected = validate_publish_status_response(malformed);
        assert!(!rejected.ok);
        assert_eq!(
            rejected.code.as_deref(),
            Some("CONTROLLER_PROTOCOL_INVALID")
        );
    }

    #[test]
    fn validates_sync_status_and_maps_terminal_manual_failures() {
        for status in [
            "SNAPSHOTTING",
            "PREPARING_SOURCE",
            "BUILDING",
            "PUBLISHED",
            "FAILED_RETRYABLE",
            "FAILED_BLOCKED",
            "SKIPPED_NO_PENDING",
        ] {
            assert!(
                validate_sync_response(sync_status(status), "sync-status").ok,
                "status {status}"
            );
        }

        let retryable = validate_sync_response(sync_status("FAILED_RETRYABLE"), "sync-pending");
        assert!(!retryable.ok);
        assert_eq!(retryable.code.as_deref(), Some("SYNC_FAILED_RETRYABLE"));
        let blocked = validate_sync_response(sync_status("FAILED_BLOCKED"), "sync-pending");
        assert!(!blocked.ok);
        assert_eq!(blocked.code.as_deref(), Some("SYNC_BLOCKED"));

        let mut corrupt = sync_status("BUILDING");
        corrupt.details.insert("stage".to_owned(), json!("UNKNOWN"));
        assert_eq!(
            validate_sync_response(corrupt, "sync-status")
                .code
                .as_deref(),
            Some("CONTROLLER_PROTOCOL_INVALID")
        );
    }

    #[test]
    fn desktop_sync_request_exposes_only_status_queries_and_fixed_manual_trigger() {
        assert!(serde_json::from_value::<SyncStatusRequest>(json!({})).is_ok());
        assert!(serde_json::from_value::<SyncStatusRequest>(json!({
            "transactionId": "2".repeat(32)
        }))
        .is_ok());
        for forbidden in [
            json!({ "trigger": "scheduled" }),
            json!({ "retryBlocked": true }),
            json!({ "command": "queue-init" }),
        ] {
            assert!(serde_json::from_value::<SyncStatusRequest>(forbidden).is_err());
        }

        let arguments = manual_sync_remote_args();
        assert_eq!(
            arguments,
            [
                "sudo",
                "-n",
                "/usr/local/sbin/algae-contentctl",
                "sync-pending",
                "--trigger",
                "manual",
                "--json"
            ]
        );
        assert!(!arguments.contains(&"scheduled"));
        assert!(!arguments.contains(&"--retry-blocked"));
        assert!(!arguments.contains(&"queue-init"));
    }

    #[test]
    fn accepts_structured_sync_failure_without_a_duplicate_top_level_code() {
        let parsed = parse_server_json(
            br#"{"ok":false,"action":"sync-pending","status":"FAILED_RETRYABLE","error_code":"BUILD_FAILED","message":"Build failed"}"#,
            "sync-pending",
        )
        .expect("uses the structured synchronization error code");
        assert!(!parsed.ok);
        assert_eq!(parsed.code.as_deref(), Some("BUILD_FAILED"));
    }

    #[test]
    fn validates_publish_status_and_rejects_unknown_or_incomplete_stages() {
        assert!(
            validate_publish_status_response(publish_status(
                "running",
                "building_site",
                false,
                1,
                false,
            ))
            .ok
        );

        let mut unknown = publish_status("running", "unknown_stage", false, 1, false);
        unknown
            .details
            .insert("stageDurationsMs".to_owned(), json!({ "unknown_stage": 1 }));
        assert!(!validate_publish_status_response(unknown).ok);

        let mut missing_timestamp = publish_status("running", "building_site", false, 1, false);
        missing_timestamp.details.remove("updatedAt");
        assert!(!validate_publish_status_response(missing_timestamp).ok);
    }

    #[test]
    fn transaction_validation_and_retry_ceiling_are_bounded() {
        assert!(is_publish_transaction_id(
            "0123456789abcdef0123456789abcdef"
        ));
        assert!(validate_publish_request(&publish_request()).is_ok());
        for invalid in [
            "0123456789ABCDEF0123456789ABCDEF",
            "0123456789abcdef",
            "../0123456789abcdef0123456789abc",
        ] {
            assert!(!is_publish_transaction_id(invalid));
        }

        assert!(status_allows_publish_retry(&publish_status(
            "failed",
            "preparing_site_source",
            true,
            2,
            false,
        )));
        assert!(!status_allows_publish_retry(&publish_status(
            "failed",
            "preparing_site_source",
            true,
            3,
            false,
        )));
        assert!(!status_allows_publish_retry(&publish_status(
            "failed",
            "switching_release",
            true,
            1,
            true,
        )));
    }

    #[test]
    fn classifies_transient_transport_errors_without_retrying_auth_or_validation() {
        for retryable in [
            "SSH_TIMEOUT",
            "UPLOAD_FAILED",
            "STATUS_QUERY_TIMEOUT",
            "SERVER_PROCESS_FAILED",
        ] {
            assert!(retryable_client_error(retryable));
        }
        for deterministic in [
            "SSH_AUTHENTICATION_FAILED",
            "REMOTE_BUNDLE_MISMATCH",
            "INVALID_BUNDLE",
            "BUILD_FAILED",
        ] {
            assert!(!retryable_client_error(deterministic));
        }

        let transient = publish_error_for_transaction(
            ServerCommandResult::error("publish", "SSH_TIMEOUT", "SSH timed out", None, None),
            "0123456789abcdef0123456789abcdef",
        );
        assert_eq!(transient.details.get("retryable"), Some(&json!(true)));
        let deterministic = publish_error_for_transaction(
            ServerCommandResult::error(
                "publish",
                "INVALID_BUNDLE",
                "Bundle is invalid",
                None,
                None,
            ),
            "0123456789abcdef0123456789abcdef",
        );
        assert_eq!(deterministic.details.get("retryable"), Some(&json!(false)));
    }

    #[test]
    fn status_results_preserve_identity_and_refuse_mismatched_transactions() {
        let response = transaction_result_from_status(
            publish_status("succeeded", "succeeded", false, 1, true),
            &publish_request(),
            PublishMode::Legacy,
        );
        assert!(response.ok);
        assert_eq!(response.action, "publish");

        let mut mismatch = publish_status("succeeded", "succeeded", false, 1, true);
        mismatch
            .details
            .insert("transactionId".to_owned(), Value::String("f".repeat(32)));
        let rejected =
            transaction_result_from_status(mismatch, &publish_request(), PublishMode::Legacy);
        assert!(!rejected.ok);
        assert_eq!(rejected.code.as_deref(), Some("TRANSACTION_STATE_MISMATCH"));
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

        let scp = scp_command_spec(Path::new("C:\\safe\\job"), Duration::from_secs(321));
        assert_eq!(scp.program, "scp");
        assert_eq!(scp.timeout, Duration::from_secs(321));
        assert_eq!(scp.args[0], OsString::from("-q"));
        assert!(scp
            .args
            .windows(2)
            .any(|pair| pair == [OsString::from("-o"), OsString::from("ConnectTimeout=10")]));
        assert!(scp.args.windows(2).any(|pair| pair
            == [
                OsString::from("-o"),
                OsString::from("ServerAliveInterval=15")
            ]));
        assert!(scp.args.windows(2).any(|pair| pair
            == [
                OsString::from("-o"),
                OsString::from("ServerAliveCountMax=2")
            ]));
        assert_eq!(
            scp.args.last(),
            Some(&OsString::from(
                "algae-server:/home/ubuntu/algae-content-workbench/incoming/"
            ))
        );
    }

    #[test]
    fn queue_upload_uses_only_the_fixed_controller_arguments() {
        let transaction_id = "1".repeat(32);
        let remote_delivery =
            format!("/home/ubuntu/algae-content-workbench/incoming/{transaction_id}");
        let bundle_sha256 = "A".repeat(64);
        let arguments = content_mutation_remote_args(
            PublishMode::Queue,
            &transaction_id,
            &remote_delivery,
            &bundle_sha256,
        );
        assert_eq!(
            arguments,
            [
                "sudo",
                "-n",
                "/usr/local/sbin/algae-contentctl",
                "queue-upload",
                "--transaction",
                transaction_id.as_str(),
                "--bundle",
                remote_delivery.as_str(),
                "--bundle-sha256",
                bundle_sha256.as_str(),
                "--json",
            ]
        );
        assert!(!arguments.contains(&"queue-init"));
        assert!(!arguments.contains(&"--retry-blocked"));
        assert!(!arguments.contains(&"--trigger"));
    }

    #[test]
    fn upload_timeout_scales_with_bundle_size_and_stays_bounded() {
        assert_eq!(upload_timeout(0), Duration::from_secs(120));
        assert_eq!(upload_timeout(8 * 1024), Duration::from_secs(120));
        assert_eq!(upload_timeout(9_092_544), Duration::from_secs(1_170));
        assert_eq!(
            upload_timeout(512 * 1024 * 1024),
            Duration::from_secs(30 * 60)
        );
        assert_eq!(upload_timeout(u64::MAX), Duration::from_secs(30 * 60));
    }

    #[test]
    fn uploaded_delivery_commands_use_fixed_partial_and_final_transaction_paths() {
        let job_id = "0123456789abcdef0123456789abcdef";
        let [directory, artifacts] =
            remote_upload_chmod_specs(job_id).expect("accepts a lowercase transaction id");
        let remote_partial =
            format!("/home/ubuntu/algae-content-workbench/incoming/.partial-{job_id}");
        let remote_delivery = format!("/home/ubuntu/algae-content-workbench/incoming/{job_id}");

        assert_eq!(directory.program, "ssh");
        assert!(directory.args.ends_with(&[
            OsString::from("algae-server"),
            OsString::from("/usr/bin/chmod"),
            OsString::from("0700"),
            OsString::from("--"),
            OsString::from(&remote_partial),
        ]));
        assert!(artifacts.args.ends_with(&[
            OsString::from("algae-server"),
            OsString::from("/usr/bin/chmod"),
            OsString::from("0600"),
            OsString::from("--"),
            OsString::from(format!("{remote_partial}/*")),
        ]));
        assert!(!directory.args.iter().any(|argument| argument == "sudo"));
        assert!(!artifacts.args.iter().any(|argument| argument == "sudo"));

        let finalize = remote_upload_finalize_spec(job_id).expect("finalize spec");
        assert!(finalize.args.ends_with(&[
            OsString::from("algae-server"),
            OsString::from("/usr/bin/mv"),
            OsString::from("-T"),
            OsString::from("--"),
            OsString::from(&remote_partial),
            OsString::from(&remote_delivery),
        ]));
        let cleanup = remote_upload_cleanup_spec(job_id).expect("cleanup spec");
        assert!(cleanup.args.ends_with(&[
            OsString::from("algae-server"),
            OsString::from("/usr/bin/rm"),
            OsString::from("-rf"),
            OsString::from("--"),
            OsString::from(&remote_partial),
        ]));

        for invalid in [
            "0123456789ABCDEF0123456789ABCDEF",
            "0123456789abcdef0123456789abcde;",
            "../0123456789abcdef0123456789abc",
            "0123456789abcdef",
        ] {
            assert!(remote_upload_chmod_specs(invalid).is_none());
        }
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
