import {
  ArrowLeftRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudUpload,
  Copy,
  Eye,
  ExternalLink,
  FilePlus2,
  Files,
  LoaderCircle,
  PenLine,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DEFAULT_APPLICATION_MODE,
  SINGLE_USER_DIRECT_OPERATOR_ID,
  applicationModeFeatures,
  normalizeDirectPublishWorkflow,
} from "../application-mode";
import type { ApplicationMode } from "../application-mode";
import { inspectDraft } from "../drafts";
import type { Draft, DraftApi } from "../drafts";
import { getContentFormAdapter } from "../forms/content-forms";
import { getEnglishContentFormAdapter } from "../forms/english-locale";
import { sameFormValues } from "../forms/form-engine";
import type {
  FormErrors,
  FormSchemaDefinition,
  FormValue,
  FormValues,
} from "../forms/form-engine";
import {
  contentTypeLabel,
  contentTypeOptions,
  createSharedRecordDraft,
  SHARED_SCHEMA_VERSION,
  updateLocaleBodyReference,
  updateSharedRecordDraft,
} from "../schema-drafts";
import type {
  DraftFieldErrors,
  DraftFields,
} from "../schema-drafts";
import {
  copyChineseArticleStructure,
  extractArticleMediaText,
  prepareArticleMarkdown,
  updateArticleMediaAltText,
} from "../editor/article-markdown";
import {
  applyLocaleWorkflow,
  createEnglishWorkflow,
  inspectLocaleWorkflow,
  markLocaleContentEdited,
  parkEnglishLocale,
  requestLocaleState,
  restoreEnglishLocale,
  setEnglishLocaleMissing,
  validateLocaleWorkflow,
} from "../locale-workflow";
import type {
  LocaleWorkflowErrors,
  LocaleWorkflowInput,
} from "../locale-workflow";
import {
  allImagesPublicationIssues,
  appendBodyImage,
  attachImageReference,
  recordMediaIds,
  unavailableMediaApi,
} from "../media";
import type { MediaApi, StagedImage } from "../media";
import {
  PUBLISH_STAGE_LABELS,
  PUBLISH_STAGE_ORDER,
  createPublishTransactionId,
  isQueuePublishTransaction,
} from "../server";
import type {
  PendingStatusData,
  PublishStage,
  QueueUploadStatus,
  ServerProtocolMode,
  ServerPublishProgress,
  ServerQueuePublishState,
  ServerPublishTransaction,
} from "../server";
import { ArticleEditor } from "./ArticleEditor";
import { ContentPreview } from "./ContentPreview";
import type { DetailPreviewMedia, DetailPreviewValue } from "./DetailPreview";
import { ImageIntake } from "./ImageIntake";
import { LocaleWorkflowFields } from "./LocaleWorkflowFields";
import { SchemaForm } from "./SchemaForm";

type NewDraftPageProps = {
  api: DraftApi;
  onCreated: (draft: Draft) => void;
};

export const AUTOSAVE_DELAY_MS = 700;

export function NewDraftPage({ api, onCreated }: NewDraftPageProps) {
  const [fields, setFields] = useState<DraftFields>({
    contentType: contentTypeOptions[0].value,
    stableId: "",
    titleZh: "",
  });
  const [fieldErrors, setFieldErrors] = useState<DraftFieldErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof DraftFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = createSharedRecordDraft(fields, new Date().toISOString());
    if (!prepared.success) {
      setFieldErrors(prepared.errors);
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      onCreated(
        await api.createDraft({
          recordDraft: prepared.recordDraft,
          bodyZh: "",
          bodyEn: "",
        }),
      );
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form className="new-draft-action" onSubmit={(event) => void handleCreate(event)}>
      <FilePlus2 aria-hidden="true" size={30} strokeWidth={1.6} />
      <div className="new-draft-fields">
        <div className="field-group">
          <label htmlFor="new-content-type">内容类型</label>
          <select
            id="new-content-type"
            value={fields.contentType}
            aria-invalid={Boolean(fieldErrors.contentType)}
            aria-describedby={fieldErrors.contentType ? "new-content-type-error" : undefined}
            onChange={(event) => updateField("contentType", event.target.value)}
          >
            {contentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.labelZh} / {option.labelEn}
              </option>
            ))}
          </select>
          <FieldError id="new-content-type-error" message={fieldErrors.contentType} />
        </div>
        <div className="field-group">
          <label htmlFor="new-stable-id">稳定 ID</label>
          <input
            id="new-stable-id"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={fields.stableId}
            aria-invalid={Boolean(fieldErrors.stableId)}
            aria-describedby={fieldErrors.stableId ? "new-stable-id-error" : undefined}
            onChange={(event) => updateField("stableId", event.target.value)}
          />
          <FieldError id="new-stable-id-error" message={fieldErrors.stableId} />
        </div>
        <div className="field-group">
          <label htmlFor="new-title-zh">中文标题</label>
          <input
            id="new-title-zh"
            type="text"
            maxLength={500}
            value={fields.titleZh}
            aria-invalid={Boolean(fieldErrors.titleZh)}
            aria-describedby={fieldErrors.titleZh ? "new-title-zh-error" : undefined}
            onChange={(event) => updateField("titleZh", event.target.value)}
          />
          <FieldError id="new-title-zh-error" message={fieldErrors.titleZh} />
        </div>
      </div>
      <button
        className="primary-button"
        type="submit"
        disabled={isCreating}
      >
        <FilePlus2 aria-hidden="true" size={18} />
        {isCreating ? "正在新建..." : "新建草稿"}
      </button>
      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export type DirectPublishProgressStage = PublishStage;

export type DirectPublishSnapshot = {
  draft: Draft;
  stagedImages: StagedImage[];
};

export type DirectPublishResult = {
  message: string;
  protocolMode?: "legacy" | "queue";
  queueStatus?: QueueUploadStatus;
  url?: string;
  releaseSha?: string;
  publishedAt?: string;
  transactionId?: string;
  contentSha?: string;
  sourceSha?: string;
  siteSha?: string;
  releaseId?: string;
  totalDurationMs?: number;
  stageDurationsMs?: Partial<Record<PublishStage, number>>;
  bundleUploadDurationMs?: number;
  bundleGenerationDurationMs?: number;
  sha256DurationMs?: number;
  serverValidationDurationMs?: number;
  pendingContentSha?: string;
  nextScheduledSyncAt?: string;
  pendingUploadCount?: number;
  syncTransactionId?: string;
  coalescedIntoCommit?: string;
  retryable?: boolean;
  errorCode?: string;
  failedStage?: string;
  technicalSummary?: string;
  localDraftUpdatedAt?: string;
};

export type DirectServerContent = {
  stableId: string;
  contentType: string;
  titleZh?: string;
  urlZh?: string;
};

export type DirectPublishServerState =
  | "unchecked"
  | "checking"
  | "available"
  | "unavailable";

export type DirectPublishOptions = {
  operatorId: string;
  transactionId: string;
  resume?: boolean;
  onProgress?: (progress: ServerPublishProgress) => void;
};

type DraftsPageProps = {
  api: DraftApi;
  mediaApi?: MediaApi;
  initialDraft?: Draft | null;
  applicationMode?: ApplicationMode;
  onExportDraft?: (draftId: string) => void;
  onPublishToServer?: (
    snapshot: DirectPublishSnapshot,
    options: DirectPublishOptions,
  ) => Promise<DirectPublishResult | void> | DirectPublishResult | void;
  serverConnectionState?: DirectPublishServerState;
  serverConnectionError?: string | null;
  serverContentItems?: readonly DirectServerContent[];
  onViewServerContent?: (item: DirectServerContent) => void;
  onDeleteServerContent?: (
    item: DirectServerContent,
  ) => DirectPublishResult | void | Promise<DirectPublishResult | void>;
  onOpenPublishedUrl?: (url: string) => void | Promise<void>;
  onQueryPublishStatus?: (
    transactionId: string,
    onFailure?: (progress: ServerPublishProgress) => void,
  ) => Promise<ServerPublishTransaction | null>;
  serverProtocolMode?: ServerProtocolMode;
  serverQueueModeActive?: boolean;
  pendingStatus?: PendingStatusData | null;
  publishRefreshToken?: number;
};

export function DraftsPage({
  api,
  mediaApi = unavailableMediaApi,
  initialDraft = null,
  applicationMode = DEFAULT_APPLICATION_MODE,
  onExportDraft,
  onPublishToServer,
  serverConnectionState = "available",
  serverConnectionError = null,
  serverContentItems = [],
  onViewServerContent,
  onDeleteServerContent,
  onOpenPublishedUrl,
  onQueryPublishStatus,
  serverProtocolMode,
  serverQueueModeActive = false,
  pendingStatus = null,
  publishRefreshToken = 0,
}: DraftsPageProps) {
  const [drafts, setDrafts] = useState<Draft[]>(initialDraft ? [initialDraft] : []);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(initialDraft);
  const [pendingAction, setPendingAction] = useState<string | null>("refresh");
  const [error, setError] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    setPendingAction("refresh");
    setError(null);
    try {
      const loaded = await api.listDrafts();
      setDrafts(loaded);
      setSelectedDraft((current) => {
        if (!current) {
          return null;
        }
        return loaded.find((draft) => draft.draftId === current.draftId) ?? null;
      });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setPendingAction(null);
    }
  }, [api]);

  useEffect(() => {
    let isCurrent = true;

    api
      .listDrafts()
      .then((loaded) => {
        if (!isCurrent) {
          return;
        }
        setDrafts(loaded);
        setSelectedDraft((current) => {
          if (!current) {
            return null;
          }
          return loaded.find((draft) => draft.draftId === current.draftId) ?? null;
        });
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setError(describeError(caught));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setPendingAction(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [api]);

  async function handleOpen(draftId: string) {
    setPendingAction(draftId);
    setError(null);
    try {
      setSelectedDraft(await api.openDraft(draftId));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setPendingAction(null);
    }
  }

  const handleSaved = useCallback((saved: Draft) => {
    setSelectedDraft(saved);
    setDrafts((current) => [
      saved,
      ...current.filter((draft) => draft.draftId !== saved.draftId),
    ]);
  }, []);

  const handleDeleted = useCallback((draftId: string) => {
    setSelectedDraft(null);
    setDrafts((current) => current.filter((draft) => draft.draftId !== draftId));
  }, []);

  const isBusy = pendingAction !== null;

  return (
    <div className="draft-workspace">
      <div className="draft-toolbar">
        <span>本地草稿</span>
        <button
          className="icon-button"
          type="button"
          aria-label="刷新草稿列表"
          title="刷新草稿列表"
          disabled={isBusy}
          onClick={() => void refreshDrafts()}
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </div>

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}

      {pendingAction === "refresh" && drafts.length === 0 ? (
        <p className="loading-state" role="status">
          正在读取草稿...
        </p>
      ) : drafts.length === 0 ? (
        <div className="empty-state" role="status">
          <Files aria-hidden="true" size={28} strokeWidth={1.6} />
          <p>目前没有草稿。</p>
        </div>
      ) : (
        <div className="draft-layout">
          <section className="draft-list-panel" aria-labelledby="draft-list-title">
            <h3 id="draft-list-title">草稿列表</h3>
            <ul>
              {drafts.map((draft) => {
                const { fields, errors } = inspectDraft(draft);
                const title = fields.titleZh.trim() || "未命名草稿";
                const typeLabel = contentTypeLabel(fields.contentType);
                return (
                  <li key={draft.draftId}>
                    <button
                      type="button"
                      aria-label={`打开 ${title}`}
                      aria-pressed={selectedDraft?.draftId === draft.draftId}
                      disabled={isBusy}
                      onClick={() => void handleOpen(draft.draftId)}
                    >
                      <strong>{title}</strong>
                      <span>{typeLabel ?? "内容类型无效"}</span>
                      <span>{fields.stableId.trim() || "尚无稳定 ID"}</span>
                      {Object.keys(errors).length > 0 ? (
                        <span className="draft-row-warning">字段需修正</span>
                      ) : null}
                      <time dateTime={draft.updatedAt}>
                        {formatTimestamp(draft.updatedAt)}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="draft-editor-panel" aria-label="草稿编辑区">
            {selectedDraft ? (
              <DraftEditor
                key={selectedDraft.draftId}
                api={api}
                mediaApi={mediaApi}
                draft={selectedDraft}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                applicationMode={applicationMode}
                onExportDraft={onExportDraft}
                onPublishToServer={onPublishToServer}
                serverConnectionState={serverConnectionState}
                serverConnectionError={serverConnectionError}
                serverContentItems={serverContentItems}
                onViewServerContent={onViewServerContent}
                onDeleteServerContent={onDeleteServerContent}
                onOpenPublishedUrl={onOpenPublishedUrl}
                onQueryPublishStatus={onQueryPublishStatus}
                serverProtocolMode={serverProtocolMode}
                serverQueueModeActive={serverQueueModeActive}
                pendingStatus={pendingStatus}
                publishRefreshToken={publishRefreshToken}
              />
            ) : (
              <div className="editor-empty-state" role="status">
                <Files aria-hidden="true" size={26} strokeWidth={1.6} />
                <p>选择一篇草稿。</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

type DraftEditorProps = {
  api: DraftApi;
  mediaApi: MediaApi;
  draft: Draft;
  onSaved: (draft: Draft) => void;
  onDeleted: (draftId: string) => void;
  applicationMode: ApplicationMode;
  onExportDraft?: (draftId: string) => void;
  onPublishToServer?: (
    snapshot: DirectPublishSnapshot,
    options: DirectPublishOptions,
  ) => Promise<DirectPublishResult | void> | DirectPublishResult | void;
  serverConnectionState: DirectPublishServerState;
  serverConnectionError: string | null;
  serverContentItems: readonly DirectServerContent[];
  onViewServerContent?: (item: DirectServerContent) => void;
  onDeleteServerContent?: (
    item: DirectServerContent,
  ) => DirectPublishResult | void | Promise<DirectPublishResult | void>;
  onOpenPublishedUrl?: (url: string) => void | Promise<void>;
  onQueryPublishStatus?: (
    transactionId: string,
    onFailure?: (progress: ServerPublishProgress) => void,
  ) => Promise<ServerPublishTransaction | null>;
  serverProtocolMode?: ServerProtocolMode;
  serverQueueModeActive: boolean;
  pendingStatus: PendingStatusData | null;
  publishRefreshToken: number;
};

type EditorInput = {
  fields: DraftFields;
  contentForm: FormValues;
  bodyZh: string;
  englishForm: FormValues;
  bodyEn: string;
  zhWorkflow: LocaleWorkflowInput;
  enWorkflow: LocaleWorkflowInput | null;
  mediaIds: string[];
  parkedEnglishLocale?: unknown;
};

function DraftEditor({
  api,
  mediaApi,
  draft,
  onSaved,
  onDeleted,
  applicationMode,
  onExportDraft,
  onPublishToServer,
  serverConnectionState,
  serverConnectionError,
  serverContentItems,
  onViewServerContent,
  onDeleteServerContent,
  onOpenPublishedUrl,
  onQueryPublishStatus,
  serverProtocolMode,
  serverQueueModeActive,
  pendingStatus,
  publishRefreshToken,
}: DraftEditorProps) {
  const initialInspection = inspectDraft(draft);
  const initialFormInspection = getContentFormAdapter(initialInspection.fields.contentType)
    ?.inspect(draft.recordDraft) ?? { values: {}, errors: {} };
  const initialInput = editorInputFromDraft(draft);
  const [editorInput, setEditorInput] = useState<EditorInput>(initialInput);
  const [savedInput, setSavedInput] = useState<EditorInput>(initialInput);
  const [fieldErrors, setFieldErrors] = useState<DraftFieldErrors>(
    initialInspection.errors,
  );
  const [contentFormErrors, setContentFormErrors] = useState<FormErrors>(
    initialFormInspection.errors,
  );
  const [bodyError, setBodyError] = useState<string | undefined>(
    prepareArticleMarkdown(draft.bodyZh, "zh").issues[0]?.message,
  );
  const [englishFormErrors, setEnglishFormErrors] = useState<FormErrors>({});
  const [englishBodyError, setEnglishBodyError] = useState<string | undefined>(
    prepareArticleMarkdown(draft.bodyEn, "en").issues[0]?.message,
  );
  const [zhWorkflowErrors, setZhWorkflowErrors] = useState<LocaleWorkflowErrors>({});
  const [enWorkflowErrors, setEnWorkflowErrors] = useState<LocaleWorkflowErrors>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "delete" | "publish" | "server-delete" | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishProgress, setPublishProgress] = useState<ServerPublishTransaction | null>(
    () => loadPublishProgress(draft.draftId),
  );
  const [publishClock, setPublishClock] = useState(() => Date.now());
  const [publishResult, setPublishResult] = useState<DirectPublishResult | null>(() =>
    publishProgress &&
    (publishProgress.status === "succeeded" || publishProgress.status === "PUBLISHED")
      ? publishResultFromProgress(publishProgress)
      : null,
  );
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [mediaLoadPending, setMediaLoadPending] = useState(true);
  const [mediaLoadError, setMediaLoadError] = useState<string | null>(null);
  const [hasDirtyMedia, setHasDirtyMedia] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const editorInputRef = useRef(editorInput);
  const recordDraftRef = useRef(draft.recordDraft);
  const hydratedDraftRef = useRef(draft);
  const saveInFlightRef = useRef(false);
  const publishInFlightRef = useRef(false);
  const publishProgressRef = useRef<ServerPublishTransaction | null>(publishProgress);
  const queryPublishStatusRef = useRef(onQueryPublishStatus);
  const finalizePublishedDraftRef = useRef<
    (progress: ServerPublishTransaction) => Promise<void>
  >(async () => undefined);
  const mountedRef = useRef(true);
  const stagedImagesRef = useRef<StagedImage[]>([]);
  const dirtyImageIdsRef = useRef<Set<string>>(new Set());
  const mediaLoadPendingRef = useRef(true);
  const mediaLoadErrorRef = useRef<string | null>(null);
  const isDirty =
    !sameEditorInput(editorInput, savedInput) ||
    hasDirtyMedia;
  const modeFeatures = applicationModeFeatures(applicationMode);
  useUnsavedCloseWarning(isDirty || saveStatus === "saving");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    queryPublishStatusRef.current = onQueryPublishStatus;
  }, [onQueryPublishStatus]);

  const updatePublishProgress = useCallback(
    (progress: ServerPublishTransaction) => {
      const normalized = mergePublishProgress(publishProgressRef.current, progress);
      publishProgressRef.current = normalized;
      savePublishProgress(draft.draftId, normalized);
      setPublishProgress(normalized);
    },
    [draft.draftId],
  );

  useEffect(() => {
    const stored = publishProgressRef.current;
    if (
      !stored ||
      !queryPublishStatusRef.current ||
      (stored.status !== "running" &&
        !["QUEUED", "COALESCED", "SYNCING", "PUBLISHED"].includes(
          stored.status,
        ))
    ) {
      return;
    }
    let cancelled = false;
    void queryPublishStatusRef.current(
      stored.transactionId,
      updatePublishProgress,
    ).then(async (progress) => {
      if (!cancelled && progress) {
        updatePublishProgress(progress);
        if (progress.status === "succeeded" || progress.status === "PUBLISHED") {
          setPublishResult(publishResultFromProgress(progress));
        }
        if (progress.status === "PUBLISHED") {
          await finalizePublishedDraftRef.current(progress);
        }
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setPublishError(describeError(caught));
        failRunningPublishStatusQuery(caught, updatePublishProgress, publishProgressRef);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draft.draftId, updatePublishProgress]);

  useEffect(() => {
    if (publishRefreshToken === 0 || !publishProgressRef.current) {
      return;
    }
    void handleRefreshPublishStatus();
    // The token is emitted only after a server synchronization completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishRefreshToken]);

  useEffect(() => {
    if (publishProgress?.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => setPublishClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [publishProgress?.status]);

  useEffect(() => {
    if (hydratedDraftRef.current === draft) {
      return;
    }
    hydratedDraftRef.current = draft;

    // Never replace edits that are still dirty while a newer draft object arrives.
    if (isDirty || saveInFlightRef.current) {
      return;
    }

    const inspection = inspectDraft(draft);
    const formInspection =
      getContentFormAdapter(inspection.fields.contentType)?.inspect(
        draft.recordDraft,
      ) ?? { values: {}, errors: {} };
    const nextInput = editorInputFromDraft(draft);
    editorInputRef.current = nextInput;
    recordDraftRef.current = draft.recordDraft;
    setEditorInput(nextInput);
    setSavedInput(nextInput);
    setFieldErrors(inspection.errors);
    setContentFormErrors(formInspection.errors);
    setBodyError(prepareArticleMarkdown(draft.bodyZh, "zh").issues[0]?.message);
    setEnglishFormErrors({});
    setEnglishBodyError(
      prepareArticleMarkdown(draft.bodyEn, "en").issues[0]?.message,
    );
    setZhWorkflowErrors({});
    setEnWorkflowErrors({});
    setSaveStatus("saved");
    setSaveError(null);
    setDeleteError(null);
    setViewMode("edit");
  }, [draft, isDirty]);

  useEffect(() => {
    let isCurrent = true;
    mediaLoadPendingRef.current = true;
    mediaLoadErrorRef.current = null;
    mediaApi
      .listImages(draft.draftId)
      .then((images) => {
        if (!isCurrent) {
          return;
        }
        stagedImagesRef.current = images;
        setStagedImages(images);
        let restoredRecordDraft = recordDraftRef.current;
        for (const image of images) {
          restoredRecordDraft = attachImageReference(restoredRecordDraft, image);
        }
        const restoredMediaIds = recordMediaIds(restoredRecordDraft);
        const current = editorInputRef.current;
        if (JSON.stringify(restoredMediaIds) !== JSON.stringify(current.mediaIds)) {
          recordDraftRef.current = restoredRecordDraft;
          const now = new Date().toISOString();
          const restoredInput: EditorInput = {
            ...current,
            mediaIds: restoredMediaIds,
            zhWorkflow: markLocaleContentEdited(current.zhWorkflow, now),
            enWorkflow: current.enWorkflow
              ? markLocaleContentEdited(current.enWorkflow, now)
              : null,
          };
          editorInputRef.current = restoredInput;
          setEditorInput(restoredInput);
          setSaveStatus("pending");
        }
      })
      .catch((caught: unknown) => {
        if (!isCurrent) {
          return;
        }
        const message = describeError(caught);
        mediaLoadErrorRef.current = message;
        setMediaLoadError(message);
      })
      .finally(() => {
        if (isCurrent) {
          mediaLoadPendingRef.current = false;
          setMediaLoadPending(false);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [draft.draftId, mediaApi]);

  const mediaCandidateError = useCallback((locale: "zh" | "en") => {
    if (mediaLoadPendingRef.current) {
      return "正在核对图片许可，请稍后重试。";
    }
    if (mediaLoadErrorRef.current) {
      return `无法核对图片许可：${mediaLoadErrorRef.current}`;
    }
    if (dirtyImageIdsRef.current.size > 0) {
      return "请先保存全部图片元数据。";
    }
    return allImagesPublicationIssues(stagedImagesRef.current, locale)[0];
  }, []);

  const persist = useCallback(
    async (
      requestedSnapshot: EditorInput,
      directPublish = false,
      persistToStorage = true,
    ) => {
      if (saveInFlightRef.current) {
        return undefined;
      }

      const now = new Date().toISOString();
      const snapshot = directPublish
        ? {
            ...requestedSnapshot,
            zhWorkflow: normalizeDirectPublishWorkflow(
              requestedSnapshot.zhWorkflow,
              new Date(now),
            ),
            enWorkflow:
              requestedSnapshot.enWorkflow?.state === "published"
              ? normalizeDirectPublishWorkflow(
                  requestedSnapshot.enWorkflow,
                  new Date(now),
                )
                : requestedSnapshot.enWorkflow,
          }
        : requestedSnapshot;
      const prepared = updateSharedRecordDraft(
        recordDraftRef.current,
        snapshot.fields,
        now,
      );
      if (!prepared.success) {
        setFieldErrors(prepared.errors);
        setSaveError("请修正标出的字段后重试。");
        setSaveStatus("failed");
        return;
      }
      let preparedRecordDraft = prepared.recordDraft;
      for (const image of stagedImagesRef.current) {
        preparedRecordDraft = attachImageReference(preparedRecordDraft, image);
      }

      const zhWorkflowValidation = validateLocaleWorkflow(
        snapshot.zhWorkflow,
        "draft",
      );
      if (Object.values(zhWorkflowValidation).some(Boolean)) {
        setZhWorkflowErrors(zhWorkflowValidation);
        setSaveError("请修正中文语言状态后重试。");
        setSaveStatus("failed");
        return;
      }
      const zhMediaError =
        !directPublish &&
        (snapshot.zhWorkflow.state === "approved" ||
          snapshot.zhWorkflow.state === "published")
          ? mediaCandidateError("zh")
          : undefined;
      if (zhMediaError) {
        const error = zhMediaError;
        setZhWorkflowErrors((current) => ({ ...current, state: error }));
        setSaveError(`中文发布候选受图片元数据阻止：${error}`);
        setSaveStatus("failed");
        return;
      }

      const preparedBody = prepareArticleMarkdown(snapshot.bodyZh, "zh");
      if (preparedBody.issues.length > 0) {
        setBodyError(preparedBody.issues[0]?.message);
        setSaveError("请修正中文正文后重试。");
        setSaveStatus("failed");
        return;
      }

      let nextRecordDraft = applyLocaleWorkflow(
        preparedRecordDraft,
        "zh",
        snapshot.zhWorkflow,
        now,
      );
      nextRecordDraft = updateLocaleBodyReference(
        nextRecordDraft,
        "zh",
        preparedBody.markdown,
      );
      // Chinese form validation must not reject an incomplete optional English draft.
      nextRecordDraft = setEnglishLocaleMissing(nextRecordDraft);
      const adapter = getContentFormAdapter(snapshot.fields.contentType);
      if (adapter) {
        const contentFormPrepared = adapter.validate(
          nextRecordDraft,
          snapshot.contentForm,
          "draft",
        );
        if (!contentFormPrepared.success) {
          setContentFormErrors(contentFormPrepared.errors);
          setSaveError("请修正标出的字段后重试。");
          setSaveStatus("failed");
          return;
        }
        nextRecordDraft = contentFormPrepared.recordDraft;
      }

      const preparedEnglish = prepareArticleMarkdown(snapshot.bodyEn, "en");
      if (preparedEnglish.issues.length > 0) {
        setEnglishBodyError(preparedEnglish.issues[0]?.message);
        setSaveError("请修正英文正文后重试。");
        setSaveStatus("failed");
        return;
      }
      const preparedEnglishBody = preparedEnglish.markdown;
      if (snapshot.enWorkflow) {
        const englishAdapter = getEnglishContentFormAdapter(
          snapshot.fields.contentType,
        );
        if (!englishAdapter) {
          setEnglishFormErrors({
            $form: "当前内容类型不能生成英文字段。",
          });
          setSaveError("英文内容类型无效。");
          setSaveStatus("failed");
          return;
        }

        const englishWorkflowValidation = validateLocaleWorkflow(
          snapshot.enWorkflow,
          "draft",
        );
        if (Object.values(englishWorkflowValidation).some(Boolean)) {
          setEnWorkflowErrors(englishWorkflowValidation);
          setSaveError("请修正英文语言状态后重试。");
          setSaveStatus("failed");
          return;
        }

        const enMediaError =
          !directPublish &&
          (snapshot.enWorkflow.state === "approved" ||
            snapshot.enWorkflow.state === "published")
            ? mediaCandidateError("en")
            : undefined;
        if (enMediaError) {
          const error = enMediaError;
          setEnWorkflowErrors((current) => ({ ...current, state: error }));
          setSaveError(`英文发布候选受图片元数据阻止：${error}`);
          setSaveStatus("failed");
          return;
        }

        const requireComplete =
          snapshot.enWorkflow.state === "approved" ||
          snapshot.enWorkflow.state === "published";
        const englishValueErrors = englishAdapter.validateValues(
          snapshot.englishForm,
        );
        if (requireComplete && Object.values(englishValueErrors).some(Boolean)) {
          setEnglishFormErrors(englishValueErrors);
          setSaveError("英文发布候选必须补齐标出的字段。");
          setSaveStatus("failed");
          return;
        }

        nextRecordDraft = englishAdapter.apply(
          nextRecordDraft,
          snapshot.englishForm,
          now,
        );
        nextRecordDraft = applyLocaleWorkflow(
          nextRecordDraft,
          "en",
          snapshot.enWorkflow,
          now,
        );
        nextRecordDraft = updateLocaleBodyReference(
          nextRecordDraft,
          "en",
          preparedEnglishBody,
        );

        if (requireComplete) {
          const completeErrors = englishAdapter.validateCompleteRecord(nextRecordDraft);
          if (Object.values(completeErrors).some(Boolean)) {
            setEnglishFormErrors(completeErrors);
            setSaveError("英文发布候选尚未满足完整性要求。");
            setSaveStatus("failed");
            return;
          }
        }

        if (
          snapshot.enWorkflow.state === "published" &&
          !directPublish &&
          extractArticleMediaText(preparedEnglishBody).some(
            (image) => !image.alt.trim(),
          )
        ) {
          setEnglishFormErrors({
            $form: "英文已发布正文中的图片必须填写英文替代文字。",
          });
          setSaveError("请补齐英文图片文字后重试。");
          setSaveStatus("failed");
          return;
        }
      } else {
        nextRecordDraft = setEnglishLocaleMissing(nextRecordDraft);
      }

      const requiresPublicationValidation =
        snapshot.zhWorkflow.state === "approved" ||
        snapshot.zhWorkflow.state === "published" ||
        snapshot.enWorkflow?.state === "approved" ||
        snapshot.enWorkflow?.state === "published";
      if (requiresPublicationValidation && adapter) {
        const completeRecord = adapter.validate(
          nextRecordDraft,
          snapshot.contentForm,
        );
        if (!completeRecord.success) {
          setContentFormErrors(completeRecord.errors);
          setSaveError("请修正标出的字段后重试。");
          setSaveStatus("failed");
          return;
        }
        nextRecordDraft = completeRecord.recordDraft;
      }

      const saveInput = {
        draftId: draft.draftId,
        recordDraft: nextRecordDraft,
        bodyZh: preparedBody.markdown,
        bodyEn: preparedEnglishBody,
        ...(snapshot.parkedEnglishLocale !== undefined
          ? { parkedEnglishLocale: snapshot.parkedEnglishLocale }
          : {}),
      };
      if (!persistToStorage) {
        return {
          formatVersion: draft.formatVersion,
          draftId: draft.draftId,
          recordDraft: nextRecordDraft,
          bodyZh: preparedBody.markdown,
          bodyEn: preparedEnglishBody,
          ...(snapshot.parkedEnglishLocale !== undefined
            ? { parkedEnglishLocale: snapshot.parkedEnglishLocale }
            : {}),
          createdAt: draft.createdAt,
          updatedAt: now,
        };
      }

      saveInFlightRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const saved = await api.saveDraft(saveInput);
        const persistedInspection = inspectDraft(saved);
        const persistedForm = getContentFormAdapter(
          persistedInspection.fields.contentType,
        )?.inspect(saved.recordDraft) ?? { values: {}, errors: {} };
        const persistedInput = editorInputFromDraft(saved);
        if (!mountedRef.current) {
          return;
        }
        const unchangedDuringSave = sameEditorInput(
          editorInputRef.current,
          requestedSnapshot,
        );
        if (unchangedDuringSave) {
          editorInputRef.current = persistedInput;
          setEditorInput(persistedInput);
        }
        setSavedInput(persistedInput);
        setFieldErrors(persistedInspection.errors);
        setContentFormErrors(persistedForm.errors);
        setBodyError(
          prepareArticleMarkdown(saved.bodyZh, "zh").issues[0]?.message,
        );
        setEnglishFormErrors({});
        setEnglishBodyError(
          prepareArticleMarkdown(saved.bodyEn, "en").issues[0]?.message,
        );
        setZhWorkflowErrors({});
        setEnWorkflowErrors({});
        recordDraftRef.current = saved.recordDraft;
        onSaved(saved);
        setSaveStatus(unchangedDuringSave ? "saved" : "pending");
        return saved;
      } catch (caught) {
        if (mountedRef.current) {
          setSaveError(describeError(caught));
          setSaveStatus("failed");
        }
        return undefined;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [api, draft, mediaCandidateError, onSaved],
  );

  finalizePublishedDraftRef.current = async (progress) => {
    if (
      progress.status !== "PUBLISHED" ||
      isDirty ||
      editorInputRef.current.zhWorkflow.state === "published" ||
      (progress.localDraftUpdatedAt &&
        progress.localDraftUpdatedAt !== draft.updatedAt)
    ) {
      return;
    }
    const finalized = await persist(editorInputRef.current, true);
    if (finalized) {
      commitEditorInput(editorInputFromDraft(finalized));
    } else {
      setPublishError(
        "内容已上线，但本地草稿未能记录发布状态，请重试本地保存。",
      );
    }
  };

  useEffect(() => {
    if (saveStatus !== "pending" || pendingAction !== null) {
      return;
    }

    const snapshot = editorInput;
    const timer = window.setTimeout(() => {
      void persist(snapshot);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editorInput, pendingAction, persist, saveStatus]);

  function commitEditorInput(next: EditorInput) {
    editorInputRef.current = next;
    setEditorInput(next);
    setSaveError(null);
    setSaveStatus((current) => {
      if (current === "saving") {
        return current;
      }
      return sameEditorInput(next, savedInput) ? "saved" : "pending";
    });
  }

  function updateField(field: keyof DraftFields, value: string) {
    const discardsEnglish = Boolean(
      editorInput.enWorkflow ||
        editorInput.parkedEnglishLocale ||
        editorInput.bodyEn.trim(),
    );
    if (
      field === "contentType" &&
      value !== editorInput.fields.contentType &&
      !window.confirm(
        `切换内容类型会清空当前类型的专用字段${
          discardsEnglish ? "和已保留的英文草稿" : ""
        }，确定继续？`,
      )
    ) {
      return;
    }

    const contentForm =
      field === "contentType" && value !== editorInput.fields.contentType
        ? getContentFormAdapter(value)?.emptyValues() ?? {}
        : editorInput.contentForm;
    const now = new Date().toISOString();
    const typeChanged =
      field === "contentType" && value !== editorInput.fields.contentType;
    const next: EditorInput = {
      ...editorInput,
      fields: { ...editorInput.fields, [field]: value },
      contentForm,
      englishForm: typeChanged
        ? getEnglishContentFormAdapter(value)?.emptyValues() ?? {}
        : editorInput.englishForm,
      bodyEn: typeChanged ? "" : editorInput.bodyEn,
      zhWorkflow:
        typeChanged || field === "titleZh"
          ? markLocaleContentEdited(editorInput.zhWorkflow, now)
          : editorInput.zhWorkflow,
      enWorkflow: typeChanged
        ? editorInput.enWorkflow
          ? createEnglishWorkflow(now)
          : null
        : editorInput.enWorkflow,
      parkedEnglishLocale: typeChanged
        ? undefined
        : editorInput.parkedEnglishLocale,
    };
    commitEditorInput(next);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "contentType") {
      setContentFormErrors({});
      setEnglishFormErrors({});
      setEnWorkflowErrors({});
    }
  }

  function updateContentFormField(fieldId: string, value: FormValue) {
    const now = new Date().toISOString();
    const adapter = getContentFormAdapter(editorInput.fields.contentType);
    const fieldPath = adapter
      ? adapter.schema.sections
          .flatMap((section) => section.fields)
          .find((field) => field.id === fieldId)?.path
      : undefined;
    const next: EditorInput = {
      ...editorInput,
      contentForm: { ...editorInput.contentForm, [fieldId]: value },
      zhWorkflow: markLocaleContentEdited(editorInput.zhWorkflow, now),
      enWorkflow:
        editorInput.enWorkflow && fieldPath && !fieldPath.startsWith("locales.zh")
          ? markLocaleContentEdited(editorInput.enWorkflow, now)
          : editorInput.enWorkflow,
    };
    commitEditorInput(next);
    setContentFormErrors((current) => ({
      ...current,
      [fieldId]: undefined,
      $form: undefined,
    }));
  }

  function updateBody(bodyZh: string, error?: string) {
    const current = editorInputRef.current;
    if (bodyZh === current.bodyZh) {
      setBodyError(error);
      return;
    }
    const next: EditorInput = {
      ...current,
      bodyZh,
      zhWorkflow: markLocaleContentEdited(
        current.zhWorkflow,
        new Date().toISOString(),
      ),
    };
    commitEditorInput(next);
    setBodyError(error);
  }

  function updateEnglishFormField(fieldId: string, value: FormValue) {
    const current = editorInputRef.current;
    if (!current.enWorkflow) {
      return;
    }
    const next: EditorInput = {
      ...current,
      englishForm: { ...current.englishForm, [fieldId]: value },
      enWorkflow: markLocaleContentEdited(
        current.enWorkflow,
        new Date().toISOString(),
      ),
    };
    commitEditorInput(next);
    setEnglishFormErrors((errors) => ({
      ...errors,
      [fieldId]: undefined,
      $form: undefined,
    }));
  }

  function updateEnglishBody(bodyEn: string, error?: string) {
    const current = editorInputRef.current;
    if (!current.enWorkflow) {
      return;
    }
    if (bodyEn === current.bodyEn) {
      setEnglishBodyError(error);
      return;
    }
    const next: EditorInput = {
      ...current,
      bodyEn,
      enWorkflow: markLocaleContentEdited(
        current.enWorkflow,
        new Date().toISOString(),
      ),
    };
    commitEditorInput(next);
    setEnglishBodyError(error);
    setEnglishFormErrors((errors) => ({ ...errors, $form: undefined }));
  }

  function updateEnglishImageText(mediaId: string, alt: string) {
    updateEnglishBody(
      updateArticleMediaAltText(editorInputRef.current.bodyEn, mediaId, alt),
    );
  }

  function handleImageStaged(image: StagedImage) {
    const images = [...stagedImagesRef.current, image];
    stagedImagesRef.current = images;
    setStagedImages(images);
    const nextRecordDraft = attachImageReference(recordDraftRef.current, image);
    recordDraftRef.current = nextRecordDraft;
    const current = editorInputRef.current;
    const now = new Date().toISOString();
    commitEditorInput({
      ...current,
      mediaIds: recordMediaIds(nextRecordDraft),
      zhWorkflow: markLocaleContentEdited(current.zhWorkflow, now),
      enWorkflow: current.enWorkflow
        ? markLocaleContentEdited(current.enWorkflow, now)
        : null,
    });
  }

  function handleImageUpdated(image: StagedImage, persisted: boolean) {
    const images = stagedImagesRef.current.map((current) =>
      current.id === image.id ? image : current,
    );
    stagedImagesRef.current = images;
    setStagedImages(images);
    if (persisted) {
      dirtyImageIdsRef.current.delete(image.id);
    } else {
      dirtyImageIdsRef.current.add(image.id);
    }
    setHasDirtyMedia(dirtyImageIdsRef.current.size > 0);
  }

  function handleInsertBodyImage(image: StagedImage) {
    updateBody(appendBodyImage(editorInputRef.current.bodyZh, image));
  }

  function updateWorkflowField<Key extends keyof LocaleWorkflowInput>(
    locale: "zh" | "en",
    field: Key,
    value: LocaleWorkflowInput[Key],
  ) {
    const current = editorInputRef.current;
    const workflow = locale === "zh" ? current.zhWorkflow : current.enWorkflow;
    if (!workflow) {
      return;
    }
    if (field === "state") {
      const requestedState = value as LocaleWorkflowInput["state"];
      const request = requestLocaleState(
        locale,
        workflow,
        requestedState,
      );
      if (!request.allowed) {
        const setErrors = locale === "zh" ? setZhWorkflowErrors : setEnWorkflowErrors;
        setErrors((errors) => ({ ...errors, state: request.error }));
        return;
      }
      if (requestedState === "approved" || requestedState === "published") {
        const imageError = mediaCandidateError(locale);
        if (imageError) {
          const setErrors = locale === "zh" ? setZhWorkflowErrors : setEnWorkflowErrors;
          setErrors((errors) => ({ ...errors, state: imageError }));
          return;
        }
      }
      if (
        requestedState === "published" &&
        !window.confirm(`确认将${locale === "zh" ? "中文" : "英文"}版本标记为已发布？`)
      ) {
        return;
      }
    }

    let nextWorkflow: LocaleWorkflowInput = { ...workflow, [field]: value };
    if (field === "state" && value === "published" && !nextWorkflow.publishedAt) {
      nextWorkflow = { ...nextWorkflow, publishedAt: new Date().toISOString() };
    }
    if (field === "translationOrigin") {
      nextWorkflow = markLocaleContentEdited(nextWorkflow, new Date().toISOString());
    }
    const next: EditorInput =
      locale === "zh"
        ? { ...current, zhWorkflow: nextWorkflow }
        : { ...current, enWorkflow: nextWorkflow };
    commitEditorInput(next);
    const setErrors = locale === "zh" ? setZhWorkflowErrors : setEnWorkflowErrors;
    setErrors((errors) => ({ ...errors, [field]: undefined }));
  }

  function enableEnglishVersion() {
    const current = editorInputRef.current;
    const now = new Date().toISOString();
    const prepared = updateSharedRecordDraft(
      recordDraftRef.current,
      current.fields,
      now,
    );
    if (!prepared.success) {
      setFieldErrors(prepared.errors);
      return;
    }
    const restored = restoreEnglishLocale(
      prepared.recordDraft,
      current.parkedEnglishLocale,
      now,
    );
    const adapter = getEnglishContentFormAdapter(current.fields.contentType);
    const enWorkflow = inspectLocaleWorkflow(restored, "en", now);
    if (!adapter || !enWorkflow) {
      setSaveError("无法创建英文版本。请先修正内容类型。");
      return;
    }
    commitEditorInput({
      ...current,
      englishForm: adapter.inspect(restored),
      enWorkflow,
      parkedEnglishLocale: undefined,
    });
    setEnglishFormErrors({});
    setEnWorkflowErrors({});
  }

  function disableEnglishVersion() {
    const current = editorInputRef.current;
    if (!current.enWorkflow) {
      return;
    }
    if (!window.confirm("关闭英文版本会将其设为 missing，并保留当前英文草稿。")) {
      return;
    }
    const now = new Date().toISOString();
    const prepared = updateSharedRecordDraft(
      recordDraftRef.current,
      current.fields,
      now,
    );
    const adapter = getEnglishContentFormAdapter(current.fields.contentType);
    if (!prepared.success || !adapter) {
      setSaveError("无法保留英文草稿。请先修正内容类型和中文标题。");
      return;
    }
    let candidate = adapter.apply(prepared.recordDraft, current.englishForm, now);
    candidate = applyLocaleWorkflow(candidate, "en", current.enWorkflow, now);
    candidate = updateLocaleBodyReference(candidate, "en", current.bodyEn);
    const parked = parkEnglishLocale(candidate);
    commitEditorInput({
      ...current,
      enWorkflow: null,
      parkedEnglishLocale: parked.parkedEnglishLocale,
    });
    setEnglishFormErrors({});
    setEnWorkflowErrors({});
  }

  function copyChineseStructureToEnglish() {
    const current = editorInputRef.current;
    const adapter = getEnglishContentFormAdapter(current.fields.contentType);
    if (!adapter || !current.enWorkflow) {
      return;
    }
    const hasEnglishInput =
      current.bodyEn.trim() ||
      Object.values(current.englishForm).some((value) =>
        typeof value === "string" ? value.trim() : Boolean(value),
      );
    if (
      hasEnglishInput &&
      !window.confirm("复制中文结构会覆盖当前英文草稿内容，确定继续？")
    ) {
      return;
    }
    const now = new Date().toISOString();
    const next: EditorInput = {
      ...current,
      englishForm: adapter.copyChineseValues(
        current.fields.titleZh,
        current.contentForm,
      ),
      bodyEn: copyChineseArticleStructure(current.bodyZh),
      enWorkflow: markLocaleContentEdited(
        { ...current.enWorkflow, translationOrigin: "human-translated" },
        now,
      ),
    };
    commitEditorInput(next);
    setEnglishBodyError(undefined);
    setEnglishFormErrors({});
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist(editorInputRef.current);
  }

  async function handlePublish() {
    if (!onPublishToServer || publishInFlightRef.current) {
      return;
    }

    if (
      publishProgress?.status === "running" ||
      publishProgress?.status === "QUEUED" ||
      publishProgress?.status === "SYNCING"
    ) {
      await handleRefreshPublishStatus();
      return;
    }
    if (
      (publishProgress?.status === "failed" ||
        publishProgress?.status === "FAILED") &&
      !publishProgress.retryable
    ) {
      setPublishError("该事务不能安全自动重试，请先按诊断信息人工处理。");
      return;
    }

    publishInFlightRef.current = true;
    setPendingAction("publish");
    setPublishError(null);
    setPublishResult(null);
    const resume =
      (publishProgress?.status === "failed" ||
        publishProgress?.status === "FAILED") &&
      publishProgress.retryable;
    const transactionId = resume
      ? publishProgress.transactionId
      : createPublishTransactionId();
    const initialProgress = createLocalPublishProgress(
      transactionId,
      resume ? "confirming_server_status" : "saving",
      resume ? "正在确认上次事务状态" : "正在保存当前内容",
    );
    const legacyProgress =
      publishProgress && !isQueuePublishTransaction(publishProgress)
        ? publishProgress
        : null;
    updatePublishProgress(
      resume && legacyProgress
        ? {
            ...initialProgress,
            startedAt: legacyProgress.startedAt,
            clientStartedAt:
              legacyProgress.clientStartedAt ?? legacyProgress.startedAt,
            elapsedMs: legacyProgress.elapsedMs,
            attempt: legacyProgress.attempt,
            serverStarted: legacyProgress.serverStarted,
            safeToCancel: false,
          }
        : initialProgress,
    );
    try {
      let saved = draft;
      if (!resume) {
        const persisted = await persist(editorInputRef.current);
        if (!persisted) {
          return;
        }
        saved = persisted;
      }

      const candidate = await persist(editorInputFromDraft(saved), true, false);
      if (!candidate) {
        return;
      }

      const result = await onPublishToServer(
        {
          draft: candidate,
          stagedImages: [...stagedImagesRef.current],
        },
        {
          operatorId: SINGLE_USER_DIRECT_OPERATOR_ID,
          transactionId,
          resume,
          onProgress: updatePublishProgress,
        },
      );

      if (result?.protocolMode === "queue" && result.queueStatus) {
        const queuedResult = {
          ...result,
          localDraftUpdatedAt: saved.updatedAt,
        };
        const queued = queueTransactionFromResult(
          queuedResult,
          transactionId,
        );
        updatePublishProgress(queued);
        setPublishResult(queuedResult);
        if (queued.status !== "PUBLISHED") {
          return;
        }
      }

      const publishedInput = editorInputFromDraft(candidate);
      commitEditorInput(publishedInput);
      const finalized = await persist(publishedInput, true);
      if (!finalized) {
        setPublishError("服务器已发布成功，但本地草稿未能记录发布状态，请重试本地保存。");
      }
      if (result) {
        setPublishResult(result);
      }
      const currentProgress = publishProgressRef.current;
      if (
        currentProgress?.status !== "succeeded" &&
        currentProgress?.status !== "PUBLISHED"
      ) {
        const succeeded = createLocalPublishProgress(
          transactionId,
          "succeeded",
          result?.message ?? "发布成功",
          "succeeded",
        );
        updatePublishProgress(succeeded);
      }
    } catch (caught) {
      setPublishError(describeError(caught));
      const currentProgress = publishProgressRef.current;
      if (
        currentProgress &&
        currentProgress.status !== "failed" &&
        currentProgress.status !== "FAILED"
      ) {
        if (isQueuePublishTransaction(currentProgress)) {
          setPublishError(describeError(caught));
          return;
        }
        const failed: ServerPublishProgress = {
          ...currentProgress,
          status: "failed",
          retryable: false,
          errorCode: "CLIENT_PUBLISH_FAILED",
          userMessage: describeError(caught),
          technicalSummary: describeError(caught),
          failedStage: currentProgress.stage,
          message: describeError(caught),
          updatedAt: new Date().toISOString(),
        };
        updatePublishProgress(failed);
      }
    } finally {
      publishInFlightRef.current = false;
      setPendingAction(null);
    }
  }

  async function handleRefreshPublishStatus() {
    if (!publishProgress || !queryPublishStatusRef.current || publishInFlightRef.current) {
      return;
    }
    publishInFlightRef.current = true;
    setPendingAction("publish");
    setPublishError(null);
    try {
      const refreshed = await queryPublishStatusRef.current(
        publishProgress.transactionId,
        updatePublishProgress,
      );
      if (!refreshed) {
        throw new Error("暂时无法读取该发布事务状态。");
      }
      const previous = publishProgressRef.current;
      if (
        isQueuePublishTransaction(refreshed) &&
        isQueuePublishTransaction(previous) &&
        previous.localDraftUpdatedAt
      ) {
        refreshed.localDraftUpdatedAt = previous.localDraftUpdatedAt;
      }
      updatePublishProgress(refreshed);
      if (refreshed.status === "succeeded" || refreshed.status === "PUBLISHED") {
        setPublishResult(publishResultFromProgress(refreshed));
      }
      if (refreshed.status === "PUBLISHED") {
        await finalizePublishedDraftRef.current(refreshed);
      }
    } catch (caught) {
      setPublishError(describeError(caught));
      failRunningPublishStatusQuery(caught, updatePublishProgress, publishProgressRef);
    } finally {
      publishInFlightRef.current = false;
      setPendingAction(null);
    }
  }

  async function handleOpenPublishedUrl(url: string) {
    if (!onOpenPublishedUrl) {
      return;
    }
    setPublishError(null);
    try {
      await onOpenPublishedUrl(url);
    } catch (caught) {
      setPublishError(`无法打开线上页面：${describeError(caught)}`);
    }
  }

  function handleEndLocalPublishTransaction() {
    const current = publishProgressRef.current;
    if (
      publishInFlightRef.current ||
      !current ||
      !canEndLocalPublishTransaction(current)
    ) {
      return;
    }
    clearPublishProgress(draft.draftId);
    publishProgressRef.current = null;
    setPublishProgress(null);
    setPublishError(null);
    setPublishResult(null);
  }

  async function handleDelete() {
    const title = editorInput.fields.titleZh.trim() || "未命名草稿";
    if (!window.confirm(`确定删除“${title}”？`)) {
      return;
    }

    setPendingAction("delete");
    setDeleteError(null);
    try {
      await api.deleteDraft(draft.draftId);
      onDeleted(draft.draftId);
    } catch (caught) {
      setDeleteError(describeError(caught));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleServerDelete(item: DirectServerContent) {
    if (!onDeleteServerContent) {
      return;
    }
    setPendingAction("server-delete");
    setPublishError(null);
    try {
      const result = await onDeleteServerContent(item);
      if (result) {
        setPublishResult(result);
        if (
          result.protocolMode === "queue" &&
          result.queueStatus &&
          result.transactionId
        ) {
          updatePublishProgress(
            queueTransactionFromResult(result, result.transactionId),
          );
        }
      } else {
        setPublishResult(null);
      }
    } catch (caught) {
      setPublishError(describeError(caught));
    } finally {
      setPendingAction(null);
    }
  }

  const isEditorDisabled = pendingAction !== null;
  const isBusy = isEditorDisabled || saveStatus === "saving";
  const fields = editorInput.fields;
  const serverContent = serverContentItems.find(
    (item) =>
      item.stableId === fields.stableId && item.contentType === fields.contentType,
  );
  const serverAvailable = serverConnectionState === "available";
  const serverChecking =
    serverConnectionState === "unchecked" || serverConnectionState === "checking";
  const queueMode =
    serverProtocolMode === "queue" && serverQueueModeActive;
  const queueAwaitingSynchronization =
    publishProgress?.status === "QUEUED" ||
    publishProgress?.status === "COALESCED" ||
    publishProgress?.status === "SYNCING";
  const publishButtonLabel =
    pendingAction === "publish"
      ? queueMode
        ? "正在上传..."
        : "正在发布..."
      : publishProgress?.status === "running" ||
          publishProgress?.status === "QUEUED" ||
          publishProgress?.status === "SYNCING"
        ? "查看当前发布状态"
        : (publishProgress?.status === "failed" ||
              publishProgress?.status === "FAILED") &&
            publishProgress.retryable
          ? "安全重试"
          : publishProgress?.status === "failed" ||
              publishProgress?.status === "FAILED"
            ? "需要人工处理"
      : serverChecking
        ? "正在检查服务器"
        : !serverAvailable
          ? "服务器不可用"
          : queueMode
            ? "上传并等待同步"
            : serverContent
            ? "保存并更新服务器"
            : "发布到服务器";
  const activeFormAdapter = getContentFormAdapter(fields.contentType);
  const activeEnglishAdapter = getEnglishContentFormAdapter(fields.contentType);
  const contentTypeOption = contentTypeOptions.find(
    (option) => option.value === fields.contentType,
  );
  const previewValue: DetailPreviewValue = {
    contentType: {
      zh: contentTypeOption?.labelZh ?? "未知内容类型",
      en: contentTypeOption?.labelEn ?? "Unknown content type",
    },
    authors: previewAuthorIds(
      draft.recordDraft,
      activeFormAdapter?.schema,
      editorInput.contentForm,
    ),
    locales: {
      zh: {
        authorName: stringFormValue(editorInput.contentForm.authorName),
        title: fields.titleZh,
        summary: stringFormValue(editorInput.contentForm.summaryZh),
        body: editorInput.bodyZh,
        state: editorInput.zhWorkflow.state,
        reviewStatus: editorInput.zhWorkflow.reviewStatus,
        timestamp: editorInput.zhWorkflow.publishedAt || draft.updatedAt,
        isPublished: editorInput.zhWorkflow.state === "published",
      },
      en: editorInput.enWorkflow
        ? {
            authorName: stringFormValue(editorInput.englishForm.authorName),
            title: stringFormValue(editorInput.englishForm.titleEn),
            summary: stringFormValue(editorInput.englishForm.summaryEn),
            body: editorInput.bodyEn,
            state: editorInput.enWorkflow.state,
            reviewStatus: editorInput.enWorkflow.reviewStatus,
            timestamp: editorInput.enWorkflow.publishedAt || draft.updatedAt,
            isPublished: editorInput.enWorkflow.state === "published",
          }
        : null,
    },
  };
  const previewMedia = stagedImages.map(stagedImageToPreviewMedia);

  return (
    <form className="draft-editor" onSubmit={(event) => void handleSave(event)}>
      <div className="draft-editor-heading">
        <div>
          <h3>编辑草稿</h3>
          <p>
            草稿格式 v{draft.formatVersion} · Schema v
            {inspectDraft(draft).errors.schemaVersion
              ? "?"
              : SHARED_SCHEMA_VERSION}
          </p>
        </div>
        {modeFeatures.showLegacyNavigation ? (
        <div className="draft-editor-heading-actions">
          <button
            className="secondary-button"
            type="button"
            aria-pressed={viewMode === "preview"}
            disabled={isBusy}
            onClick={() =>
              setViewMode((current) => current === "edit" ? "preview" : "edit")
            }
          >
            {viewMode === "edit" ? (
              <Eye aria-hidden="true" size={17} />
            ) : (
              <PenLine aria-hidden="true" size={17} />
            )}
            {viewMode === "edit" ? "预览详情页" : "返回编辑"}
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={isBusy}
            onClick={() => void handleDelete()}
          >
            <Trash2 aria-hidden="true" size={17} />
            {pendingAction === "delete" ? "正在删除..." : "删除"}
          </button>
        </div>
        ) : null}
      </div>

      {viewMode === "edit" ? (
        <>
      <div className="field-group">
        <label htmlFor="draft-content-type">内容类型</label>
        <select
          id="draft-content-type"
          value={fields.contentType}
          aria-invalid={Boolean(fieldErrors.contentType)}
          aria-describedby={fieldErrors.contentType ? "draft-content-type-error" : undefined}
          disabled={isEditorDisabled}
          onChange={(event) => updateField("contentType", event.target.value)}
        >
          {!contentTypeLabel(fields.contentType) ? (
            <option value={fields.contentType}>未知类型</option>
          ) : null}
          {contentTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelZh} / {option.labelEn}
            </option>
          ))}
        </select>
        <FieldError id="draft-content-type-error" message={fieldErrors.contentType} />
      </div>
      <div className="field-group">
        <label htmlFor="draft-stable-id">稳定 ID</label>
        <input
          id="draft-stable-id"
          type="text"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          value={fields.stableId}
          aria-invalid={Boolean(fieldErrors.stableId)}
          aria-describedby={fieldErrors.stableId ? "draft-stable-id-error" : undefined}
          disabled={isEditorDisabled}
          onChange={(event) => updateField("stableId", event.target.value)}
        />
        <FieldError id="draft-stable-id-error" message={fieldErrors.stableId} />
      </div>
      <div className="field-group">
        <label htmlFor="draft-title-zh">中文标题</label>
        <input
          id="draft-title-zh"
          type="text"
          maxLength={500}
          value={fields.titleZh}
          aria-invalid={Boolean(fieldErrors.titleZh)}
          aria-describedby={fieldErrors.titleZh ? "draft-title-zh-error" : undefined}
          disabled={isEditorDisabled}
          onChange={(event) => updateField("titleZh", event.target.value)}
        />
        <FieldError id="draft-title-zh-error" message={fieldErrors.titleZh} />
      </div>

      <FieldError id="draft-schema-version-error" message={fieldErrors.schemaVersion} />

      <section className="locale-version-control" aria-labelledby="locale-version-title">
        <div>
          <h4 id="locale-version-title">语言版本</h4>
          <p>
            中文：{localeStateLabel(editorInput.zhWorkflow.state)}
            {" · "}
            英文：{localeStateLabel(editorInput.enWorkflow?.state ?? "missing")}
          </p>
        </div>
        <label className="locale-switch" htmlFor="english-version-switch">
          <input
            id="english-version-switch"
            type="checkbox"
            role="switch"
            checked={Boolean(editorInput.enWorkflow)}
            disabled={isEditorDisabled}
            onChange={(event) =>
              event.target.checked ? enableEnglishVersion() : disableEnglishVersion()
            }
          />
          <span>英文版本</span>
        </label>
      </section>

      <LocaleWorkflowFields
        locale="zh"
        value={editorInput.zhWorkflow}
        errors={zhWorkflowErrors}
        disabled={isEditorDisabled}
        showReviewControls={modeFeatures.showReviewControls}
        onChange={(field, value) => updateWorkflowField("zh", field, value)}
      />

      {activeFormAdapter ? (
        <SchemaForm
          schema={activeFormAdapter.schema}
          values={editorInput.contentForm}
          errors={contentFormErrors}
          disabled={isEditorDisabled}
          onChange={updateContentFormField}
        />
      ) : null}

      <ArticleEditor
        value={editorInput.bodyZh}
        locale="zh"
        error={bodyError}
        disabled={isEditorDisabled}
        onChange={updateBody}
      />

      <ImageIntake
        api={mediaApi}
        draftId={draft.draftId}
        contentType={fields.contentType}
        images={stagedImages}
        englishEnabled={Boolean(editorInput.enWorkflow)}
        disabled={isEditorDisabled || mediaLoadPending || Boolean(mediaLoadError)}
        loadError={mediaLoadError}
        onStaged={handleImageStaged}
        onUpdated={handleImageUpdated}
        onInsertBody={handleInsertBodyImage}
      />

      {editorInput.enWorkflow && activeEnglishAdapter ? (
        <section className="english-editor-section" aria-labelledby="english-editor-title">
          <header className="english-editor-heading">
            <h4 id="english-editor-title">英文版本</h4>
            <button
              className="secondary-button"
              type="button"
              disabled={isEditorDisabled}
              onClick={copyChineseStructureToEnglish}
            >
              <Copy aria-hidden="true" size={17} />
              复制中文结构
            </button>
          </header>

          <LocaleWorkflowFields
            locale="en"
            value={editorInput.enWorkflow}
            errors={enWorkflowErrors}
            disabled={isEditorDisabled}
            showReviewControls={modeFeatures.showReviewControls}
            onChange={(field, value) => updateWorkflowField("en", field, value)}
          />

          <SchemaForm
            schema={activeEnglishAdapter.schema}
            values={editorInput.englishForm}
            errors={englishFormErrors}
            disabled={isEditorDisabled}
            onChange={updateEnglishFormField}
          />

          <ArticleEditor
            value={editorInput.bodyEn}
            locale="en"
            error={englishBodyError}
            disabled={isEditorDisabled}
            onChange={updateEnglishBody}
          />

          <EnglishMediaTextPlaceholders
            markdown={editorInput.bodyEn}
            errors={englishFormErrors}
            disabled={isEditorDisabled}
            onChange={updateEnglishImageText}
          />
        </section>
      ) : null}
        </>
      ) : (
        <ContentPreview value={previewValue} media={previewMedia} />
      )}

      <dl className="draft-metadata">
        <div>
          <dt>内部草稿 ID</dt>
          <dd>{draft.draftId}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd>{formatTimestamp(draft.createdAt)}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{formatTimestamp(draft.updatedAt)}</dd>
        </div>
      </dl>

      <div className="draft-editor-actions">
        <div className="draft-editor-action-buttons">
          <button className="primary-button" type="submit" disabled={isBusy}>
            <Save aria-hidden="true" size={18} />
            {saveStatus === "saving"
              ? "正在保存..."
              : saveStatus === "failed"
                ? "重试保存"
                : "保存草稿"}
          </button>
          {modeFeatures.showLegacyNavigation ? null : (
            <>
              <button
                className="secondary-button"
                type="button"
                aria-pressed={viewMode === "preview"}
                disabled={isBusy}
                onClick={() =>
                  setViewMode((current) => current === "edit" ? "preview" : "edit")
                }
              >
                {viewMode === "edit" ? (
                  <Eye aria-hidden="true" size={17} />
                ) : (
                  <PenLine aria-hidden="true" size={17} />
                )}
                {viewMode === "edit" ? "本地预览" : "返回编辑"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  isBusy ||
                  !onPublishToServer ||
                  !serverAvailable ||
                  serverProtocolMode === "incompatible" ||
                  ((publishProgress?.status === "failed" ||
                    publishProgress?.status === "FAILED") &&
                    !publishProgress.retryable)
                }
                title={
                  serverAvailable
                    ? queueMode
                      ? "上传并等待服务器同步"
                      : serverContent
                      ? "保存并更新服务器"
                      : "发布到服务器"
                    : serverConnectionError ?? "请先检查服务器连接。"
                }
                onClick={() => void handlePublish()}
              >
                <CloudUpload aria-hidden="true" size={17} />
                {publishButtonLabel}
              </button>
              {publishProgress && onQueryPublishStatus ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleRefreshPublishStatus()}
                >
                  <RefreshCw aria-hidden="true" size={17} />
                  查看当前发布状态
                </button>
              ) : null}
              {publishProgress && canEndLocalPublishTransaction(publishProgress) ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={handleEndLocalPublishTransaction}
                >
                  <X aria-hidden="true" size={17} />
                  结束本地事务
                </button>
              ) : null}
              {serverContent?.urlZh && onViewServerContent &&
              !queueAwaitingSynchronization ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => onViewServerContent(serverContent)}
                >
                  <ExternalLink aria-hidden="true" size={17} />
                  查看线上页面
                </button>
              ) : null}
              <button
                className="secondary-button"
                type="button"
                disabled={isBusy || !onExportDraft}
                onClick={() => onExportDraft?.(draft.draftId)}
              >
                <ArrowLeftRight aria-hidden="true" size={17} />
                导出
              </button>
              {serverContent && onDeleteServerContent ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={isBusy || !serverAvailable}
                  title={
                    serverAvailable
                      ? "从服务器删除"
                      : serverConnectionError ?? "服务器不可用"
                  }
                  onClick={() => void handleServerDelete(serverContent)}
                >
                  <Trash2 aria-hidden="true" size={17} />
                  {pendingAction === "server-delete"
                    ? queueMode
                      ? "正在上传删除..."
                      : "正在删除..."
                    : queueMode
                      ? "上传删除并等待同步"
                      : "从服务器删除"}
                </button>
              ) : (
                <button
                  className="danger-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 aria-hidden="true" size={17} />
                  {pendingAction === "delete" ? "正在删除..." : "删除草稿"}
                </button>
              )}
            </>
          )}
        </div>
        <SaveStatusIndicator status={saveStatus} error={saveError} />
        {publishProgress ? (
          isQueuePublishTransaction(publishProgress) ? (
            <QueuePublishPanel
              transaction={publishProgress}
              pending={pendingStatus}
            />
          ) : (
            <PublishProgressPanel
              progress={publishProgress}
              now={publishClock}
              queueMode={queueMode}
            />
          )
        ) : null}
        {publishError &&
        publishProgress?.status !== "failed" &&
        publishProgress?.status !== "FAILED" ? (
          <p className="operation-error" role="alert">
            {publishError}
          </p>
        ) : null}
        {publishResult ? (
          <div className="publish-result" role="status">
            <CheckCircle2 aria-hidden="true" size={17} />
            <span>{publishResult.message}</span>
            {publishResult.publishedAt ? (
              <time dateTime={publishResult.publishedAt}>
                {formatTimestamp(publishResult.publishedAt)}
              </time>
            ) : null}
            {publishResult.releaseSha ? <code>{publishResult.releaseSha}</code> : null}
            <PublishResultDetails result={publishResult} />
            {publishResult.url &&
            (publishResult.protocolMode !== "queue" ||
              publishResult.queueStatus === "PUBLISHED") ? (
              <a
                href={publishResult.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  const url = publishResult.url;
                  if (!onOpenPublishedUrl || !url) {
                    return;
                  }
                  event.preventDefault();
                  void handleOpenPublishedUrl(url);
                }}
              >
                <ExternalLink aria-hidden="true" size={16} />
                打开线上页面
              </a>
            ) : null}
          </div>
        ) : null}
        {deleteError ? (
          <p className="operation-error" role="alert">
            {deleteError}
          </p>
        ) : null}
      </div>
    </form>
  );
}

type SaveStatus = "pending" | "saving" | "saved" | "failed";

function useUnsavedCloseWarning(shouldWarn: boolean) {
  useEffect(() => {
    if (!shouldWarn) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    if (isTauri()) {
      let disposed = false;
      let unlisten: (() => void) | undefined;
      let removeFallback: (() => void) | undefined;
      void getCurrentWindow()
        .onCloseRequested((event) => {
          if (!window.confirm("草稿仍有未保存更改，确定关闭工作台？")) {
            event.preventDefault();
          }
        })
        .then((stopListening) => {
          if (disposed) {
            stopListening();
          } else {
            unlisten = stopListening;
          }
        })
        .catch(() => {
          if (!disposed) {
            window.addEventListener("beforeunload", handleBeforeUnload);
            removeFallback = () =>
              window.removeEventListener("beforeunload", handleBeforeUnload);
          }
        });
      return () => {
        disposed = true;
        unlisten?.();
        removeFallback?.();
      };
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarn]);
}

function SaveStatusIndicator({
  status,
  error,
}: {
  status: SaveStatus;
  error: string | null;
}) {
  const states = {
    pending: { Icon: Clock3, label: "等待自动保存" },
    saving: { Icon: LoaderCircle, label: "保存中..." },
    saved: { Icon: CheckCircle2, label: "已保存" },
    failed: { Icon: CircleAlert, label: `保存失败：${error ?? "未知错误"}` },
  } as const;
  const { Icon, label } = states[status];

  return (
    <p
      className={`save-status save-status-${status}`}
      role={status === "failed" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={status === "saving" ? "save-status-spinner" : undefined}
        size={17}
      />
      <span>{label}</span>
    </p>
  );
}

function editorInputFromDraft(draft: Draft): EditorInput {
  const inspection = inspectDraft(draft);
  const contentForm = getContentFormAdapter(inspection.fields.contentType)?.inspect(
    draft.recordDraft,
  ).values ?? {};
  const englishAdapter = getEnglishContentFormAdapter(
    inspection.fields.contentType,
  );
  const fallbackChinese = {
    ...createEnglishWorkflow(draft.updatedAt),
    translationOrigin: "source-authored" as const,
  };
  return {
    fields: inspection.fields,
    contentForm,
    bodyZh: draft.bodyZh,
    englishForm: englishAdapter?.inspect(draft.recordDraft) ?? {},
    bodyEn: draft.bodyEn,
    zhWorkflow:
      inspectLocaleWorkflow(draft.recordDraft, "zh", draft.updatedAt) ??
      fallbackChinese,
    enWorkflow: inspectLocaleWorkflow(
      draft.recordDraft,
      "en",
      draft.updatedAt,
    ),
    mediaIds: recordMediaIds(draft.recordDraft),
    ...(draft.parkedEnglishLocale !== undefined
      ? { parkedEnglishLocale: draft.parkedEnglishLocale }
      : {}),
  };
}

function EnglishMediaTextPlaceholders({
  markdown,
  errors,
  disabled,
  onChange,
}: {
  markdown: string;
  errors: FormErrors;
  disabled: boolean;
  onChange: (mediaId: string, alt: string) => void;
}) {
  const images = extractArticleMediaText(markdown);
  return (
    <fieldset className="english-media-text">
      <legend>英文图片文字占位</legend>
      <div className="english-media-text-grid">
        {images.length > 0 ? (
          images.map((image) => {
            const id = `english-media-${image.mediaId}`;
            const hasPublicationError = Boolean(errors.$form) && !image.alt.trim();
            return (
              <div className="field-group" key={image.mediaId}>
                <label htmlFor={id}>英文替代文字 · {image.mediaId}</label>
                <input
                  id={id}
                  type="text"
                  value={image.alt}
                  disabled={disabled}
                  placeholder="English alternative text"
                  aria-invalid={hasPublicationError}
                  onChange={(event) => onChange(image.mediaId, event.target.value)}
                />
              </div>
            );
          })
        ) : (
          <div className="field-group">
            <label htmlFor="english-media-empty">英文图片文字</label>
            <input
              id="english-media-empty"
              type="text"
              disabled
              placeholder="在英文正文插入图片占位后填写"
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}

function previewAuthorIds(
  recordDraft: unknown,
  schema: FormSchemaDefinition | undefined,
  values: FormValues,
) {
  const authorFields = schema?.sections
    .flatMap((section) => section.fields)
    .filter((field) => /^authors(?:\[\d+\])?$/.test(field.path)) ?? [];
  if (authorFields.length > 0) {
    return [...new Set(
      authorFields
        .map((field) => stringFormValue(values[field.id]).trim())
        .filter(Boolean),
    )];
  }

  const record = asRecord(recordDraft);
  return Array.isArray(record?.authors)
    ? [...new Set(record.authors.filter((value): value is string => typeof value === "string"))]
    : [];
}

function stringFormValue(value: FormValue | undefined) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stagedImageToPreviewMedia(image: StagedImage): DetailPreviewMedia {
  const metadata = image.metadata;
  const caption = metadata.captionZh.trim() || metadata.captionEn.trim()
    ? {
        zh: metadata.captionZh.trim(),
        ...(metadata.captionEn.trim() ? { en: metadata.captionEn.trim() } : {}),
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
    ...(metadata.sourceUrl.trim() ? { sourceUrl: metadata.sourceUrl.trim() } : {}),
    license: {
      identifier: previewLicenseIdentifier(metadata.licenseIdentifier),
      name: metadata.licenseName.trim(),
      ...(metadata.licenseUrl.trim() ? { href: metadata.licenseUrl.trim() } : {}),
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
    alt: {
      zh: metadata.altZh.trim(),
      ...(metadata.altEn.trim() ? { en: metadata.altEn.trim() } : {}),
    },
    ...(caption ? { caption } : {}),
    relatedContentIds: [],
    legacy: false,
  };
}

function previewLicenseIdentifier(
  value: string,
): DetailPreviewMedia["license"]["identifier"] {
  switch (value) {
    case "cc0-1.0":
    case "cc-by-4.0":
    case "cc-by-sa-4.0":
    case "public-domain":
    case "team-owned":
    case "permission-granted":
    case "other":
      return value;
    default:
      return "other";
  }
}

function sameSaveInput(left: DraftFields, right: DraftFields) {
  return (
    left.contentType === right.contentType &&
    left.stableId === right.stableId &&
    left.titleZh === right.titleZh
  );
}

function sameEditorInput(left: EditorInput, right: EditorInput) {
  if (
    left.bodyZh !== right.bodyZh ||
    left.bodyEn !== right.bodyEn ||
    JSON.stringify(left.mediaIds) !== JSON.stringify(right.mediaIds) ||
    JSON.stringify(left.zhWorkflow) !== JSON.stringify(right.zhWorkflow) ||
    JSON.stringify(left.enWorkflow) !== JSON.stringify(right.enWorkflow) ||
    JSON.stringify(left.parkedEnglishLocale) !==
      JSON.stringify(right.parkedEnglishLocale)
  ) {
    return false;
  }
  if (!sameSaveInput(left.fields, right.fields)) {
    return false;
  }
  const adapter = getContentFormAdapter(left.fields.contentType);
  if (
    adapter &&
    !sameFormValues(adapter.schema, left.contentForm, right.contentForm)
  ) {
    return false;
  }
  const englishAdapter = getEnglishContentFormAdapter(left.fields.contentType);
  return !englishAdapter ||
    sameFormValues(
      englishAdapter.schema,
      left.englishForm,
      right.englishForm,
    );
}

function localeStateLabel(state: LocaleWorkflowInput["state"] | "missing") {
  return {
    missing: "missing",
    draft: "草稿",
    "internal-review": "审核中",
    approved: "发布候选",
    published: "已发布",
    archived: "已归档",
  }[state];
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function QueuePublishPanel({
  transaction,
  pending,
}: {
  transaction: ServerQueuePublishState;
  pending: PendingStatusData | null;
}) {
  const blocked = transaction.errorCode === "SYNC_BLOCKED";
  const retryableFailure =
    transaction.errorCode === "SYNC_FAILED_RETRYABLE" || transaction.retryable;
  const diagnostic = [
    transaction.errorCode,
    transaction.failedStage,
    transaction.transactionId,
    transaction.includedInSyncTransactionId,
    transaction.technicalSummary,
    pending?.server_time,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <section className="publish-progress-panel queue-publish-panel" aria-label="当前队列状态">
      <div className="publish-progress-heading" aria-live="polite">
        {transaction.status === "SYNCING" ? (
          <LoaderCircle className="save-status-spinner" aria-hidden="true" size={18} />
        ) : transaction.status === "FAILED" ? (
          <CircleAlert aria-hidden="true" size={18} />
        ) : (
          <CheckCircle2 aria-hidden="true" size={18} />
        )}
        <div>
          <strong>{queueStatusLabel(transaction.status)}</strong>
          <span>{queueStatusMessage(transaction)}</span>
        </div>
      </div>

      {transaction.status !== "PUBLISHED" && transaction.status !== "FAILED" ? (
        <p className="queue-not-published">网站尚未更新</p>
      ) : null}

      <dl className="publish-result-details queue-result-details">
        <ResultIdentity label="上传事务 ID" value={transaction.transactionId} />
        <ResultIdentity label="内容提交" value={transaction.contentCommit} />
        <ResultIdentity label="本地内容提交" value={transaction.sourceCommit} />
        {pending?.pending_content_commit ? (
          <ResultIdentity
            label="服务器 pending"
            value={pending.pending_content_commit}
          />
        ) : null}
        {transaction.includedInSyncTransactionId ? (
          <ResultIdentity
            label="同步事务 ID"
            value={transaction.includedInSyncTransactionId}
          />
        ) : null}
        {transaction.coalescedIntoCommit ? (
          <ResultIdentity
            label="合并到内容提交"
            value={transaction.coalescedIntoCommit}
          />
        ) : null}
        {transaction.publishedReleaseId ? (
          <ResultIdentity label="release" value={transaction.publishedReleaseId} />
        ) : null}
        {transaction.status === "PUBLISHED" && transaction.publishedAt ? (
          <div>
            <dt>上线时间</dt>
            <dd>
              <time dateTime={transaction.publishedAt}>
                {formatTimestamp(transaction.publishedAt)}
              </time>
            </dd>
          </div>
        ) : null}
        {transaction.status === "PUBLISHED" &&
        (transaction.siteCommit || pending?.site_commit) ? (
          <ResultIdentity
            label="网站源码 SHA"
            value={transaction.siteCommit || pending?.site_commit || ""}
          />
        ) : null}
        {pending ? (
          <div>
            <dt>待同步数量</dt>
            <dd>{pending.pending_upload_count}</dd>
          </div>
        ) : null}
        {pending?.next_scheduled_sync_at ? (
          <div>
            <dt>下次自动同步</dt>
            <dd>
              <time dateTime={pending.next_scheduled_sync_at}>
                {formatTimestamp(pending.next_scheduled_sync_at)}
              </time>
            </dd>
          </div>
        ) : null}
        <TimingResult label="Bundle 生成" value={transaction.bundleGenerationDurationMs} />
        <TimingResult label="SHA-256" value={transaction.sha256DurationMs} />
        <TimingResult label="Bundle 上传" value={transaction.bundleUploadDurationMs} />
        <TimingResult
          label="服务器快速校验"
          value={transaction.serverValidationDurationMs}
        />
        <TimingResult label="入队总耗时" value={transaction.queueTotalDurationMs} />
      </dl>

      {transaction.status === "FAILED" ? (
        <div className="publish-failure-summary" role="alert">
          <strong>
            {blocked
              ? "服务器无法自动同步此内容"
              : retryableFailure
                ? "服务器遇到临时错误，将在下一同步窗口重试。"
                : transaction.userMessage || transaction.message}
          </strong>
          {transaction.failedStage ? (
            <span>失败阶段：{transaction.failedStage}</span>
          ) : null}
          {blocked ? <span>请上传修正后的新版本。</span> : null}
          {diagnostic ? (
            <button
              className="secondary-button publish-copy-diagnostic"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(diagnostic)}
            >
              <Copy aria-hidden="true" size={15} />
              复制诊断摘要
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TimingResult({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === undefined ? "未记录" : formatDuration(value)}</dd>
    </div>
  );
}

function queueStatusLabel(status: QueueUploadStatus) {
  return {
    QUEUED: "等待服务器同步",
    COALESCED: "已合并到后续版本",
    SYNCING: "服务器正在同步",
    PUBLISHED: "已上线",
    FAILED: "队列事务失败",
  }[status];
}

function queueStatusMessage(transaction: ServerQueuePublishState) {
  return {
    QUEUED: "内容已安全上传到服务器，状态：等待同步",
    COALESCED: "此版本已包含在后续上传内容中，将随最新版本一同同步。",
    SYNCING: "服务器正在处理固定的内容快照。",
    PUBLISHED: "内容已通过服务器同步并上线。",
    FAILED: transaction.userMessage || transaction.message,
  }[transaction.status];
}

function PublishProgressPanel({
  progress,
  now,
  queueMode,
}: {
  progress: ServerPublishProgress;
  now: number;
  queueMode: boolean;
}) {
  const clientStarted = Date.parse(progress.clientStartedAt ?? progress.startedAt ?? "");
  const stageStarted = Date.parse(progress.stageStartedAt ?? "");
  const totalElapsed = Number.isNaN(clientStarted)
    ? progress.elapsedMs
    : Math.max(0, now - clientStarted);
  const stageElapsed =
    progress.status === "running" && !Number.isNaN(stageStarted)
      ? Math.max(0, now - stageStarted)
      : (progress.stageDurationsMs?.[progress.stage] ?? 0);
  const visibleStages = queueMode
    ? PUBLISH_STAGE_ORDER.slice(
        0,
        PUBLISH_STAGE_ORDER.indexOf("server_validating") + 1,
      )
    : PUBLISH_STAGE_ORDER;
  const currentIndex = visibleStages.indexOf(progress.stage);
  const completedLabels = visibleStages.filter((stage, index) => {
    if (stage === "succeeded") {
      return false;
    }
    return progress.status === "succeeded" || (currentIndex >= 0 && index < currentIndex);
  }).map((stage) => PUBLISH_STAGE_LABELS[stage]);
  const diagnostic = [
    progress.errorCode,
    progress.failedStage,
    progress.transactionId,
    progress.technicalSummary,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <section className="publish-progress-panel" aria-label="当前发布状态">
      <div className="publish-progress-heading" aria-live="polite">
        {progress.status === "running" ? (
          <LoaderCircle className="save-status-spinner" aria-hidden="true" size={18} />
        ) : progress.status === "succeeded" ? (
          <CheckCircle2 aria-hidden="true" size={18} />
        ) : (
          <CircleAlert aria-hidden="true" size={18} />
        )}
        <div>
          <strong>{PUBLISH_STAGE_LABELS[progress.stage]}</strong>
          <span>{progress.message}</span>
        </div>
      </div>

      {completedLabels.length > 0 ? (
        <p className="publish-completed-summary">
          已完成：{completedLabels.join("、")}
        </p>
      ) : null}

      <dl className="publish-timing-grid">
        <div>
          <dt>当前阶段</dt>
          <dd>{formatDuration(stageElapsed)}</dd>
        </div>
        <div>
          <dt>总耗时</dt>
          <dd>{formatDuration(totalElapsed)}</dd>
        </div>
        <div>
          <dt>重试次数</dt>
          <dd>{Math.max(0, progress.attempt - 1)}</dd>
        </div>
        <div>
          <dt>文件上传</dt>
          <dd>{progress.isUploading ? "进行中" : "未在上传"}</dd>
        </div>
        <div>
          <dt>{queueMode ? "服务器快速校验" : "服务器处理"}</dt>
          <dd>
            {progress.serverStarted
              ? "已开始"
              : queueMode
                ? "等待 Bundle 上传"
                : "尚未开始"}
          </dd>
        </div>
        <div>
          <dt>操作安全性</dt>
          <dd>
            {progress.safeToCancel
              ? "可取消"
              : progress.status === "failed" && progress.retryable
                ? "可安全重试"
                : "不可强制取消"}
          </dd>
        </div>
      </dl>

      {progress.bundleUploadedAt ? (
        <p className="publish-upload-complete">
          Bundle 已上传，用时 {formatDuration(progress.bundleUploadDurationMs ?? 0)}；
          完成于 {formatTimestamp(progress.bundleUploadedAt)}。
        </p>
      ) : null}

      <ol className="publish-stage-list">
        {visibleStages.map((stage, index) => {
          const state = publishStageState(progress, stage, index, currentIndex);
          return (
            <li key={stage} data-state={state}>
              <span aria-hidden="true" />
              <strong>{PUBLISH_STAGE_LABELS[stage]}</strong>
              <small>{publishStageStateLabel(state)}</small>
              {progress.stageDurationsMs?.[stage] !== undefined ? (
                <time>{formatDuration(progress.stageDurationsMs[stage] ?? 0)}</time>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="publish-transaction-row">
        <span>事务 ID</span>
        <code>{progress.transactionId}</code>
      </div>

      {progress.status === "failed" ? (
        <div className="publish-failure-summary" role="alert">
          <strong>{progress.userMessage || progress.message}</strong>
          <span>
            失败阶段：{PUBLISH_STAGE_LABELS[progress.failedStage as PublishStage] ?? progress.failedStage}
          </span>
          <span>
            {progress.retryable
              ? `可安全重试，已尝试 ${progress.attempt} 次。`
              : "不会自动重试，需要人工处理。"}
          </span>
          {diagnostic ? (
            <button
              className="secondary-button publish-copy-diagnostic"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(diagnostic)}
            >
              <Copy aria-hidden="true" size={15} />
              复制诊断摘要
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type PublishStageVisualState =
  | "pending"
  | "running"
  | "completed"
  | "retrying"
  | "failed"
  | "skipped"
  | "recovered";

function publishStageState(
  progress: ServerPublishProgress,
  stage: PublishStage,
  index: number,
  currentIndex: number,
): PublishStageVisualState {
  if (stage === "preparing_site_source" && progress.sourceMethod === "cache") {
    return "skipped";
  }
  if (stage === progress.stage) {
    if (progress.status === "failed") {
      return "failed";
    }
    if (progress.retrying) {
      return "retrying";
    }
    return progress.status === "succeeded" ? "completed" : "running";
  }
  if (stage === "uploading_bundle" && progress.bundleUploadedAt && progress.bundleUploadDurationMs === 0) {
    return "recovered";
  }
  if (progress.status === "succeeded" || (currentIndex >= 0 && index < currentIndex)) {
    return "completed";
  }
  return "pending";
}

function publishStageStateLabel(state: PublishStageVisualState) {
  const labels: Record<PublishStageVisualState, string> = {
    pending: "未开始",
    running: "进行中",
    completed: "已完成",
    retrying: "正在重试",
    failed: "失败",
    skipped: "已跳过",
    recovered: "已从上次事务恢复",
  };
  return labels[state];
}

function PublishResultDetails({ result }: { result: DirectPublishResult }) {
  const durations = result.stageDurationsMs ?? {};
  const sourceDuration = sumDurations(durations, [
    "checking_site_source_cache",
    "preparing_site_source",
  ]);
  const switchDuration = sumDurations(durations, [
    "switching_release",
    "restarting_service",
    "verifying_production_url",
  ]);
  const rows = result.protocolMode === "queue"
    ? ([
        ["Bundle 生成", result.bundleGenerationDurationMs],
        ["SHA-256", result.sha256DurationMs],
        ["Bundle 上传", result.bundleUploadDurationMs],
        ["服务器快速校验", result.serverValidationDurationMs],
        ["入队总耗时", result.totalDurationMs],
      ] as const)
    : ([
        ["Bundle 上传", result.bundleUploadDurationMs],
        ["服务器处理", result.totalDurationMs],
        ["源码准备", sourceDuration],
        ["依赖准备", durations.preparing_dependencies],
        ["网站构建", durations.building_site],
        ["切换与验证", switchDuration],
        ["总耗时", result.totalDurationMs],
      ] as const);
  return (
    <dl className="publish-result-details">
      {rows.map(([label, duration]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{duration === undefined ? "未记录" : formatDuration(duration)}</dd>
        </div>
      ))}
      {result.releaseId ? <ResultIdentity label="release" value={result.releaseId} /> : null}
      {result.contentSha ? <ResultIdentity label="内容提交" value={result.contentSha} /> : null}
      {result.sourceSha ? <ResultIdentity label="本地内容提交" value={result.sourceSha} /> : null}
      {result.pendingContentSha ? (
        <ResultIdentity label="服务器 pending" value={result.pendingContentSha} />
      ) : null}
      {result.siteSha ? <ResultIdentity label="网站源码" value={result.siteSha} /> : null}
      {result.syncTransactionId ? (
        <ResultIdentity label="同步事务 ID" value={result.syncTransactionId} />
      ) : null}
      {result.nextScheduledSyncAt ? (
        <div>
          <dt>下次自动同步</dt>
          <dd>
            <time dateTime={result.nextScheduledSyncAt}>
              {formatTimestamp(result.nextScheduledSyncAt)}
            </time>
          </dd>
        </div>
      ) : null}
      {result.pendingUploadCount !== undefined ? (
        <div>
          <dt>待同步数量</dt>
          <dd>{result.pendingUploadCount}</dd>
        </div>
      ) : null}
      {result.transactionId ? (
        <ResultIdentity label="事务 ID" value={result.transactionId} />
      ) : null}
    </dl>
  );
}

function ResultIdentity({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd><code>{value}</code></dd>
    </div>
  );
}

function sumDurations(
  durations: Partial<Record<PublishStage, number>>,
  stages: PublishStage[],
) {
  const values = stages
    .map((stage) => durations[stage])
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : undefined;
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "未记录";
  }
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} 秒`;
}

function createLocalPublishProgress(
  transactionId: string,
  stage: PublishStage,
  message: string,
  status: ServerPublishProgress["status"] = "running",
): ServerPublishProgress {
  const now = new Date().toISOString();
  return {
    transactionId,
    status,
    stage,
    message,
    startedAt: now,
    clientStartedAt: now,
    stageStartedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    stageElapsedMs: 0,
    attempt: 1,
    retryable: false,
    isUploading: false,
    serverStarted: false,
    safeToCancel: true,
    safeToRetry: false,
  };
}

function mergePublishProgress(
  current: ServerPublishTransaction | null,
  progress: ServerPublishTransaction,
): ServerPublishTransaction {
  if (isQueuePublishTransaction(progress)) {
    return {
      ...progress,
      bundleUploadedAt:
        progress.bundleUploadedAt ?? current?.bundleUploadedAt,
      bundleUploadDurationMs:
        progress.bundleUploadDurationMs ?? current?.bundleUploadDurationMs,
      bundleGenerationDurationMs:
        progress.bundleGenerationDurationMs ??
        current?.bundleGenerationDurationMs,
      sha256DurationMs: progress.sha256DurationMs ?? current?.sha256DurationMs,
      serverValidationDurationMs:
        progress.serverValidationDurationMs ??
        current?.serverValidationDurationMs,
      queueTotalDurationMs:
        progress.queueTotalDurationMs ?? current?.queueTotalDurationMs,
      localDraftUpdatedAt:
        progress.localDraftUpdatedAt ?? current?.localDraftUpdatedAt,
    };
  }
  if (isQueuePublishTransaction(current)) {
    return progress;
  }
  const sameTransaction = current?.transactionId === progress.transactionId;
  const serverStarted = sameTransaction
    ? current.serverStarted === true || progress.serverStarted === true
    : progress.serverStarted;
  return {
    ...progress,
    clientStartedAt:
      sameTransaction
        ? current.clientStartedAt ??
          current.startedAt ??
          progress.clientStartedAt ??
          progress.startedAt
        : progress.clientStartedAt ?? progress.startedAt,
    elapsedMs: sameTransaction
      ? Math.max(current.elapsedMs, progress.elapsedMs)
      : progress.elapsedMs,
    attempt: sameTransaction
      ? Math.max(current.attempt, progress.attempt)
      : progress.attempt,
    bundleUploadedAt: progress.bundleUploadedAt ?? current?.bundleUploadedAt,
    bundleUploadDurationMs:
      progress.bundleUploadDurationMs ?? current?.bundleUploadDurationMs,
    serverStarted,
    safeToCancel: serverStarted ? false : progress.safeToCancel,
  };
}

function publishProgressStorageKey(draftId: string) {
  return `algae-content-workbench:publish:${draftId}`;
}

function savePublishProgress(draftId: string, progress: ServerPublishTransaction) {
  try {
    localStorage.setItem(publishProgressStorageKey(draftId), JSON.stringify(progress));
  } catch {
    // The visible in-memory status remains authoritative for this app session.
  }
}

function clearPublishProgress(draftId: string) {
  try {
    localStorage.removeItem(publishProgressStorageKey(draftId));
  } catch {
    // The in-memory state is still cleared for this app session.
  }
}

function failRunningPublishStatusQuery(
  error: unknown,
  updateProgress: (progress: ServerPublishTransaction) => void,
  progressRef: { current: ServerPublishTransaction | null },
) {
  const current = progressRef.current;
  if (!current || current.status !== "running") {
    return;
  }
  const now = new Date().toISOString();
  const technicalSummary = describeError(error);
  updateProgress({
    ...current,
    status: "failed",
    stage: "confirming_server_status",
    stageStartedAt: now,
    updatedAt: now,
    retryable: true,
    safeToCancel: false,
    safeToRetry: true,
    errorCode: "STATUS_QUERY_FAILED",
    failedStage: "confirming_server_status",
    userMessage: "暂时无法确认服务器上的发布状态。请恢复连接后安全重试。",
    technicalSummary,
    message: "连接中断，尚未确认服务器实际状态",
  });
}

function canEndLocalPublishTransaction(progress: ServerPublishTransaction) {
  if (isQueuePublishTransaction(progress)) {
    return false;
  }
  return (
    progress.status !== "succeeded" &&
    progress.serverStarted !== true &&
    !progress.bundleUploadedAt &&
    ["saving", "checking_server", "generating_bundle", "verifying_sha256"].includes(
      progress.stage,
    )
  );
}

function loadPublishProgress(draftId: string): ServerPublishTransaction | null {
  try {
    const raw = localStorage.getItem(publishProgressStorageKey(draftId));
    if (!raw) {
      return null;
    }
    const progress = JSON.parse(raw) as Partial<ServerPublishTransaction>;
    if (
      typeof progress.transactionId === "string" &&
      /^[0-9a-f]{32}$/.test(progress.transactionId) &&
      ["FAILED", "QUEUED", "COALESCED", "SYNCING", "PUBLISHED"].includes(
        progress.status ?? "",
      ) &&
      typeof progress.message === "string" &&
      typeof progress.contentCommit === "string" &&
      typeof progress.sourceCommit === "string" &&
      typeof progress.retryable === "boolean"
    ) {
      return progress as ServerQueuePublishState;
    }
    if (
      typeof progress.transactionId !== "string" ||
      !/^[0-9a-f]{32}$/.test(progress.transactionId) ||
      typeof progress.stage !== "string" ||
      !(progress.stage in PUBLISH_STAGE_LABELS) ||
      !["running", "failed", "succeeded"].includes(progress.status ?? "")
    ) {
      return null;
    }
    return progress as ServerPublishProgress;
  } catch {
    return null;
  }
}

function publishResultFromProgress(
  progress: ServerPublishTransaction,
): DirectPublishResult {
  if (isQueuePublishTransaction(progress)) {
    return {
      message: queueStatusMessage(progress),
      protocolMode: "queue",
      queueStatus: progress.status,
      url: progress.status === "PUBLISHED" ? progress.url : undefined,
      publishedAt: progress.publishedAt || undefined,
      transactionId: progress.transactionId,
      contentSha: progress.contentCommit,
      sourceSha: progress.sourceCommit,
      siteSha: progress.siteCommit,
      releaseId: progress.publishedReleaseId || undefined,
      syncTransactionId: progress.includedInSyncTransactionId || undefined,
      coalescedIntoCommit: progress.coalescedIntoCommit || undefined,
      totalDurationMs: progress.queueTotalDurationMs,
      bundleGenerationDurationMs: progress.bundleGenerationDurationMs,
      sha256DurationMs: progress.sha256DurationMs,
      bundleUploadDurationMs: progress.bundleUploadDurationMs,
      serverValidationDurationMs: progress.serverValidationDurationMs,
      retryable: progress.retryable,
      errorCode: progress.errorCode,
      failedStage: progress.failedStage,
      technicalSummary: progress.technicalSummary,
      localDraftUpdatedAt: progress.localDraftUpdatedAt,
    };
  }
  return {
    message: progress.message,
    url: progress.url,
    releaseSha: progress.releaseSha,
    publishedAt: progress.updatedAt,
    transactionId: progress.transactionId,
    contentSha: progress.contentCommit ?? progress.contentSha,
    siteSha: progress.siteCommit ?? progress.releaseSha,
    releaseId: progress.releaseId,
    totalDurationMs: progress.elapsedMs,
    stageDurationsMs: progress.stageDurationsMs,
    bundleUploadDurationMs: progress.bundleUploadDurationMs,
  };
}

function queueTransactionFromResult(
  result: DirectPublishResult,
  transactionId: string,
): ServerQueuePublishState {
  const status = result.queueStatus ?? "FAILED";
  return {
    transactionId,
    status,
    message: result.message,
    contentCommit: result.contentSha ?? "",
    sourceCommit: result.sourceSha ?? "",
    siteCommit: result.siteSha,
    retryable: result.retryable ?? false,
    url: status === "PUBLISHED" ? result.url : undefined,
    publishedAt: result.publishedAt,
    publishedReleaseId: result.releaseId,
    includedInSyncTransactionId: result.syncTransactionId,
    coalescedIntoCommit: result.coalescedIntoCommit,
    queueTotalDurationMs: result.totalDurationMs,
    bundleGenerationDurationMs: result.bundleGenerationDurationMs,
    sha256DurationMs: result.sha256DurationMs,
    bundleUploadDurationMs: result.bundleUploadDurationMs,
    serverValidationDurationMs: result.serverValidationDurationMs,
    errorCode: result.errorCode,
    failedStage: result.failedStage,
    technicalSummary: result.technicalSummary,
    localDraftUpdatedAt: result.localDraftUpdatedAt,
  };
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "草稿操作失败。";
}
