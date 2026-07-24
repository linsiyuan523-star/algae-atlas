import { invoke } from "@tauri-apps/api/core";
import { inspectRecordDraft, validateDraftFields } from "./schema-drafts";
import type {
  DraftFields,
  DraftRecordInspection,
  RecordDraft,
} from "./schema-drafts";

export const DRAFT_FORMAT_VERSION = 4;

export type Draft = {
  formatVersion: number;
  draftId: string;
  recordDraft: unknown;
  bodyZh: string;
  bodyEn: string;
  parkedEnglishLocale?: unknown;
  createdAt: string;
  updatedAt: string;
  legacyFields?: DraftFields;
};

export type CreateDraftInput = {
  recordDraft: RecordDraft;
  bodyZh: string;
  bodyEn: string;
  parkedEnglishLocale?: unknown;
};

export type SaveDraftInput = CreateDraftInput & {
  draftId: string;
};

export type DraftApi = {
  createDraft: (draft: CreateDraftInput) => Promise<Draft>;
  listDrafts: () => Promise<Draft[]>;
  openDraft: (draftId: string) => Promise<Draft>;
  saveDraft: (draft: SaveDraftInput) => Promise<Draft>;
  deleteDraft: (draftId: string) => Promise<void>;
  takeRecoveryDraft: () => Promise<Draft | null>;
};

export const tauriDraftApi: DraftApi = {
  createDraft: async (draft) =>
    normalizeStoredDraft(await invoke<unknown>("create_draft", { draft })),
  listDrafts: async () =>
    (await invoke<unknown[]>("list_drafts")).map(normalizeStoredDraft),
  openDraft: async (draftId) =>
    normalizeStoredDraft(
      await invoke<unknown>("open_draft", { request: { draftId } }),
    ),
  saveDraft: async (draft) =>
    normalizeStoredDraft(await invoke<unknown>("save_draft", { draft })),
  deleteDraft: (draftId) =>
    invoke<void>("delete_draft", { request: { draftId } }),
  takeRecoveryDraft: async () => {
    const stored = await invoke<unknown | null>("take_recovery_draft");
    return stored === null ? null : normalizeStoredDraft(stored);
  },
};

export const unavailableDraftApi: DraftApi = {
  createDraft: async () => {
    throw new Error("草稿创建仅在桌面应用中可用。");
  },
  listDrafts: async () => [],
  openDraft: async () => {
    throw new Error("草稿读取仅在桌面应用中可用。");
  },
  saveDraft: async () => {
    throw new Error("草稿保存仅在桌面应用中可用。");
  },
  deleteDraft: async () => {
    throw new Error("草稿删除仅在桌面应用中可用。");
  },
  takeRecoveryDraft: async () => null,
};

export function normalizeStoredDraft(input: unknown): Draft {
  const stored = asRecord(input);
  if (
    !stored ||
    typeof stored.formatVersion !== "number" ||
    typeof stored.draftId !== "string" ||
    typeof stored.createdAt !== "string" ||
    typeof stored.updatedAt !== "string"
  ) {
    throw new Error("草稿存储格式无效。");
  }

  if (
    stored.formatVersion === DRAFT_FORMAT_VERSION &&
    "recordDraft" in stored &&
    typeof stored.bodyZh === "string" &&
    typeof stored.bodyEn === "string"
  ) {
    return {
      formatVersion: stored.formatVersion,
      draftId: stored.draftId,
      recordDraft: stored.recordDraft,
      bodyZh: stored.bodyZh,
      bodyEn: stored.bodyEn,
      ...(stored.parkedEnglishLocale !== undefined
        ? { parkedEnglishLocale: stored.parkedEnglishLocale }
        : {}),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  if (
    stored.formatVersion === 3 &&
    "recordDraft" in stored &&
    typeof stored.bodyZh === "string"
  ) {
    return {
      formatVersion: stored.formatVersion,
      draftId: stored.draftId,
      recordDraft: stored.recordDraft,
      bodyZh: stored.bodyZh,
      bodyEn: "",
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  if (stored.formatVersion === 2 && "recordDraft" in stored) {
    return {
      formatVersion: stored.formatVersion,
      draftId: stored.draftId,
      recordDraft: stored.recordDraft,
      bodyZh: "",
      bodyEn: "",
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  if (
    stored.formatVersion === 1 &&
    typeof stored.contentType === "string" &&
    typeof stored.stableId === "string" &&
    typeof stored.titleZh === "string"
  ) {
    return {
      formatVersion: stored.formatVersion,
      draftId: stored.draftId,
      recordDraft: null,
      bodyZh: "",
      bodyEn: "",
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      legacyFields: {
        contentType: stored.contentType,
        stableId: stored.stableId,
        titleZh: stored.titleZh,
      },
    };
  }

  throw new Error("草稿格式版本不受支持。");
}

export function inspectDraft(draft: Draft): DraftRecordInspection {
  if (draft.legacyFields) {
    return {
      fields: draft.legacyFields,
      errors: validateDraftFields(draft.legacyFields),
    };
  }
  return inspectRecordDraft(draft.recordDraft);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
