import { invoke } from "@tauri-apps/api/core";

export type Draft = {
  formatVersion: number;
  draftId: string;
  contentType: string;
  stableId: string;
  titleZh: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveDraftInput = Pick<
  Draft,
  "draftId" | "contentType" | "stableId" | "titleZh"
>;

export type DraftApi = {
  createDraft: () => Promise<Draft>;
  listDrafts: () => Promise<Draft[]>;
  openDraft: (draftId: string) => Promise<Draft>;
  saveDraft: (draft: SaveDraftInput) => Promise<Draft>;
  deleteDraft: (draftId: string) => Promise<void>;
};

export const tauriDraftApi: DraftApi = {
  createDraft: () => invoke<Draft>("create_draft"),
  listDrafts: () => invoke<Draft[]>("list_drafts"),
  openDraft: (draftId) =>
    invoke<Draft>("open_draft", { request: { draftId } }),
  saveDraft: (draft) => invoke<Draft>("save_draft", { draft }),
  deleteDraft: (draftId) =>
    invoke<void>("delete_draft", { request: { draftId } }),
};
