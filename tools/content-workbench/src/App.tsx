import {
  Archive,
  FilePlus2,
  Files,
  GitBranch,
  Inbox,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { DraftsPage, NewDraftPage } from "./components/DraftPages";
import { OnboardingPage } from "./components/OnboardingPage";
import { RepositoryExportPage } from "./components/RepositoryExportPage";
import { inspectDraft, tauriDraftApi, unavailableDraftApi } from "./drafts";
import type { Draft, DraftApi } from "./drafts";
import type { GitHubPublishApi } from "./github-publish";
import { tauriMediaApi, unavailableMediaApi } from "./media";
import type { MediaApi } from "./media";
import {
  tauriRepositoryApi,
  unavailableRepositoryApi,
} from "./repository";
import type { RepositoryApi } from "./repository";
import {
  tauriOnboardingApi,
  unavailableOnboardingApi,
} from "./onboarding";
import type { OnboardingApi, OnboardingStatus } from "./onboarding";

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
    icon: Settings,
  },
  {
    id: "repository-export",
    label: "仓库导出",
    icon: GitBranch,
  },
] as const;

type SectionId = (typeof navigationItems)[number]["id"];

const staticEmptyStates: Partial<Record<SectionId, string>> = {
  submitted: "目前没有已提交内容。",
  settings: "当前没有可配置项。",
};

type AppProps = {
  draftApi?: DraftApi;
  mediaApi?: MediaApi;
  repositoryApi?: RepositoryApi;
  githubPublishApi?: GitHubPublishApi;
  onboardingApi?: OnboardingApi;
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

export default function App({
  draftApi,
  mediaApi,
  repositoryApi,
  githubPublishApi,
  onboardingApi,
}: AppProps) {
  const activeDraftApi =
    draftApi ?? (isTauri() ? tauriDraftApi : unavailableDraftApi);
  const activeMediaApi =
    mediaApi ?? (isTauri() ? tauriMediaApi : unavailableMediaApi);
  const activeRepositoryApi =
    repositoryApi ??
    (isTauri() ? tauriRepositoryApi : unavailableRepositoryApi);
  const supportsOnboarding = Boolean(onboardingApi) || isTauri();
  const activeOnboardingApi =
    onboardingApi ?? (isTauri() ? tauriOnboardingApi : unavailableOnboardingApi);
  const [activeSection, setActiveSection] = useState<SectionId>("new-content");
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<Draft | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(supportsOnboarding);
  const activeItem =
    navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0];

  useEffect(() => {
    let isCurrent = true;

    takeRecoveryDraftOnce(activeDraftApi)
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
  }, [activeDraftApi]);

  useEffect(() => {
    if (!supportsOnboarding) {
      return;
    }
    let isCurrent = true;
    activeOnboardingApi
      .status()
      .then((next) => {
        if (isCurrent) {
          setOnboardingStatus(next);
          setOnboardingError(null);
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setOnboardingError(describeError(caught));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setOnboardingLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeOnboardingApi, supportsOnboarding]);

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

  function handleOnboardingStatus(next: OnboardingStatus) {
    setOnboardingStatus(next);
    setOnboardingError(null);
    setOnboardingLoading(false);
  }

  if (
    supportsOnboarding &&
    (onboardingLoading || !onboardingStatus?.configured)
  ) {
    return (
      <div className="onboarding-shell">
        <main className="onboarding-main">
          <OnboardingPage
            api={activeOnboardingApi}
            initialStatus={onboardingStatus}
            initialError={
              onboardingError ? `无法初始化首次启动向导：${onboardingError}` : null
            }
            onStatusChange={handleOnboardingStatus}
          />
        </main>
      </div>
    );
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
                最近草稿：
                {inspectDraft(recoveryDraft).fields.titleZh.trim() || "未命名草稿"}
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
            <NewDraftPage api={activeDraftApi} onCreated={handleDraftCreated} />
          ) : activeSection === "drafts" ? (
            <DraftsPage
              api={activeDraftApi}
              mediaApi={activeMediaApi}
              initialDraft={initialDraft}
            />
          ) : activeSection === "repository-export" ? (
            <RepositoryExportPage
              draftApi={activeDraftApi}
              mediaApi={activeMediaApi}
              repositoryApi={activeRepositoryApi}
              githubPublishApi={githubPublishApi}
              initialRepositoryPath={onboardingStatus?.configuration?.repositoryPath}
            />
          ) : activeSection === "settings" && supportsOnboarding ? (
            <OnboardingPage
              api={activeOnboardingApi}
              initialStatus={onboardingStatus}
              initialError={onboardingError}
              title="本地设置与诊断"
              onStatusChange={handleOnboardingStatus}
            />
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
