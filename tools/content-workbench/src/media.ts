import { invoke } from "@tauri-apps/api/core";
import { parseMedia } from "@algae-atlas/content-schema";
import type { Locale } from "@algae-atlas/content-schema";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type MediaPurpose = "cover" | "body" | "gallery" | "portrait";

export type ImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif";

export type ImageProcessingOptions = {
  maxWidth: number;
  maxHeight: number;
  maxOutputBytes: number;
  preserveOriginal: boolean;
};

export const DEFAULT_IMAGE_PROCESSING_OPTIONS: ImageProcessingOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  maxOutputBytes: 2 * 1024 * 1024,
  preserveOriginal: false,
};

export type ImageDerivative = {
  stagedName: string;
  targetPath: string;
  mimeType: "image/webp";
  bytes: number;
  width: number;
  height: number;
  sha256: string;
};

export type ImageProcessingResult = {
  sourceSha256: string;
  sourceMimeType: ImageMimeType;
  sourceBytes: number;
  privacyMetadataRemoved: boolean;
  originalRetained: boolean;
  originalStagedName?: string;
  thumbnail?: ImageDerivative;
};

export type ImageMetadataDraft = {
  creatorOrProvider: string;
  sourceUrl: string;
  licenseIdentifier: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  usageScope: "public-site" | "education-only" | "internal-only";
  rightsStatus: "approved" | "pending" | "restricted";
  identificationStatus:
    | "not-applicable"
    | "unverified"
    | "provisional"
    | "verified";
  identifiablePeople: boolean;
  consentState: "not-applicable" | "confirmed" | "pending";
  consentReference: string;
  altZh: string;
  altEn: string;
  captionZh: string;
  captionEn: string;
};

export type StagedImage = {
  formatVersion: number;
  draftId: string;
  id: string;
  originalName: string;
  stagedName: string;
  targetPath: string;
  mimeType: ImageMimeType;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  uploadedAt: string;
  purpose: MediaPurpose;
  metadata: ImageMetadataDraft;
  processing?: ImageProcessingResult;
};

export type StageImageInput = {
  draftId: string;
  originalName: string;
  purpose: MediaPurpose;
  bytes: number[];
  processing: ImageProcessingOptions;
};

export type MediaApi = {
  stageImage: (input: StageImageInput) => Promise<StagedImage>;
  listImages: (draftId: string) => Promise<StagedImage[]>;
  saveMetadata: (
    draftId: string,
    imageId: string,
    metadata: ImageMetadataDraft,
  ) => Promise<StagedImage>;
};

export const tauriMediaApi: MediaApi = {
  stageImage: (request) => invoke<StagedImage>("stage_image", { request }),
  listImages: (draftId) =>
    invoke<StagedImage[]>("list_staged_images", { request: { draftId } }),
  saveMetadata: (draftId, imageId, metadata) =>
    invoke<StagedImage>("save_image_metadata", {
      request: { draftId, imageId, metadata },
    }),
};

export const unavailableMediaApi: MediaApi = {
  stageImage: async () => {
    throw new Error("图片接收仅在桌面应用中可用。");
  },
  listImages: async () => [],
  saveMetadata: async () => {
    throw new Error("图片元数据仅在桌面应用中可保存。");
  },
};

export const mediaPurposeOptions: readonly {
  value: MediaPurpose;
  label: string;
}[] = [
  { value: "cover", label: "封面图" },
  { value: "body", label: "正文图" },
  { value: "gallery", label: "图集" },
  { value: "portrait", label: "成员照片" },
];

export const licenseOptions = [
  { value: "", label: "请选择许可" },
  { value: "cc0-1.0", label: "CC0 1.0" },
  { value: "cc-by-4.0", label: "CC BY 4.0" },
  { value: "cc-by-sa-4.0", label: "CC BY-SA 4.0" },
  { value: "public-domain", label: "公共领域" },
  { value: "team-owned", label: "团队自有" },
  { value: "permission-granted", label: "已获得许可" },
  { value: "other", label: "其他" },
] as const;

export async function stageSelectedFile(
  api: MediaApi,
  draftId: string,
  purpose: MediaPurpose,
  file: File,
  processing: ImageProcessingOptions = DEFAULT_IMAGE_PROCESSING_OPTIONS,
): Promise<StagedImage> {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片必须大于 0 字节且不超过 20 MiB。");
  }
  const bytes = new Uint8Array(await readFileBuffer(file));
  return api.stageImage({
    draftId,
    originalName: file.name,
    purpose,
    bytes: Array.from(bytes),
    processing,
  });
}

export function imagePublicationIssues(
  image: StagedImage,
  locale: Locale,
): string[] {
  const metadata = image.metadata;
  const issues: string[] = [];
  if (!metadata.creatorOrProvider.trim()) {
    issues.push("必须填写图片作者或提供者。");
  }
  if (
    !metadata.licenseIdentifier ||
    !metadata.licenseName.trim() ||
    !metadata.attribution.trim()
  ) {
    issues.push("图片许可、许可名称和署名必须完整。");
  }
  if (
    metadata.rightsStatus !== "approved" ||
    metadata.usageScope !== "public-site"
  ) {
    issues.push("图片权利状态和使用范围尚不允许公开发布。");
  }
  if (!metadata.altZh.trim()) {
    issues.push("必须填写中文替代文字。");
  }
  if (locale === "en" && !metadata.altEn.trim()) {
    issues.push("英文发布候选必须填写英文替代文字。");
  }
  if (
    metadata.identifiablePeople &&
    (metadata.consentState !== "confirmed" ||
      !metadata.consentReference.trim())
  ) {
    issues.push("可识别人物照片必须确认同意并填写非敏感授权引用。");
  }

  const parsed = parseMedia(createMediaRecordCandidate(image));
  if (!parsed.success) {
    issues.push(...parsed.issues.map((issue) => issue.message));
  }
  return [...new Set(issues)];
}

export function allImagesPublicationIssues(
  images: readonly StagedImage[],
  locale: Locale,
): string[] {
  return images.flatMap((image) =>
    imagePublicationIssues(image, locale).map(
      (issue) => `${image.originalName}：${issue}`,
    ),
  );
}

export function attachImageReference(
  recordDraft: unknown,
  image: StagedImage,
): Record<string, unknown> {
  const candidate = structuredClone(asRecord(recordDraft) ?? {});
  const currentMedia = Array.isArray(candidate.media)
    ? candidate.media.filter((value): value is string => typeof value === "string")
    : [];
  candidate.media = [...new Set([...currentMedia, image.id])];
  const shared = ensureRecord(candidate, "shared");
  const contentType = typeof candidate.type === "string" ? candidate.type : "";

  if (image.purpose === "portrait" && contentType === "team-member") {
    shared.portraitMediaId = image.id;
  } else if (image.purpose === "cover") {
    if (contentType === "team-news" || contentType === "science-article") {
      shared.coverMediaId = image.id;
    } else if (
      contentType === "algae-profile" ||
      contentType === "live-feed-profile"
    ) {
      shared.primaryMediaId = image.id;
    }
  } else if (image.purpose === "gallery") {
    const field = galleryFieldFor(contentType);
    if (field) {
      const values = Array.isArray(shared[field])
        ? shared[field].filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      shared[field] = [...new Set([...values, image.id])];
    }
  }
  return candidate;
}

export function recordMediaIds(recordDraft: unknown): string[] {
  const record = asRecord(recordDraft);
  return Array.isArray(record?.media)
    ? record.media.filter((value): value is string => typeof value === "string")
    : [];
}

export function appendBodyImage(markdown: string, image: StagedImage): string {
  const alt = image.metadata.altZh
    .replace(/[\[\]\r\n]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!alt) {
    return markdown;
  }
  const prefix = markdown.trimEnd();
  return `${prefix}${prefix ? "\n\n" : ""}![${alt}](media:${image.id})\n`;
}

export function createMediaRecordCandidate(image: StagedImage): unknown {
  const metadata = image.metadata;
  const alt = {
    zh: metadata.altZh.trim(),
    ...(metadata.altEn.trim() ? { en: metadata.altEn.trim() } : {}),
  };
  const caption =
    metadata.captionZh.trim() || metadata.captionEn.trim()
      ? {
          zh: metadata.captionZh.trim(),
          ...(metadata.captionEn.trim()
            ? { en: metadata.captionEn.trim() }
            : {}),
        }
      : undefined;
  return {
    schemaVersion: 1,
    id: image.id,
    filePath: image.targetPath,
    sha256: image.sha256,
    mimeType: image.mimeType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    uploadedAt: image.uploadedAt,
    creatorOrProvider: metadata.creatorOrProvider.trim(),
    ...(metadata.sourceUrl.trim()
      ? { sourceUrl: metadata.sourceUrl.trim() }
      : {}),
    license: {
      identifier: metadata.licenseIdentifier,
      name: metadata.licenseName.trim(),
      ...(metadata.licenseUrl.trim()
        ? { href: metadata.licenseUrl.trim() }
        : {}),
      attribution: metadata.attribution.trim(),
      usageScope: metadata.usageScope,
    },
    rightsStatus: metadata.rightsStatus,
    identificationStatus: metadata.identificationStatus,
    identifiablePeople: metadata.identifiablePeople,
    consentState: metadata.consentState,
    ...(metadata.consentReference.trim()
      ? { consentReference: metadata.consentReference.trim() }
      : {}),
    alt,
    ...(caption ? { caption } : {}),
    relatedContentIds: [],
    legacy: false,
  };
}

function galleryFieldFor(contentType: string): string | null {
  if (
    contentType === "team-news" ||
    contentType === "algae-profile" ||
    contentType === "live-feed-profile"
  ) {
    return "galleryMediaIds";
  }
  if (contentType === "learning-resource") {
    return "attachmentMediaIds";
  }
  if (
    contentType === "research-project" ||
    contentType === "coastal-observation" ||
    contentType === "collaboration" ||
    contentType === "research-profile"
  ) {
    return "mediaIds";
  }
  return null;
}

function ensureRecord(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const existing = asRecord(target[key]);
  if (existing) {
    return existing;
  }
  const created: Record<string, unknown> = {};
  target[key] = created;
  return created;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("无法读取所选图片。"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsArrayBuffer(file);
  });
}
