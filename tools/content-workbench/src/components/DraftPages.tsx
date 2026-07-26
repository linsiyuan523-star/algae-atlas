import {
  ArrowLeftRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudUpload,
  Copy,
  Eye,
  FilePlus2,
  Files,
  LoaderCircle,
  PenLine,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DEFAULT_APPLICATION_MODE,
  SINGLE_USER_DIRECT_OPERATOR_ID,
  applicationModeFeatures,
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

type DraftsPageProps = {
  api: DraftApi;
  mediaApi?: MediaApi;
  initialDraft?: Draft | null;
  applicationMode?: ApplicationMode;
  onExportDraft?: (draftId: string) => void;
  onPublishToServer?: (
    draft: Draft,
    options: { operatorId: string },
  ) => void;
};

export function DraftsPage({
  api,
  mediaApi = unavailableMediaApi,
  initialDraft = null,
  applicationMode = DEFAULT_APPLICATION_MODE,
  onExportDraft,
  onPublishToServer,
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
    draft: Draft,
    options: { operatorId: string },
  ) => void;
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
  const [pendingAction, setPendingAction] = useState<"delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [mediaLoadPending, setMediaLoadPending] = useState(true);
  const [mediaLoadError, setMediaLoadError] = useState<string | null>(null);
  const [hasDirtyMedia, setHasDirtyMedia] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const editorInputRef = useRef(editorInput);
  const recordDraftRef = useRef(draft.recordDraft);
  const hydratedDraftRef = useRef(draft);
  const saveInFlightRef = useRef(false);
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
    async (snapshot: EditorInput) => {
      if (saveInFlightRef.current) {
        return;
      }

      const now = new Date().toISOString();
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
        snapshot.zhWorkflow.state === "approved" ||
        snapshot.zhWorkflow.state === "published"
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
          snapshot.enWorkflow.state === "approved" ||
          snapshot.enWorkflow.state === "published"
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

      saveInFlightRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const saved = await api.saveDraft({
          draftId: draft.draftId,
          recordDraft: nextRecordDraft,
          bodyZh: preparedBody.markdown,
          bodyEn: preparedEnglishBody,
          ...(snapshot.parkedEnglishLocale !== undefined
            ? { parkedEnglishLocale: snapshot.parkedEnglishLocale }
            : {}),
        });
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
          snapshot,
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
      } catch (caught) {
        if (mountedRef.current) {
          setSaveError(describeError(caught));
          setSaveStatus("failed");
        }
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [api, draft.draftId, mediaCandidateError, onSaved],
  );

  useEffect(() => {
    if (saveStatus !== "pending" || pendingAction === "delete") {
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

  const isBusy = pendingAction !== null || saveStatus === "saving";
  const fields = editorInput.fields;
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
            disabled={isBusy}
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
        disabled={isBusy}
        showReviewControls={modeFeatures.showReviewControls}
        onChange={(field, value) => updateWorkflowField("zh", field, value)}
      />

      {activeFormAdapter ? (
        <SchemaForm
          schema={activeFormAdapter.schema}
          values={editorInput.contentForm}
          errors={contentFormErrors}
          disabled={isBusy}
          onChange={updateContentFormField}
        />
      ) : null}

      <ArticleEditor
        value={editorInput.bodyZh}
        locale="zh"
        error={bodyError}
        disabled={isBusy}
        onChange={updateBody}
      />

      <ImageIntake
        api={mediaApi}
        draftId={draft.draftId}
        contentType={fields.contentType}
        images={stagedImages}
        englishEnabled={Boolean(editorInput.enWorkflow)}
        disabled={isBusy || mediaLoadPending || Boolean(mediaLoadError)}
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
              disabled={isBusy}
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
            disabled={isBusy}
            showReviewControls={modeFeatures.showReviewControls}
            onChange={(field, value) => updateWorkflowField("en", field, value)}
          />

          <SchemaForm
            schema={activeEnglishAdapter.schema}
            values={editorInput.englishForm}
            errors={englishFormErrors}
            disabled={isBusy}
            onChange={updateEnglishFormField}
          />

          <ArticleEditor
            value={editorInput.bodyEn}
            locale="en"
            error={englishBodyError}
            disabled={isBusy}
            onChange={updateEnglishBody}
          />

          <EnglishMediaTextPlaceholders
            markdown={editorInput.bodyEn}
            errors={englishFormErrors}
            disabled={isBusy}
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
                disabled={isBusy || !onPublishToServer}
                title={onPublishToServer ? "发布到服务器" : "服务器发布将在后续阶段接入"}
                onClick={() =>
                  onPublishToServer?.(draft, {
                    operatorId: SINGLE_USER_DIRECT_OPERATOR_ID,
                  })
                }
              >
                <CloudUpload aria-hidden="true" size={17} />
                发布到服务器
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={isBusy || !onExportDraft}
                onClick={() => onExportDraft?.(draft.draftId)}
              >
                <ArrowLeftRight aria-hidden="true" size={17} />
                导出
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={isBusy}
                onClick={() => void handleDelete()}
              >
                <Trash2 aria-hidden="true" size={17} />
                {pendingAction === "delete" ? "正在删除..." : "删除草稿"}
              </button>
            </>
          )}
        </div>
        <SaveStatusIndicator status={saveStatus} error={saveError} />
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

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "草稿操作失败。";
}
