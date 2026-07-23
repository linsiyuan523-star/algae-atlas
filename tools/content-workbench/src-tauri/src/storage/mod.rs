use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{fs::File, io::Read, path::Path};

pub fn deterministic_json<T: Serialize>(value: &T, limit: usize) -> AppResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(AppError::storage_encode)?;
    bytes.push(b'\n');
    if bytes.len() > limit {
        return Err(AppError::draft_payload_too_large());
    }
    Ok(bytes)
}

pub fn read_bounded(path: &Path, limit: usize) -> AppResult<Vec<u8>> {
    let mut file = File::open(path).map_err(|error| AppError::storage_read(path, error))?;
    read_bounded_file(&mut file, path, limit)
}

pub fn read_bounded_file(file: &mut File, path: &Path, limit: usize) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut bounded = file.take(limit.saturating_add(1) as u64);
    bounded
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::storage_read(path, error))?;
    if bytes.len() > limit {
        return Err(AppError::draft_payload_too_large());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::{deterministic_json, read_bounded};
    use serde::Serialize;
    use std::fs;
    use tempfile::tempdir;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Example<'a> {
        storage_version: u32,
        text: &'a str,
    }

    #[test]
    fn deterministic_json_is_utf8_two_space_lf_with_one_trailing_lf() {
        let bytes = deterministic_json(
            &Example {
                storage_version: 1,
                text: "海藻",
            },
            1024,
        )
        .expect("serializes");

        assert_eq!(
            bytes,
            "{\n  \"storageVersion\": 1,\n  \"text\": \"海藻\"\n}\n".as_bytes()
        );
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert!(!bytes.windows(2).any(|window| window == b"\r\n"));
        assert!(bytes.ends_with(b"}\n"));
        assert!(!bytes.ends_with(b"}\n\n"));
    }

    #[test]
    fn serialization_and_bounded_reads_reject_limit_plus_one() {
        let bytes = deterministic_json(
            &Example {
                storage_version: 1,
                text: "x",
            },
            1024,
        )
        .expect("serializes");
        assert!(deterministic_json(
            &Example {
                storage_version: 1,
                text: "x",
            },
            bytes.len() - 1,
        )
        .is_err());

        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("bounded.json");
        fs::write(&path, b"12345").expect("writes fixture");
        assert_eq!(
            read_bounded(&path, 5).expect("at limit is accepted"),
            b"12345"
        );
        assert_eq!(
            read_bounded(&path, 6).expect("below limit is accepted"),
            b"12345"
        );
        assert_eq!(
            read_bounded(&path, 4)
                .expect_err("limit plus one is rejected")
                .code(),
            "DRAFT_PAYLOAD_TOO_LARGE"
        );
    }
}

pub mod atomic_replace;
pub mod path_safety;
