import {
  Activity,
  Archive,
  FilePlus2,
  Files,
  Inbox,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DraftsPage, NewDraftPage } from "./components/DraftPages";
import { tauriDraftApi } from "./drafts";
import type { Draft, DraftApi } from "./drafts";

const APP_VERSION = "0.1.0";

const navigationItems = [
  {
    id: "new-content",
    label: "新建内容",
    icon: FilePlus2,
  },
  {
    id: "drafts",
    label: "草稿箱",
    icon: Files,
  },
  {
    id: "submitted",
    label: "已提交",
    emptyState: "目前没有已提交内容。",
    icon: Archive,
  },
  {
    id: "settings",
    label: "设置",
    emptyState: "当前没有可配置项。",
    icon: Settings,
  },
  {
    id: "diagnostics",
    label: "诊断",
    emptyState: "当前没有诊断信息。",
    icon: Activity,
  },
] as const;

type SectionId = (typeof navigationItems)[number]["id"];

const staticEmptyStates: Partial<Record<SectionId, string>> = {
  submitted: "目前没有已提交内容。",
  settings: "当前没有可配置项。",
  diagnostics: "当前没有诊断信息。",
};

type AppProps = {
  draftApi?: DraftApi;
};

const recoveryRequests = new WeakMap<DraftApi, Promise<Draft | null>>();

function takeRecoveryDraftOnce(draftApi: DraftApi) {
  const existing = recoveryRequests.get(draftApi);
  if (existing) {
    return existing;
  }
  const request = draftApi.takeRecoveryDraft();
  recoveryRequests.set(draftApi, request);
  return request;
}

export default function App({ draftApi = tauriDraftApi }: AppProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("new-content");
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<Draft | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const activeItem =
    navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0];

  useEffect(() => {
    let isCurrent = true;

    takeRecoveryDraftOnce(draftApi)
      .then((candidate) => {
        if (isCurrent) {
          setRecoveryDraft(candidate);
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setRecoveryError(describeError(caught));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [draftApi]);

  function handleDraftCreated(draft: Draft) {
    setInitialDraft(draft);
    setActiveSection("drafts");
  }

  function handleRecoverDraft() {
    if (!recoveryDraft) {
      return;
    }
    setInitialDraft(recoveryDraft);
    setRecoveryDraft(null);
    setActiveSection("drafts");
  }

  return (
    <div className="workbench-shell">
      <aside className="workbench-sidebar">
        <header className="workbench-brand">
          <h1>藻类团队内容发布工作台</h1>
          <p>版本 {APP_VERSION}</p>
        </header>
        <nav aria-label="工作台导航">
          <ul>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeItem.id;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="workbench-main">
        {recoveryDraft ? (
          <section className="recovery-banner" aria-label="异常恢复" role="status">
            <div>
              <strong>检测到上次会话异常结束</strong>
              <p>
                最近草稿：{recoveryDraft.titleZh.trim() || "未命名草稿"}
              </p>
            </div>
            <div className="recovery-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleRecoverDraft}
              >
                <RotateCcw aria-hidden="true" size={18} />
                恢复草稿
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="忽略恢复提示"
                title="忽略恢复提示"
                onClick={() => setRecoveryDraft(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </section>
        ) : null}
        {recoveryError ? (
          <p className="operation-error recovery-error" role="alert">
            无法检查异常恢复：{recoveryError}
          </p>
        ) : null}
        <section className="workspace-page" aria-labelledby="workspace-title">
          <h2 id="workspace-title">{activeItem.label}</h2>
          {activeSection === "new-content" ? (
            <NewDraftPage api={draftApi} onCreated={handleDraftCreated} />
          ) : activeSection === "drafts" ? (
            <DraftsPage api={draftApi} initialDraft={initialDraft} />
          ) : (
            <div className="empty-state" role="status">
              <Inbox aria-hidden="true" size={28} strokeWidth={1.6} />
              <p>{staticEmptyStates[activeSection]}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "恢复检查失败。";
}
