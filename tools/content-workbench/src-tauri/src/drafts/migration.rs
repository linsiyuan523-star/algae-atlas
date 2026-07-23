use super::model::DraftEnvelopeV1;
use crate::{
    error::{AppError, AppResult},
    storage::deterministic_json,
    DRAFT_STORAGE_VERSION, MAX_DRAFT_BYTES, MAX_LOCAL_LABEL_CHARS, MAX_LOCAL_NOTES_BYTES,
    MAX_SAFE_REVISION,
};
use serde::Deserialize;
use time::{format_description::well_known::Rfc3339, OffsetDateTime, UtcOffset};
use uuid::{Uuid, Version};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionProbe {
    storage_version: u32,
}

pub fn encode_draft(draft: &DraftEnvelopeV1) -> AppResult<Vec<u8>> {
    validate_v1(draft, None)?;
    deterministic_json(draft, MAX_DRAFT_BYTES)
}

pub fn decode_draft(expected_id: Option<Uuid>, bytes: &[u8]) -> AppResult<DraftEnvelopeV1> {
    if bytes.len() > MAX_DRAFT_BYTES {
        return Err(AppError::draft_payload_too_large());
    }
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return Err(AppError::draft_envelope_invalid());
    }
    let json = std::str::from_utf8(bytes).map_err(|_| AppError::draft_envelope_invalid())?;
    let version: VersionProbe =
        serde_json::from_str(json).map_err(|_| AppError::draft_envelope_invalid())?;

    match version.storage_version {
        DRAFT_STORAGE_VERSION => decode_v1(json, expected_id),
        _ => Err(AppError::draft_storage_version_unsupported()),
    }
}

fn decode_v1(json: &str, expected_id: Option<Uuid>) -> AppResult<DraftEnvelopeV1> {
    let draft: DraftEnvelopeV1 = serde_json::from_str(json).map_err(|error| {
        if error.to_string().starts_with("unknown field") {
            AppError::draft_envelope_unknown_key()
        } else {
            AppError::draft_envelope_invalid()
        }
    })?;
    let migrated = migrate_v1(draft);
    validate_v1(&migrated, expected_id)?;
    Ok(migrated)
}

fn migrate_v1(draft: DraftEnvelopeV1) -> DraftEnvelopeV1 {
    draft
}

pub(crate) fn validate_v1(draft: &DraftEnvelopeV1, expected_id: Option<Uuid>) -> AppResult<()> {
    if draft.storage_version != DRAFT_STORAGE_VERSION {
        return Err(AppError::draft_storage_version_unsupported());
    }

    let id = parse_canonical_v4(&draft.id)?;
    if expected_id.is_some_and(|expected| expected != id) {
        return Err(AppError::draft_id_invalid());
    }
    if !(1..=MAX_SAFE_REVISION).contains(&draft.revision) {
        return Err(AppError::draft_revision_invalid());
    }
    if draft.local_label.chars().count() > MAX_LOCAL_LABEL_CHARS
        || draft.local_notes.len() > MAX_LOCAL_NOTES_BYTES
    {
        return Err(AppError::draft_envelope_invalid());
    }

    let created = parse_utc_timestamp(&draft.created_at)?;
    let updated = parse_utc_timestamp(&draft.updated_at)?;
    if updated < created {
        return Err(AppError::draft_envelope_invalid());
    }
    Ok(())
}

pub(crate) fn parse_canonical_v4(value: &str) -> AppResult<Uuid> {
    let id = Uuid::parse_str(value).map_err(|_| AppError::draft_id_invalid())?;
    if id.get_version() != Some(Version::Random) || id.to_string() != value {
        return Err(AppError::draft_id_invalid());
    }
    Ok(id)
}

pub(crate) fn parse_utc_timestamp(value: &str) -> AppResult<OffsetDateTime> {
    let timestamp =
        OffsetDateTime::parse(value, &Rfc3339).map_err(|_| AppError::draft_envelope_invalid())?;
    if timestamp.offset() != UtcOffset::UTC {
        return Err(AppError::draft_envelope_invalid());
    }
    Ok(timestamp)
}

#[cfg(test)]
mod tests {
    use super::{decode_draft, encode_draft};
    use crate::{
        drafts::model::DraftEnvelopeV1, DRAFT_STORAGE_VERSION, MAX_DRAFT_BYTES,
        MAX_LOCAL_LABEL_CHARS, MAX_LOCAL_NOTES_BYTES,
    };
    use serde_json::{json, Value};
    use uuid::Uuid;

    const ID: &str = "7d444840-9dc0-4f31-a42c-9f4b01e7abda";

    fn envelope() -> DraftEnvelopeV1 {
        DraftEnvelopeV1 {
            storage_version: DRAFT_STORAGE_VERSION,
            id: ID.to_owned(),
            revision: 7,
            created_at: "2025-06-01T10:00:00Z".to_owned(),
            updated_at: "2025-06-02T12:30:45.123456789Z".to_owned(),
            local_label: "Coastal sample".to_owned(),
            local_notes: "Private operator note".to_owned(),
            record_draft: json!({
                "aFutureTopLevelContentKey": {"nested": [1, true, null]},
                "typeThatRustMustNotValidate": "unknown-content-v999"
            }),
        }
    }

    fn issue_code(error: crate::error::AppError) -> String {
        error.code().to_owned()
    }

    #[test]
    fn valid_round_trip_is_deterministic_and_record_draft_is_opaque() {
        let draft = envelope();
        let first = encode_draft(&draft).expect("encodes");
        let second = encode_draft(&draft).expect("encodes deterministically");
        let decoded =
            decode_draft(Some(Uuid::parse_str(ID).expect("uuid")), &first).expect("decodes");

        assert_eq!(first, second);
        assert_eq!(decoded, draft);
        assert_eq!(
            decoded.record_draft,
            json!({
                "aFutureTopLevelContentKey": {"nested": [1, true, null]},
                "typeThatRustMustNotValidate": "unknown-content-v999"
            })
        );
    }

    #[test]
    fn unknown_outer_key_rejects_but_arbitrary_nested_keys_survive() {
        let bytes = encode_draft(&envelope()).expect("encodes");
        let mut outer: Value = serde_json::from_slice(&bytes).expect("json");
        outer
            .as_object_mut()
            .expect("object")
            .insert("unknownOuter".to_owned(), json!(true));
        let changed = serde_json::to_vec_pretty(&outer).expect("json");

        assert_eq!(
            issue_code(decode_draft(None, &changed).expect_err("unknown key rejects")),
            "DRAFT_ENVELOPE_UNKNOWN_KEY"
        );
    }

    #[test]
    fn unsupported_versions_reject_through_explicit_dispatch() {
        let bytes = encode_draft(&envelope()).expect("encodes");
        for version in [0, 2] {
            let mut outer: Value = serde_json::from_slice(&bytes).expect("json");
            outer["storageVersion"] = json!(version);
            let changed = serde_json::to_vec_pretty(&outer).expect("json");
            assert_eq!(
                issue_code(decode_draft(None, &changed).expect_err("version rejects")),
                "DRAFT_STORAGE_VERSION_UNSUPPORTED"
            );
        }
    }

    #[test]
    fn older_writer_golden_fixture_decodes_and_reencodes_byte_for_byte() {
        let golden = include_bytes!("../../tests/fixtures/draft-v1-golden.json");
        let decoded = decode_draft(None, golden).expect("golden fixture decodes");

        assert_eq!(encode_draft(&decoded).expect("reencodes"), golden);
    }

    #[test]
    fn malformed_and_noncanonical_uuids_and_filename_mismatches_reject() {
        let canonical = envelope();
        for invalid in [
            "not-a-uuid",
            "7D444840-9DC0-4F31-A42C-9F4B01E7ABDA",
            "7d444840-9dc0-1f31-a42c-9f4b01e7abda",
        ] {
            let mut changed = canonical.clone();
            changed.id = invalid.to_owned();
            let bytes = serde_json::to_vec_pretty(&changed).expect("json");
            assert_eq!(
                issue_code(decode_draft(None, &bytes).expect_err("id rejects")),
                "DRAFT_ID_INVALID"
            );
        }

        let bytes = encode_draft(&canonical).expect("encodes");
        let other = Uuid::parse_str("b7b89b66-86ed-4a80-a746-0b78e71e5fda").expect("uuid");
        assert_eq!(
            issue_code(decode_draft(Some(other), &bytes).expect_err("mismatch rejects")),
            "DRAFT_ID_INVALID"
        );
    }

    #[test]
    fn revision_timestamp_and_local_metadata_limits_are_validated() {
        let mut changed = envelope();
        changed.revision = 0;
        assert_eq!(
            issue_code(
                decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
                    .expect_err("zero revision rejects")
            ),
            "DRAFT_REVISION_INVALID"
        );

        changed = envelope();
        changed.created_at = "not-a-timestamp".to_owned();
        assert_eq!(
            issue_code(
                decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
                    .expect_err("bad timestamp rejects")
            ),
            "DRAFT_ENVELOPE_INVALID"
        );

        changed = envelope();
        changed.updated_at = "2025-05-31T23:59:59Z".to_owned();
        assert_eq!(
            issue_code(
                decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
                    .expect_err("out of order timestamps reject")
            ),
            "DRAFT_ENVELOPE_INVALID"
        );

        changed = envelope();
        changed.local_label = "藻".repeat(MAX_LOCAL_LABEL_CHARS);
        decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
            .expect("scalar-value label limit is accepted");
        changed.local_label.push('藻');
        assert_eq!(
            issue_code(
                decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
                    .expect_err("label above scalar limit rejects")
            ),
            "DRAFT_ENVELOPE_INVALID"
        );

        changed = envelope();
        changed.local_notes = "x".repeat(MAX_LOCAL_NOTES_BYTES);
        decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
            .expect("note byte limit is accepted");
        changed.local_notes.push('x');
        assert_eq!(
            issue_code(
                decode_draft(None, &serde_json::to_vec(&changed).expect("json"))
                    .expect_err("notes above byte limit reject")
            ),
            "DRAFT_ENVELOPE_INVALID"
        );
    }

    #[test]
    fn bom_invalid_utf8_and_corrupt_json_reject() {
        let valid = encode_draft(&envelope()).expect("encodes");
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(&valid);
        for invalid in [bom, vec![0xFF, 0xFE], b"{ broken json".to_vec()] {
            assert_eq!(
                issue_code(decode_draft(None, &invalid).expect_err("invalid bytes reject")),
                "DRAFT_ENVELOPE_INVALID"
            );
        }
    }

    fn valid_bytes_with_exact_size(size: usize) -> Vec<u8> {
        let mut outer = serde_json::to_value(envelope()).expect("value");
        outer["recordDraft"] = json!("");
        let mut base = serde_json::to_vec_pretty(&outer).expect("json");
        base.push(b'\n');
        let padding = size
            .checked_sub(base.len())
            .expect("requested size fits base");
        outer["recordDraft"] = json!("x".repeat(padding));
        let mut bytes = serde_json::to_vec_pretty(&outer).expect("json");
        bytes.push(b'\n');
        assert_eq!(bytes.len(), size);
        bytes
    }

    #[test]
    fn exact_draft_size_boundary_is_enforced() {
        for size in [MAX_DRAFT_BYTES - 1, MAX_DRAFT_BYTES] {
            decode_draft(None, &valid_bytes_with_exact_size(size)).expect("within limit");
        }
        assert_eq!(
            issue_code(
                decode_draft(None, &valid_bytes_with_exact_size(MAX_DRAFT_BYTES + 1))
                    .expect_err("one byte above rejects")
            ),
            "DRAFT_PAYLOAD_TOO_LARGE"
        );
    }
}
