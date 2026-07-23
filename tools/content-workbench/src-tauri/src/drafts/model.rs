use crate::error::DesktopIssue;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftEnvelopeV1 {
    pub storage_version: u32,
    pub id: String,
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
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDraftRequest {
    pub id: String,
    pub expected_revision: u64,
    pub local_label: String,
    pub local_notes: String,
    pub record_draft: Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteDraftRequest {
    pub id: String,
    pub expected_revision: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSummary {
    pub id: String,
    pub revision: u64,
    pub created_at: String,
    pub updated_at: String,
    pub local_label: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDraftsResponse {
    pub drafts: Vec<DraftSummary>,
    pub issues: Vec<DesktopIssue>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDraftResponse {
    pub id: String,
    pub deleted_at: String,
    pub recoverable: bool,
}
