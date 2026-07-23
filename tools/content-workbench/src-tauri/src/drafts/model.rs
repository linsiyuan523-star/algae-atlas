use crate::error::DesktopIssue;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredDraftV1 {
    pub storage_version: u32,
    pub draft_id: String,
    pub revision: u64,
    pub created_at: String,
    pub updated_at: String,
    pub local_label: String,
    pub local_notes: String,
    pub record_draft: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDraftRequest {
    pub local_label: String,
    pub local_notes: String,
    pub record_draft: Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadDraftRequest {
    pub draft_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDraftRequest {
    pub draft_id: String,
    pub expected_revision: u64,
    pub local_label: String,
    pub local_notes: String,
    pub record_draft: Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteDraftRequest {
    pub draft_id: String,
    pub expected_revision: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDraftsResponse {
    pub drafts: Vec<StoredDraftV1>,
    pub issues: Vec<DesktopIssue>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedDraft {
    pub draft_id: String,
    pub revision: u64,
    pub deleted_at: String,
    pub recoverable: bool,
}

#[cfg(test)]
mod tests {
    use super::{
        DeleteDraftRequest, DeletedDraft, ListDraftsResponse, LoadDraftRequest, SaveDraftRequest,
        StoredDraftV1,
    };
    use serde_json::{json, Value};

    const ID: &str = "11111111-1111-4111-8111-111111111111";

    fn stored() -> StoredDraftV1 {
        StoredDraftV1 {
            storage_version: 1,
            draft_id: ID.to_owned(),
            revision: 4,
            created_at: "2026-01-01T00:00:00Z".to_owned(),
            updated_at: "2026-01-02T00:00:00Z".to_owned(),
            local_label: "label".to_owned(),
            local_notes: "notes".to_owned(),
            record_draft: json!({"opaque": true}),
        }
    }

    #[test]
    fn stored_draft_serializes_identity_as_draft_id() {
        let value = serde_json::to_value(stored()).expect("serializes stored draft");

        assert_eq!(value["draftId"], ID);
        assert!(value.get("id").is_none());
    }

    #[test]
    fn draft_inputs_decode_draft_id_and_reject_id() {
        let load = serde_json::from_value::<LoadDraftRequest>(json!({"draftId": ID}));
        let save = serde_json::from_value::<SaveDraftRequest>(json!({
            "draftId": ID,
            "expectedRevision": 4,
            "localLabel": "label",
            "localNotes": "notes",
            "recordDraft": {}
        }));
        let delete = serde_json::from_value::<DeleteDraftRequest>(json!({
            "draftId": ID,
            "expectedRevision": 4
        }));

        assert!(load.is_ok());
        assert!(save.is_ok());
        assert!(delete.is_ok());
        assert!(serde_json::from_value::<LoadDraftRequest>(json!({"id": ID})).is_err());
    }

    #[test]
    fn list_contains_complete_stored_drafts() {
        let draft = stored();
        let response = ListDraftsResponse {
            drafts: vec![draft],
            issues: Vec::new(),
        };
        let value = serde_json::to_value(response).expect("serializes list response");

        assert_eq!(value["drafts"][0]["localNotes"], "notes");
        assert_eq!(value["drafts"][0]["recordDraft"], json!({"opaque": true}));
    }

    #[test]
    fn deleted_draft_contains_draft_id_revision_and_recoverability() {
        let response = DeletedDraft {
            draft_id: ID.to_owned(),
            revision: 4,
            deleted_at: "2026-01-03T00:00:00Z".to_owned(),
            recoverable: true,
        };
        let value: Value = serde_json::to_value(response).expect("serializes deleted draft");

        assert_eq!(value["draftId"], ID);
        assert_eq!(value["revision"], 4);
        assert_eq!(value["recoverable"], true);
        assert!(value.get("id").is_none());
    }
}
