use serde::Serialize;
use std::{
    error::Error,
    fmt,
    path::{Path, PathBuf},
};

pub type AppResult<T> = Result<T, AppError>;
pub type CommandResult<T> = Result<T, DesktopIssue>;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopIssue {
    pub code: String,
    pub message: String,
    pub remedy: String,
}

impl DesktopIssue {
    pub fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        remedy: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            remedy: remedy.into(),
        }
    }
}

pub struct AppError {
    issue: DesktopIssue,
    source: Option<Box<dyn Error + Send + Sync + 'static>>,
}

struct PathSource {
    path: PathBuf,
    source: Box<dyn Error + Send + Sync + 'static>,
}

impl fmt::Debug for PathSource {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PathSource")
            .field("path", &self.path)
            .field("source", &self.source)
            .finish()
    }
}

impl fmt::Display for PathSource {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.path.display(), self.source)
    }
}

impl Error for PathSource {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(self.source.as_ref())
    }
}

impl fmt::Debug for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AppError")
            .field("issue", &self.issue)
            .field("source", &self.source)
            .finish()
    }
}

impl AppError {
    fn issue(code: &'static str, message: &'static str, remedy: &'static str) -> Self {
        Self {
            issue: DesktopIssue::new(code, message, remedy),
            source: None,
        }
    }

    fn with_path_source(
        mut self,
        path: impl AsRef<Path>,
        source: impl Error + Send + Sync + 'static,
    ) -> Self {
        self.source = Some(Box::new(PathSource {
            path: path.as_ref().to_path_buf(),
            source: Box::new(source),
        }));
        self
    }

    pub fn app_path_unavailable(source: impl Error + Send + Sync + 'static) -> Self {
        let mut error = Self::issue(
            "APP_PATH_UNAVAILABLE",
            "An application storage path is unavailable.",
            "Restart the application. If it continues, inspect the application logs.",
        );
        error.source = Some(Box::new(source));
        error
    }

    pub(crate) fn storage_read(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        Self::issue(
            "STORAGE_READ_FAILED",
            "Local storage could not be read.",
            "Retry the operation. If it continues, inspect the application logs.",
        )
        .with_path_source(path, source)
    }

    pub(crate) fn storage_write(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        Self::issue(
            "STORAGE_WRITE_FAILED",
            "Local storage could not be written.",
            "Check available disk space and permissions, then retry.",
        )
        .with_path_source(path, source)
    }

    pub(crate) fn storage_encode(source: serde_json::Error) -> Self {
        let mut error = Self::issue(
            "STORAGE_WRITE_FAILED",
            "Local storage could not be written.",
            "Check available disk space and permissions, then retry.",
        );
        error.source = Some(Box::new(source));
        error
    }

    pub(crate) fn atomic_replace(
        path: impl AsRef<Path>,
        source: impl Error + Send + Sync + 'static,
    ) -> Self {
        Self::issue(
            "ATOMIC_REPLACE_FAILED",
            "The local draft could not be replaced safely.",
            "Retry the operation. The previous draft has been preserved.",
        )
        .with_path_source(path, source)
    }

    pub(crate) fn draft_id_invalid() -> Self {
        Self::issue(
            "DRAFT_ID_INVALID",
            "The draft identifier is invalid.",
            "Use the canonical draft identifier returned by the application.",
        )
    }

    pub(crate) fn draft_not_found() -> Self {
        Self::issue(
            "DRAFT_NOT_FOUND",
            "The requested draft was not found.",
            "Refresh the draft list and choose an available draft.",
        )
    }

    pub(crate) fn draft_payload_too_large() -> Self {
        Self::issue(
            "DRAFT_PAYLOAD_TOO_LARGE",
            "The draft exceeds the local storage size limit.",
            "Reduce the draft content and retry.",
        )
    }

    pub(crate) fn draft_storage_version_unsupported() -> Self {
        Self::issue(
            "DRAFT_STORAGE_VERSION_UNSUPPORTED",
            "This draft uses an unsupported storage version.",
            "Open the draft with a compatible application version.",
        )
    }

    pub(crate) fn draft_envelope_unknown_key() -> Self {
        Self::issue(
            "DRAFT_ENVELOPE_UNKNOWN_KEY",
            "The draft envelope contains an unknown field.",
            "Remove the unsupported envelope field or use a compatible application version.",
        )
    }

    pub(crate) fn draft_envelope_invalid() -> Self {
        Self::issue(
            "DRAFT_ENVELOPE_INVALID",
            "The draft envelope is invalid.",
            "Restore a valid draft backup or create a new draft.",
        )
    }

    pub(crate) fn draft_revision_invalid() -> Self {
        Self::issue(
            "DRAFT_REVISION_INVALID",
            "The draft revision is outside the supported range.",
            "Reload the draft before retrying the operation.",
        )
    }

    pub(crate) fn draft_revision_conflict() -> Self {
        Self::issue(
            "DRAFT_REVISION_CONFLICT",
            "The draft changed after it was loaded.",
            "Reload the latest draft and reapply your changes.",
        )
    }

    pub(crate) fn storage_lock_failed() -> Self {
        Self::issue(
            "STORAGE_READ_FAILED",
            "Local storage could not be read.",
            "Retry the operation. If it continues, restart the application.",
        )
    }

    #[cfg(test)]
    pub(crate) fn code(&self) -> &str {
        &self.issue.code
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.issue.message)
    }
}

impl Error for AppError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.source
            .as_deref()
            .map(|source| source as &(dyn Error + 'static))
    }
}

impl From<AppError> for DesktopIssue {
    fn from(error: AppError) -> Self {
        error.issue
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, DesktopIssue};
    use serde_json::json;
    use std::{io, path::PathBuf};

    #[test]
    fn desktop_issue_serializes_only_the_public_contract() {
        let issue = DesktopIssue::new(
            "STORAGE_READ_FAILED",
            "The draft could not be read.",
            "Retry the operation. If it continues, inspect the application logs.",
        );

        assert_eq!(
            serde_json::to_value(issue).expect("issue serializes"),
            json!({
                "code": "STORAGE_READ_FAILED",
                "message": "The draft could not be read.",
                "remedy": "Retry the operation. If it continues, inspect the application logs."
            })
        );
    }

    #[test]
    fn internal_context_never_reaches_serialized_issues() {
        let secrets = [
            r"C:\Users\alice\AppData\Local\secret\draft.json",
            ".draft.json.operation-secret.tmp",
            "ALGAE_PRIVATE_ENV=hidden",
            r#"{\"recordDraft\":{\"privateBody\":\"do not leak\"}}"#,
        ];
        let source_message = secrets.join(" | ");
        let error =
            AppError::storage_read(PathBuf::from(secrets[0]), io::Error::other(source_message));
        let serialized =
            serde_json::to_string(&DesktopIssue::from(error)).expect("issue serializes");

        for secret in secrets {
            assert!(!serialized.contains(secret), "leaked secret: {secret}");
        }
        assert!(serialized.contains("STORAGE_READ_FAILED"));
    }

    #[test]
    fn unavailable_app_path_uses_the_stable_redacted_code() {
        let error = AppError::app_path_unavailable(io::Error::other(
            "PRIVATE_ENV=C:/Users/alice/private-app-data",
        ));
        let serialized = serde_json::to_string(&DesktopIssue::from(error)).expect("serializes");

        assert!(serialized.contains("APP_PATH_UNAVAILABLE"));
        assert!(!serialized.contains("PRIVATE_ENV"));
        assert!(!serialized.contains("C:/Users/alice"));
    }
}
