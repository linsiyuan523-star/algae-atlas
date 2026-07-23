import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  FilePlus2,
  Files,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { inspectDraft } from "../drafts";
import type { Draft, DraftApi } from "../drafts";
import { getContentFormAdapter } from "../forms/content-forms";
import { sameFormValues } from "../forms/form-engine";
import type {
  FormErrors,
  FormValue,
  FormValues,
} from "../forms/form-engine";
import {
  contentTypeLabel,
  contentTypeOptions,
  createSharedRecordDraft,
  SHARED_SCHEMA_VERSION,
  updateSharedRecordDraft,
} from "../schema-drafts";
import type {
  DraftFieldErrors,
  DraftFields,
} from "../schema-drafts";
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
      onCreated(await api.createDraft({ recordDraft: prepared.recordDraft }));
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
  initialDraft?: Draft | null;
};

export function DraftsPage({ api, initialDraft = null }: DraftsPageProps) {
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
                draft={selectedDraft}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
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
  draft: Draft;
  onSaved: (draft: Draft) => void;
  onDeleted: (draftId: string) => void;
};

type EditorInput = {
  fields: DraftFields;
  contentForm: FormValues;
};

function DraftEditor({ api, draft, onSaved, onDeleted }: DraftEditorProps) {
  const initialInspection = inspectDraft(draft);
  const initialFormInspection = getContentFormAdapter(
    initialInspection.fields.contentType,
  )?.inspect(draft.recordDraft) ?? { values: {}, errors: {} };
  const initialInput: EditorInput = {
    fields: initialInspection.fields,
    contentForm: initialFormInspection.values,
  };
  const [editorInput, setEditorInput] = useState<EditorInput>(initialInput);
  const [savedInput, setSavedInput] = useState<EditorInput>(initialInput);
  const [fieldErrors, setFieldErrors] = useState<DraftFieldErrors>(
    initialInspection.errors,
  );
  const [contentFormErrors, setContentFormErrors] = useState<FormErrors>(
    initialFormInspection.errors,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editorInputRef = useRef(editorInput);
  const recordDraftRef = useRef(draft.recordDraft);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const isDirty = !sameEditorInput(editorInput, savedInput);
  useUnsavedCloseWarning(isDirty || saveStatus === "saving");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    recordDraftRef.current = draft.recordDraft;
  }, [draft.recordDraft]);

  const persist = useCallback(
    async (snapshot: EditorInput) => {
      if (saveInFlightRef.current) {
        return;
      }

      const prepared = updateSharedRecordDraft(
        recordDraftRef.current,
        snapshot.fields,
        new Date().toISOString(),
      );
      if (!prepared.success) {
        setFieldErrors(prepared.errors);
        setSaveError("请修正标出的字段后重试。");
        setSaveStatus("failed");
        return;
      }

      let nextRecordDraft = prepared.recordDraft;
      const adapter = getContentFormAdapter(snapshot.fields.contentType);
      if (adapter) {
        const contentFormPrepared = adapter.validate(
          nextRecordDraft,
          snapshot.contentForm,
        );
        if (!contentFormPrepared.success) {
          setContentFormErrors(contentFormPrepared.errors);
          setSaveError("请修正标出的字段后重试。");
          setSaveStatus("failed");
          return;
        }
        nextRecordDraft = contentFormPrepared.recordDraft;
      }

      saveInFlightRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const saved = await api.saveDraft({
          draftId: draft.draftId,
          recordDraft: nextRecordDraft,
        });
        const persistedInspection = inspectDraft(saved);
        const persistedForm = getContentFormAdapter(
          persistedInspection.fields.contentType,
        )?.inspect(saved.recordDraft) ?? { values: {}, errors: {} };
        const persistedInput: EditorInput = {
          fields: persistedInspection.fields,
          contentForm: persistedForm.values,
        };
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
    [api, draft.draftId, onSaved],
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

  function updateField(field: keyof DraftFields, value: string) {
    const contentForm =
      field === "contentType" && value !== editorInput.fields.contentType
        ? getContentFormAdapter(value)?.emptyValues() ?? {}
        : editorInput.contentForm;
    const next: EditorInput = {
      ...editorInput,
      fields: { ...editorInput.fields, [field]: value },
      contentForm,
    };
    editorInputRef.current = next;
    setEditorInput(next);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "contentType") {
      setContentFormErrors({});
    }
    setSaveError(null);
    setSaveStatus((current) => {
      if (current === "saving") {
        return current;
      }
      return sameEditorInput(next, savedInput) ? "saved" : "pending";
    });
  }

  function updateContentFormField(fieldId: string, value: FormValue) {
    const next: EditorInput = {
      ...editorInput,
      contentForm: { ...editorInput.contentForm, [fieldId]: value },
    };
    editorInputRef.current = next;
    setEditorInput(next);
    setContentFormErrors((current) => ({
      ...current,
      [fieldId]: undefined,
      $form: undefined,
    }));
    setSaveError(null);
    setSaveStatus((current) => {
      if (current === "saving") {
        return current;
      }
      return sameEditorInput(next, savedInput) ? "saved" : "pending";
    });
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

      {activeFormAdapter ? (
        <SchemaForm
          schema={activeFormAdapter.schema}
          values={editorInput.contentForm}
          errors={contentFormErrors}
          disabled={isBusy}
          onChange={updateContentFormField}
        />
      ) : null}

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
        <button className="primary-button" type="submit" disabled={isBusy}>
          <Save aria-hidden="true" size={18} />
          {saveStatus === "saving"
            ? "正在保存..."
            : saveStatus === "failed"
              ? "重试保存"
              : "保存草稿"}
        </button>
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

function sameSaveInput(left: DraftFields, right: DraftFields) {
  return (
    left.contentType === right.contentType &&
    left.stableId === right.stableId &&
    left.titleZh === right.titleZh
  );
}

function sameEditorInput(left: EditorInput, right: EditorInput) {
  if (!sameSaveInput(left.fields, right.fields)) {
    return false;
  }
  const adapter = getContentFormAdapter(left.fields.contentType);
  if (!adapter) {
    return true;
  }
  return sameFormValues(
    adapter.schema,
    left.contentForm,
    right.contentForm,
  );
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
