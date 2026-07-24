use crate::drafts::{install_atomically, sync_directory, verify_safe_regular_file};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::{Uuid, Version};

const STAGED_MEDIA_FORMAT_VERSION: u32 = 1;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_STAGED_IMAGES_PER_DRAFT: usize = 64;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 100_000_000;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaPurpose {
    Cover,
    Body,
    Gallery,
    Portrait,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaMetadataDraft {
    pub creator_or_provider: String,
    pub source_url: String,
    pub license_identifier: String,
    pub license_name: String,
    pub license_url: String,
    pub attribution: String,
    pub usage_scope: String,
    pub rights_status: String,
    pub identification_status: String,
    pub identifiable_people: bool,
    pub consent_state: String,
    pub consent_reference: String,
    pub alt_zh: String,
    pub alt_en: String,
    pub caption_zh: String,
    pub caption_en: String,
}

impl Default for MediaMetadataDraft {
    fn default() -> Self {
        Self {
            creator_or_provider: String::new(),
            source_url: String::new(),
            license_identifier: String::new(),
            license_name: String::new(),
            license_url: String::new(),
            attribution: String::new(),
            usage_scope: "internal-only".to_owned(),
            rights_status: "pending".to_owned(),
            identification_status: "not-applicable".to_owned(),
            identifiable_people: false,
            consent_state: "not-applicable".to_owned(),
            consent_reference: String::new(),
            alt_zh: String::new(),
            alt_en: String::new(),
            caption_zh: String::new(),
            caption_en: String::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StagedImage {
    pub format_version: u32,
    pub draft_id: String,
    pub id: String,
    pub original_name: String,
    pub staged_name: String,
    pub target_path: String,
    pub mime_type: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
    pub sha256: String,
    pub uploaded_at: String,
    pub purpose: MediaPurpose,
    pub metadata: MediaMetadataDraft,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StageImageRequest {
    pub draft_id: String,
    pub original_name: String,
    pub purpose: MediaPurpose,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftMediaRequest {
    pub draft_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveImageMetadataRequest {
    pub draft_id: String,
    pub image_id: String,
    pub metadata: MediaMetadataDraft,
}

#[derive(Debug, Error)]
enum MediaStoreError {
    #[error("draft id must be a canonical UUID v4")]
    InvalidDraftId,
    #[error("image id must be a canonical UUID v4")]
    InvalidImageId,
    #[error("the selected file name is unsafe")]
    InvalidFileName,
    #[error("only JPEG, PNG, WebP, and AVIF images are accepted")]
    UnsupportedFileType,
    #[error("the selected image is empty or exceeds the 20 MiB limit")]
    InvalidFileSize,
    #[error("the file extension does not match the image signature")]
    SignatureMismatch,
    #[error("the image is truncated, malformed, or has unsafe dimensions")]
    InvalidImage,
    #[error("the staged image path is unsafe")]
    UnsafePath,
    #[error("the staged image was not found")]
    NotFound,
    #[error("a draft can stage at most 64 images")]
    TooManyImages,
    #[error("the media metadata draft is invalid")]
    InvalidMetadata,
    #[error("the media staging service is busy")]
    LockFailed,
    #[error("media staging failed: {0}")]
    Storage(#[from] std::io::Error),
    #[error("media manifest JSON failed: {0}")]
    Json(#[from] serde_json::Error),
}

type StoreResult<T> = Result<T, MediaStoreError>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ImageInfo {
    mime_type: &'static str,
    width: u32,
    height: u32,
}

pub struct MediaStore {
    root: PathBuf,
    operation_lock: Mutex<()>,
}

impl MediaStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            operation_lock: Mutex::new(()),
        }
    }

    fn stage(&self, request: StageImageRequest) -> StoreResult<StagedImage> {
        let draft_id = parse_uuid_v4(&request.draft_id, MediaStoreError::InvalidDraftId)?;
        let extension = validate_original_name(&request.original_name)?;
        let image_info = inspect_image(&request.bytes)?;
        if !extension_matches_mime(&extension, image_info.mime_type) {
            return Err(MediaStoreError::SignatureMismatch);
        }

        let _guard = self.lock()?;
        let draft_root = self.prepare_draft_root(draft_id)?;
        if manifest_ids(&draft_root)?.len() >= MAX_STAGED_IMAGES_PER_DRAFT {
            return Err(MediaStoreError::TooManyImages);
        }

        let image_id = Uuid::new_v4();
        let staged_name = format!("{image_id}.{extension}");
        let now = OffsetDateTime::now_utc();
        let uploaded_at = now
            .format(&Rfc3339)
            .map_err(|_| MediaStoreError::InvalidImage)?;
        let target_path = format!(
            "public/images/uploads/{:04}/{:02}/{staged_name}",
            now.year(),
            now.month() as u8,
        );
        let image = StagedImage {
            format_version: STAGED_MEDIA_FORMAT_VERSION,
            draft_id: draft_id.to_string(),
            id: image_id.to_string(),
            original_name: request.original_name,
            staged_name: staged_name.clone(),
            target_path,
            mime_type: image_info.mime_type.to_owned(),
            bytes: request.bytes.len() as u64,
            width: image_info.width,
            height: image_info.height,
            sha256: sha256_hex(&request.bytes),
            uploaded_at,
            purpose: request.purpose,
            metadata: MediaMetadataDraft::default(),
        };
        validate_staged_image(&image, draft_id, image_id)?;

        let binary_target = draft_root.join(&staged_name);
        write_file_atomically(&draft_root, &binary_target, &request.bytes, true)?;
        if let Err(error) = self.write_manifest(&draft_root, &image, true) {
            let _ = fs::remove_file(&binary_target);
            let _ = sync_directory(&draft_root);
            return Err(error);
        }
        Ok(image)
    }

    fn list(&self, draft_id: &str) -> StoreResult<Vec<StagedImage>> {
        let draft_id = parse_uuid_v4(draft_id, MediaStoreError::InvalidDraftId)?;
        let _guard = self.lock()?;
        let draft_root = self.prepare_draft_root(draft_id)?;
        let mut images = manifest_ids(&draft_root)?
            .into_iter()
            .map(|image_id| self.read_image(&draft_root, draft_id, image_id))
            .collect::<StoreResult<Vec<_>>>()?;
        images.sort_by(|left, right| {
            left.uploaded_at
                .cmp(&right.uploaded_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(images)
    }

    fn save_metadata(&self, request: SaveImageMetadataRequest) -> StoreResult<StagedImage> {
        let draft_id = parse_uuid_v4(&request.draft_id, MediaStoreError::InvalidDraftId)?;
        let image_id = parse_uuid_v4(&request.image_id, MediaStoreError::InvalidImageId)?;
        validate_metadata(&request.metadata)?;

        let _guard = self.lock()?;
        let draft_root = self.prepare_draft_root(draft_id)?;
        let mut image = self.read_image(&draft_root, draft_id, image_id)?;
        image.metadata = request.metadata;
        self.write_manifest(&draft_root, &image, false)?;
        Ok(image)
    }

    fn lock(&self) -> StoreResult<MutexGuard<'_, ()>> {
        self.operation_lock
            .lock()
            .map_err(|_| MediaStoreError::LockFailed)
    }

    fn prepare_root(&self) -> StoreResult<()> {
        fs::create_dir_all(&self.root)?;
        let metadata = fs::symlink_metadata(&self.root)?;
        if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
            return Err(MediaStoreError::UnsafePath);
        }
        Ok(())
    }

    fn prepare_draft_root(&self, draft_id: Uuid) -> StoreResult<PathBuf> {
        self.prepare_root()?;
        let draft_root = self.root.join(draft_id.to_string());
        fs::create_dir_all(&draft_root)?;
        let metadata = fs::symlink_metadata(&draft_root)?;
        if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
            return Err(MediaStoreError::UnsafePath);
        }

        let canonical_root = fs::canonicalize(&self.root)?;
        let canonical_draft_root = fs::canonicalize(&draft_root)?;
        if canonical_draft_root.parent() != Some(canonical_root.as_path()) {
            return Err(MediaStoreError::UnsafePath);
        }
        Ok(draft_root)
    }

    fn read_image(
        &self,
        draft_root: &Path,
        draft_id: Uuid,
        image_id: Uuid,
    ) -> StoreResult<StagedImage> {
        let manifest_path = draft_root.join(format!("{image_id}.json"));
        let manifest = read_limited_file(draft_root, &manifest_path, MAX_MANIFEST_BYTES)?;
        let image: StagedImage = serde_json::from_slice(&manifest)?;
        validate_staged_image(&image, draft_id, image_id)?;

        let binary_path = draft_root.join(&image.staged_name);
        let bytes = read_limited_file(draft_root, &binary_path, MAX_IMAGE_BYTES as u64)?;
        let inspected = inspect_image(&bytes)?;
        if inspected.mime_type != image.mime_type
            || inspected.width != image.width
            || inspected.height != image.height
            || bytes.len() as u64 != image.bytes
            || sha256_hex(&bytes) != image.sha256
        {
            return Err(MediaStoreError::InvalidImage);
        }
        Ok(image)
    }

    fn write_manifest(
        &self,
        draft_root: &Path,
        image: &StagedImage,
        create_new: bool,
    ) -> StoreResult<()> {
        let draft_id = parse_uuid_v4(&image.draft_id, MediaStoreError::InvalidDraftId)?;
        let image_id = parse_uuid_v4(&image.id, MediaStoreError::InvalidImageId)?;
        validate_staged_image(image, draft_id, image_id)?;
        let mut bytes = serde_json::to_vec_pretty(image)?;
        bytes.push(b'\n');
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err(MediaStoreError::InvalidMetadata);
        }
        let target = draft_root.join(format!("{image_id}.json"));
        write_file_atomically(draft_root, &target, &bytes, create_new)
    }
}

fn parse_uuid_v4(value: &str, error: MediaStoreError) -> StoreResult<Uuid> {
    let id = match Uuid::parse_str(value) {
        Ok(id) => id,
        Err(_) => return Err(error),
    };
    if id.get_version() != Some(Version::Random) || id.to_string() != value {
        return Err(error);
    }
    Ok(id)
}

fn validate_original_name(name: &str) -> StoreResult<String> {
    if name.is_empty()
        || name.chars().count() > 255
        || name.chars().any(char::is_control)
        || name.contains(['/', '\\', ':'])
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
    {
        return Err(MediaStoreError::InvalidFileName);
    }
    let path = Path::new(name);
    if path.file_name().and_then(|value| value.to_str()) != Some(name) {
        return Err(MediaStoreError::InvalidFileName);
    }
    let base = name.split('.').next().unwrap_or_default();
    let reserved = matches!(
        base.to_ascii_lowercase().as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    );
    if reserved {
        return Err(MediaStoreError::InvalidFileName);
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or(MediaStoreError::UnsupportedFileType)?;
    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp" | "avif") {
        return Err(MediaStoreError::UnsupportedFileType);
    }
    Ok(extension)
}

fn extension_matches_mime(extension: &str, mime_type: &str) -> bool {
    matches!(
        (extension, mime_type),
        ("jpg" | "jpeg", "image/jpeg")
            | ("png", "image/png")
            | ("webp", "image/webp")
            | ("avif", "image/avif")
    )
}

fn validate_staged_image(
    image: &StagedImage,
    expected_draft_id: Uuid,
    expected_image_id: Uuid,
) -> StoreResult<()> {
    if image.format_version != STAGED_MEDIA_FORMAT_VERSION
        || parse_uuid_v4(&image.draft_id, MediaStoreError::InvalidDraftId)? != expected_draft_id
        || parse_uuid_v4(&image.id, MediaStoreError::InvalidImageId)? != expected_image_id
    {
        return Err(MediaStoreError::InvalidMetadata);
    }
    validate_original_name(&image.original_name)?;
    let extension = Path::new(&image.staged_name)
        .extension()
        .and_then(|value| value.to_str())
        .ok_or(MediaStoreError::InvalidMetadata)?;
    if image.staged_name != format!("{}.{}", image.id, extension)
        || !extension_matches_mime(extension, &image.mime_type)
        || image.bytes == 0
        || image.bytes > MAX_IMAGE_BYTES as u64
        || image.width == 0
        || image.height == 0
        || image.width > MAX_IMAGE_DIMENSION
        || image.height > MAX_IMAGE_DIMENSION
        || u64::from(image.width) * u64::from(image.height) > MAX_IMAGE_PIXELS
        || image.sha256.len() != 64
        || !image
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(MediaStoreError::InvalidMetadata);
    }
    let uploaded = OffsetDateTime::parse(&image.uploaded_at, &Rfc3339)
        .map_err(|_| MediaStoreError::InvalidMetadata)?;
    let expected_target = format!(
        "public/images/uploads/{:04}/{:02}/{}",
        uploaded.year(),
        uploaded.month() as u8,
        image.staged_name,
    );
    if image.target_path != expected_target {
        return Err(MediaStoreError::UnsafePath);
    }
    validate_metadata(&image.metadata)
}

fn validate_metadata(metadata: &MediaMetadataDraft) -> StoreResult<()> {
    for (value, max_chars) in [
        (&metadata.creator_or_provider, 500),
        (&metadata.license_name, 500),
        (&metadata.attribution, 1_000),
        (&metadata.consent_reference, 500),
        (&metadata.alt_zh, 1_000),
        (&metadata.alt_en, 1_000),
        (&metadata.caption_zh, 2_000),
        (&metadata.caption_en, 2_000),
    ] {
        if value.chars().count() > max_chars
            || value
                .chars()
                .any(|character| character.is_control() && character != '\n')
        {
            return Err(MediaStoreError::InvalidMetadata);
        }
    }
    for url in [&metadata.source_url, &metadata.license_url] {
        if url.chars().count() > 2_048 || (!url.is_empty() && !is_safe_https_url(url)) {
            return Err(MediaStoreError::InvalidMetadata);
        }
    }
    if !metadata.license_identifier.is_empty()
        && !matches!(
            metadata.license_identifier.as_str(),
            "cc0-1.0"
                | "cc-by-4.0"
                | "cc-by-sa-4.0"
                | "public-domain"
                | "team-owned"
                | "permission-granted"
                | "other"
        )
    {
        return Err(MediaStoreError::InvalidMetadata);
    }
    if !matches!(
        metadata.usage_scope.as_str(),
        "public-site" | "education-only" | "internal-only"
    ) || !matches!(
        metadata.rights_status.as_str(),
        "approved" | "pending" | "restricted"
    ) || !matches!(
        metadata.identification_status.as_str(),
        "not-applicable" | "unverified" | "provisional" | "verified"
    ) || !matches!(
        metadata.consent_state.as_str(),
        "not-applicable" | "confirmed" | "pending"
    ) {
        return Err(MediaStoreError::InvalidMetadata);
    }
    Ok(())
}

fn is_safe_https_url(value: &str) -> bool {
    if value.chars().any(char::is_whitespace) || !value.starts_with("https://") {
        return false;
    }
    let authority = value[8..].split(['/', '?', '#']).next().unwrap_or_default();
    !authority.is_empty() && !authority.contains('@') && !authority.starts_with(':')
}

fn manifest_ids(draft_root: &Path) -> StoreResult<Vec<Uuid>> {
    let mut ids = Vec::new();
    for entry in fs::read_dir(draft_root)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or(MediaStoreError::InvalidImageId)?;
        ids.push(parse_uuid_v4(stem, MediaStoreError::InvalidImageId)?);
    }
    Ok(ids)
}

fn write_file_atomically(
    root: &Path,
    target: &Path,
    bytes: &[u8],
    create_new: bool,
) -> StoreResult<()> {
    if !create_new {
        verify_safe_regular_file(root, target).map_err(|_| MediaStoreError::UnsafePath)?;
    }
    let temporary = root.join(format!(".{}.tmp", Uuid::new_v4()));
    let result = (|| -> StoreResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        install_atomically(&temporary, target, create_new)?;
        sync_directory(root)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn read_limited_file(root: &Path, target: &Path, limit: u64) -> StoreResult<Vec<u8>> {
    let metadata = fs::symlink_metadata(target).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            MediaStoreError::NotFound
        } else {
            error.into()
        }
    })?;
    if metadata.len() == 0 || metadata.len() > limit {
        return Err(MediaStoreError::InvalidFileSize);
    }
    verify_safe_regular_file(root, target).map_err(|_| MediaStoreError::UnsafePath)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(target)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(MediaStoreError::InvalidFileSize);
    }
    Ok(bytes)
}

fn inspect_image(bytes: &[u8]) -> StoreResult<ImageInfo> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err(MediaStoreError::InvalidFileSize);
    }
    let info = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        inspect_png(bytes)?
    } else if bytes.starts_with(&[0xff, 0xd8]) {
        inspect_jpeg(bytes)?
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        inspect_webp(bytes)?
    } else if looks_like_avif(bytes) {
        inspect_avif(bytes)?
    } else {
        return Err(MediaStoreError::UnsupportedFileType);
    };
    validate_dimensions(info.width, info.height)?;
    Ok(info)
}

fn validate_dimensions(width: u32, height: u32) -> StoreResult<()> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(MediaStoreError::InvalidImage);
    }
    Ok(())
}

fn inspect_png(bytes: &[u8]) -> StoreResult<ImageInfo> {
    let mut cursor = 8usize;
    let mut dimensions = None;
    let mut saw_data = false;
    let mut saw_end = false;
    while cursor < bytes.len() {
        if cursor + 12 > bytes.len() {
            return Err(MediaStoreError::InvalidImage);
        }
        let length = be_u32(&bytes[cursor..cursor + 4]) as usize;
        let chunk_type = &bytes[cursor + 4..cursor + 8];
        let data_start = cursor + 8;
        let data_end = data_start
            .checked_add(length)
            .filter(|end| end + 4 <= bytes.len())
            .ok_or(MediaStoreError::InvalidImage)?;
        let expected_crc = be_u32(&bytes[data_end..data_end + 4]);
        if crc32(&bytes[cursor + 4..data_end]) != expected_crc {
            return Err(MediaStoreError::InvalidImage);
        }
        if dimensions.is_none() {
            if chunk_type != b"IHDR" || length != 13 {
                return Err(MediaStoreError::InvalidImage);
            }
            let width = be_u32(&bytes[data_start..data_start + 4]);
            let height = be_u32(&bytes[data_start + 4..data_start + 8]);
            if !matches!(bytes[data_start + 8], 1 | 2 | 4 | 8 | 16)
                || !matches!(bytes[data_start + 9], 0 | 2 | 3 | 4 | 6)
                || bytes[data_start + 10] != 0
                || bytes[data_start + 11] != 0
                || bytes[data_start + 12] > 1
            {
                return Err(MediaStoreError::InvalidImage);
            }
            dimensions = Some((width, height));
        } else if chunk_type == b"IHDR" {
            return Err(MediaStoreError::InvalidImage);
        }
        if chunk_type == b"IDAT" {
            saw_data = true;
        }
        if chunk_type == b"IEND" {
            if length != 0 || data_end + 4 != bytes.len() {
                return Err(MediaStoreError::InvalidImage);
            }
            saw_end = true;
        }
        cursor = data_end + 4;
    }
    let (width, height) = dimensions.ok_or(MediaStoreError::InvalidImage)?;
    if !saw_data || !saw_end {
        return Err(MediaStoreError::InvalidImage);
    }
    Ok(ImageInfo {
        mime_type: "image/png",
        width,
        height,
    })
}

fn inspect_jpeg(bytes: &[u8]) -> StoreResult<ImageInfo> {
    if bytes.len() < 12 || !bytes.ends_with(&[0xff, 0xd9]) {
        return Err(MediaStoreError::InvalidImage);
    }
    let mut cursor = 2usize;
    let mut dimensions = None;
    while cursor + 1 < bytes.len() - 2 {
        if bytes[cursor] != 0xff {
            return Err(MediaStoreError::InvalidImage);
        }
        while cursor < bytes.len() && bytes[cursor] == 0xff {
            cursor += 1;
        }
        let marker = *bytes.get(cursor).ok_or(MediaStoreError::InvalidImage)?;
        cursor += 1;
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if marker == 0x00 || cursor + 2 > bytes.len() {
            return Err(MediaStoreError::InvalidImage);
        }
        let length = be_u16(&bytes[cursor..cursor + 2]) as usize;
        let segment_end = cursor
            .checked_add(length)
            .filter(|end| length >= 2 && *end <= bytes.len())
            .ok_or(MediaStoreError::InvalidImage)?;
        if is_start_of_frame(marker) {
            if length < 8 {
                return Err(MediaStoreError::InvalidImage);
            }
            let height = u32::from(be_u16(&bytes[cursor + 3..cursor + 5]));
            let width = u32::from(be_u16(&bytes[cursor + 5..cursor + 7]));
            dimensions = Some((width, height));
        }
        cursor = segment_end;
    }
    let (width, height) = dimensions.ok_or(MediaStoreError::InvalidImage)?;
    Ok(ImageInfo {
        mime_type: "image/jpeg",
        width,
        height,
    })
}

fn is_start_of_frame(marker: u8) -> bool {
    matches!(
        marker,
        0xc0 | 0xc1 | 0xc2 | 0xc3 | 0xc5 | 0xc6 | 0xc7 | 0xc9 | 0xca | 0xcb | 0xcd | 0xce | 0xcf
    )
}

fn inspect_webp(bytes: &[u8]) -> StoreResult<ImageInfo> {
    if bytes.len() < 30 || little_u32(&bytes[4..8]) as usize + 8 != bytes.len() {
        return Err(MediaStoreError::InvalidImage);
    }
    let mut cursor = 12usize;
    let mut dimensions = None;
    while cursor < bytes.len() {
        if cursor + 8 > bytes.len() {
            return Err(MediaStoreError::InvalidImage);
        }
        let chunk_type = &bytes[cursor..cursor + 4];
        let length = little_u32(&bytes[cursor + 4..cursor + 8]) as usize;
        let data_start = cursor + 8;
        let data_end = data_start
            .checked_add(length)
            .filter(|end| *end <= bytes.len())
            .ok_or(MediaStoreError::InvalidImage)?;
        let found = if chunk_type == b"VP8X" && length >= 10 {
            Some((
                little_u24(&bytes[data_start + 4..data_start + 7]) + 1,
                little_u24(&bytes[data_start + 7..data_start + 10]) + 1,
            ))
        } else if chunk_type == b"VP8 " && length >= 10 {
            if &bytes[data_start + 3..data_start + 6] != b"\x9d\x01\x2a" {
                return Err(MediaStoreError::InvalidImage);
            }
            Some((
                u32::from(little_u16(&bytes[data_start + 6..data_start + 8]) & 0x3fff),
                u32::from(little_u16(&bytes[data_start + 8..data_start + 10]) & 0x3fff),
            ))
        } else if chunk_type == b"VP8L" && length >= 5 {
            if bytes[data_start] != 0x2f {
                return Err(MediaStoreError::InvalidImage);
            }
            let bits = little_u32(&bytes[data_start + 1..data_start + 5]);
            Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
        } else {
            None
        };
        if let Some(found) = found {
            if dimensions.replace(found).is_some() {
                return Err(MediaStoreError::InvalidImage);
            }
        }
        cursor = data_end + (length & 1);
    }
    if cursor != bytes.len() {
        return Err(MediaStoreError::InvalidImage);
    }
    let (width, height) = dimensions.ok_or(MediaStoreError::InvalidImage)?;
    Ok(ImageInfo {
        mime_type: "image/webp",
        width,
        height,
    })
}

#[derive(Default)]
struct AvifInspection {
    saw_ftyp: bool,
    is_avif: bool,
    dimensions: Option<(u32, u32)>,
}

fn looks_like_avif(bytes: &[u8]) -> bool {
    if bytes.len() < 20 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    bytes[8..]
        .chunks_exact(4)
        .take(16)
        .any(|brand| brand == b"avif" || brand == b"avis")
}

fn inspect_avif(bytes: &[u8]) -> StoreResult<ImageInfo> {
    let mut inspection = AvifInspection::default();
    inspect_iso_boxes(bytes, 0, bytes.len(), 0, &mut inspection)?;
    if !inspection.saw_ftyp || !inspection.is_avif {
        return Err(MediaStoreError::InvalidImage);
    }
    let (width, height) = inspection.dimensions.ok_or(MediaStoreError::InvalidImage)?;
    Ok(ImageInfo {
        mime_type: "image/avif",
        width,
        height,
    })
}

fn inspect_iso_boxes(
    bytes: &[u8],
    start: usize,
    end: usize,
    depth: usize,
    inspection: &mut AvifInspection,
) -> StoreResult<()> {
    if depth > 8 || start > end || end > bytes.len() {
        return Err(MediaStoreError::InvalidImage);
    }
    let mut cursor = start;
    while cursor < end {
        if end - cursor < 8 {
            return Err(MediaStoreError::InvalidImage);
        }
        let size32 = be_u32(&bytes[cursor..cursor + 4]);
        let box_type = &bytes[cursor + 4..cursor + 8];
        let (header, size) = if size32 == 1 {
            if end - cursor < 16 {
                return Err(MediaStoreError::InvalidImage);
            }
            let extended = be_u64(&bytes[cursor + 8..cursor + 16]);
            (
                16usize,
                usize::try_from(extended).map_err(|_| MediaStoreError::InvalidImage)?,
            )
        } else if size32 == 0 {
            (8usize, end - cursor)
        } else {
            (8usize, size32 as usize)
        };
        if size < header || cursor + size > end {
            return Err(MediaStoreError::InvalidImage);
        }
        let data_start = cursor + header;
        let box_end = cursor + size;
        if box_type == b"ftyp" {
            inspection.saw_ftyp = true;
            if box_end - data_start < 8 || !(box_end - data_start).is_multiple_of(4) {
                return Err(MediaStoreError::InvalidImage);
            }
            inspection.is_avif |= bytes[data_start..box_end]
                .chunks_exact(4)
                .enumerate()
                .filter(|(index, _)| *index != 1)
                .any(|(_, brand)| brand == b"avif" || brand == b"avis");
        } else if box_type == b"ispe" {
            if box_end - data_start < 12 || bytes[data_start] != 0 {
                return Err(MediaStoreError::InvalidImage);
            }
            let dimensions = (
                be_u32(&bytes[data_start + 4..data_start + 8]),
                be_u32(&bytes[data_start + 8..data_start + 12]),
            );
            if inspection.dimensions.replace(dimensions).is_some() {
                return Err(MediaStoreError::InvalidImage);
            }
        } else if matches!(box_type, b"meta" | b"iprp" | b"ipco") {
            let child_start = data_start + usize::from(box_type == b"meta") * 4;
            if child_start > box_end {
                return Err(MediaStoreError::InvalidImage);
            }
            inspect_iso_boxes(bytes, child_start, box_end, depth + 1, inspection)?;
        }
        cursor = box_end;
    }
    Ok(())
}

fn sha256_hex(input: &[u8]) -> String {
    const INITIAL: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let bit_length = (input.len() as u64) * 8;
    let mut padded = input.to_vec();
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_length.to_be_bytes());

    let mut hash = INITIAL;
    for chunk in padded.chunks_exact(64) {
        let mut words = [0u32; 64];
        for (index, word) in words.iter_mut().take(16).enumerate() {
            *word = be_u32(&chunk[index * 4..index * 4 + 4]);
        }
        for index in 16..64 {
            let s0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let s1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(s0)
                .wrapping_add(words[index - 7])
                .wrapping_add(s1);
        }
        let mut work = hash;
        for index in 0..64 {
            let sigma1 =
                work[4].rotate_right(6) ^ work[4].rotate_right(11) ^ work[4].rotate_right(25);
            let choice = (work[4] & work[5]) ^ (!work[4] & work[6]);
            let temp1 = work[7]
                .wrapping_add(sigma1)
                .wrapping_add(choice)
                .wrapping_add(K[index])
                .wrapping_add(words[index]);
            let sigma0 =
                work[0].rotate_right(2) ^ work[0].rotate_right(13) ^ work[0].rotate_right(22);
            let majority = (work[0] & work[1]) ^ (work[0] & work[2]) ^ (work[1] & work[2]);
            let temp2 = sigma0.wrapping_add(majority);
            work = [
                temp1.wrapping_add(temp2),
                work[0],
                work[1],
                work[2],
                work[3].wrapping_add(temp1),
                work[4],
                work[5],
                work[6],
            ];
        }
        for (value, addition) in hash.iter_mut().zip(work) {
            *value = value.wrapping_add(addition);
        }
    }
    hash.iter().map(|value| format!("{value:08x}")).collect()
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb8_8320 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    !crc
}

fn be_u16(bytes: &[u8]) -> u16 {
    u16::from_be_bytes([bytes[0], bytes[1]])
}

fn little_u16(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn be_u32(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn little_u32(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn be_u64(bytes: &[u8]) -> u64 {
    u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ])
}

fn little_u24(bytes: &[u8]) -> u32 {
    u32::from(bytes[0]) | (u32::from(bytes[1]) << 8) | (u32::from(bytes[2]) << 16)
}

fn command_error(error: MediaStoreError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn stage_image(
    store: tauri::State<'_, MediaStore>,
    request: StageImageRequest,
) -> Result<StagedImage, String> {
    store.stage(request).map_err(command_error)
}

#[tauri::command]
pub fn list_staged_images(
    store: tauri::State<'_, MediaStore>,
    request: DraftMediaRequest,
) -> Result<Vec<StagedImage>, String> {
    store.list(&request.draft_id).map_err(command_error)
}

#[tauri::command]
pub fn save_image_metadata(
    store: tauri::State<'_, MediaStore>,
    request: SaveImageMetadataRequest,
) -> Result<StagedImage, String> {
    store.save_metadata(request).map_err(command_error)
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

#[cfg(test)]
mod tests {
    use super::{
        crc32, inspect_image, sha256_hex, MediaMetadataDraft, MediaPurpose, MediaStore,
        MediaStoreError, SaveImageMetadataRequest, StageImageRequest,
    };
    use std::fs;
    use tempfile::tempdir;

    const DRAFT_ID: &str = "11111111-1111-4111-8111-111111111111";

    fn png_chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut chunk = Vec::new();
        chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
        chunk.extend_from_slice(kind);
        chunk.extend_from_slice(data);
        chunk.extend_from_slice(&crc32(&[kind.as_slice(), data].concat()).to_be_bytes());
        chunk
    }

    fn tiny_png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut header = Vec::new();
        header.extend_from_slice(&width.to_be_bytes());
        header.extend_from_slice(&height.to_be_bytes());
        header.extend_from_slice(&[8, 6, 0, 0, 0]);
        bytes.extend(png_chunk(b"IHDR", &header));
        bytes.extend(png_chunk(b"IDAT", &[0x78, 0x01, 0x00]));
        bytes.extend(png_chunk(b"IEND", &[]));
        bytes
    }

    fn request(name: &str, bytes: Vec<u8>) -> StageImageRequest {
        StageImageRequest {
            draft_id: DRAFT_ID.to_owned(),
            original_name: name.to_owned(),
            purpose: MediaPurpose::Cover,
            bytes,
        }
    }

    #[test]
    fn stages_signature_checked_image_with_uuid_target_and_metadata() {
        let temporary = tempdir().expect("temporary directory");
        let store = MediaStore::new(temporary.path().join("media-staging").join("v1"));
        let bytes = tiny_png(640, 480);

        let staged = store
            .stage(request("fictional-cover.PNG", bytes.clone()))
            .expect("stages image");
        assert_eq!(staged.mime_type, "image/png");
        assert_eq!((staged.width, staged.height), (640, 480));
        assert_eq!(staged.bytes, bytes.len() as u64);
        assert_eq!(staged.sha256, sha256_hex(&bytes));
        assert!(staged.target_path.starts_with("public/images/uploads/"));
        assert!(staged.target_path.ends_with(&format!("/{}.png", staged.id)));
        assert_eq!(staged.metadata, MediaMetadataDraft::default());

        let listed = store.list(DRAFT_ID).expect("lists image");
        assert_eq!(listed, vec![staged.clone()]);
        let draft_root = temporary
            .path()
            .join("media-staging")
            .join("v1")
            .join(DRAFT_ID);
        assert!(draft_root.join(&staged.staged_name).is_file());
        assert!(draft_root.join(format!("{}.json", staged.id)).is_file());
    }

    #[test]
    fn rejects_extension_masquerades_traversal_and_unsafe_dimensions() {
        let temporary = tempdir().expect("temporary directory");
        let store = MediaStore::new(temporary.path().join("media-staging").join("v1"));

        assert!(matches!(
            store.stage(request("renamed.jpg", tiny_png(1, 1))),
            Err(MediaStoreError::SignatureMismatch)
        ));
        for name in ["../image.png", "..\\image.png", "C:image.png", "con.png"] {
            assert!(matches!(
                store.stage(request(name, tiny_png(1, 1))),
                Err(MediaStoreError::InvalidFileName)
            ));
        }
        assert!(matches!(
            inspect_image(&tiny_png(20_000, 1)),
            Err(MediaStoreError::InvalidImage)
        ));
        assert!(matches!(
            inspect_image(&tiny_png(1, 1)[..20]),
            Err(MediaStoreError::InvalidImage)
        ));
        assert!(!temporary.path().join("outside.png").exists());
    }

    #[test]
    fn persists_incomplete_rights_metadata_without_marking_it_public() {
        let temporary = tempdir().expect("temporary directory");
        let store = MediaStore::new(temporary.path().join("media-staging").join("v1"));
        let staged = store
            .stage(request("fictional.png", tiny_png(2, 3)))
            .expect("stages image");
        let mut metadata = staged.metadata;
        metadata.creator_or_provider = "Fictional provider".to_owned();
        metadata.alt_zh = "虚构图片".to_owned();
        let saved = store
            .save_metadata(SaveImageMetadataRequest {
                draft_id: DRAFT_ID.to_owned(),
                image_id: staged.id,
                metadata: metadata.clone(),
            })
            .expect("saves draft metadata");

        assert_eq!(saved.metadata, metadata);
        assert_eq!(saved.metadata.rights_status, "pending");
        assert_eq!(saved.metadata.usage_scope, "internal-only");
    }

    #[test]
    fn sha256_matches_the_standard_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn rejects_reparse_like_manifest_substitution() {
        let temporary = tempdir().expect("temporary directory");
        let root = temporary.path().join("media-staging").join("v1");
        let store = MediaStore::new(root.clone());
        let staged = store
            .stage(request("fictional.png", tiny_png(1, 1)))
            .expect("stages image");
        let manifest = root.join(DRAFT_ID).join(format!("{}.json", staged.id));
        fs::write(&manifest, b"{\"formatVersion\":1}").expect("damages manifest");
        assert!(store.list(DRAFT_ID).is_err());
    }
}
