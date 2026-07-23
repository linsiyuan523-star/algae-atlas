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
import type { Draft, DraftApi, SaveDraftInput } from "../drafts";

type NewDraftPageProps = {
  api: DraftApi;
  onCreated: (draft: Draft) => void;
};

export const AUTOSAVE_DELAY_MS = 700;

export function NewDraftPage({ api, onCreated }: NewDraftPageProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setIsCreating(true);
    setError(null);
    try {
      onCreated(await api.createDraft());
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="new-draft-action">
      <FilePlus2 aria-hidden="true" size={30} strokeWidth={1.6} />
      <button
        className="primary-button"
        type="button"
        disabled={isCreating}
        onClick={() => void handleCreate()}
      >
        <FilePlus2 aria-hidden="true" size={18} />
        {isCreating ? "正在新建..." : "新建基础草稿"}
      </button>
      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
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

  async function handleCreate() {
    setPendingAction("create");
    setError(null);
    try {
      const created = await api.createDraft();
      setDrafts((current) => [
        created,
        ...current.filter((draft) => draft.draftId !== created.draftId),
      ]);
      setSelectedDraft(created);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setPendingAction(null);
    }
  }

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
        <button
          className="primary-button"
          type="button"
          disabled={isBusy}
          onClick={() => void handleCreate()}
        >
          <FilePlus2 aria-hidden="true" size={18} />
          {pendingAction === "create" ? "正在新建..." : "新建草稿"}
        </button>
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
                const title = draft.titleZh.trim() || "未命名草稿";
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
                      <span>{draft.stableId.trim() || "尚无稳定 ID"}</span>
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

function DraftEditor({ api, draft, onSaved, onDeleted }: DraftEditorProps) {
  const initialFields = toSaveInput(draft);
  const [fields, setFields] = useState<SaveDraftInput>(initialFields);
  const [savedFields, setSavedFields] = useState<SaveDraftInput>(initialFields);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fieldsRef = useRef(fields);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const isDirty = !sameSaveInput(fields, savedFields);
  useUnsavedCloseWarning(isDirty || saveStatus === "saving");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const persist = useCallback(
    async (snapshot: SaveDraftInput) => {
      if (saveInFlightRef.current) {
        return;
      }

      saveInFlightRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const saved = await api.saveDraft(snapshot);
        const persistedFields = toSaveInput(saved);
        if (!mountedRef.current) {
          return;
        }
        setSavedFields(persistedFields);
        onSaved(saved);
        setSaveStatus(
          sameSaveInput(fieldsRef.current, persistedFields) ? "saved" : "pending",
        );
      } catch (caught) {
        if (mountedRef.current) {
          setSaveError(describeError(caught));
          setSaveStatus("failed");
        }
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [api, onSaved],
  );

  useEffect(() => {
    if (saveStatus !== "pending" || pendingAction === "delete") {
      return;
    }

    const snapshot = fields;
    const timer = window.setTimeout(() => {
      void persist(snapshot);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [fields, pendingAction, persist, saveStatus]);

  function updateField(field: keyof Omit<SaveDraftInput, "draftId">, value: string) {
    const next = { ...fields, [field]: value };
    fieldsRef.current = next;
    setFields(next);
    setSaveError(null);
    setSaveStatus((current) => {
      if (current === "saving") {
        return current;
      }
      return sameSaveInput(next, savedFields) ? "saved" : "pending";
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist(fieldsRef.current);
  }

  async function handleDelete() {
    const title = fields.titleZh.trim() || "未命名草稿";
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

  return (
    <form className="draft-editor" onSubmit={(event) => void handleSave(event)}>
      <div className="draft-editor-heading">
        <div>
          <h3>编辑草稿</h3>
          <p>格式 v{draft.formatVersion}</p>
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

      <label>
        <span>内容类型（占位）</span>
        <input
          type="text"
          maxLength={100}
          value={fields.contentType}
          onChange={(event) => updateField("contentType", event.target.value)}
        />
      </label>
      <label>
        <span>稳定 ID</span>
        <input
          type="text"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          value={fields.stableId}
          onChange={(event) => updateField("stableId", event.target.value)}
        />
      </label>
      <label>
        <span>中文标题</span>
        <input
          type="text"
          maxLength={500}
          value={fields.titleZh}
          onChange={(event) => updateField("titleZh", event.target.value)}
        />
      </label>

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

function toSaveInput(draft: Draft): SaveDraftInput {
  return {
    draftId: draft.draftId,
    contentType: draft.contentType,
    stableId: draft.stableId,
    titleZh: draft.titleZh,
  };
}

function sameSaveInput(left: SaveDraftInput, right: SaveDraftInput) {
  return (
    left.draftId === right.draftId &&
    left.contentType === right.contentType &&
    left.stableId === right.stableId &&
    left.titleZh === right.titleZh
  );
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
