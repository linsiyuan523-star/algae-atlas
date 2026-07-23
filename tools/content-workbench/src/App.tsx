import { Activity, Archive, FilePlus2, Files, Inbox, Settings } from "lucide-react";
import { useState } from "react";
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

export default function App({ draftApi = tauriDraftApi }: AppProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("new-content");
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const activeItem =
    navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0];

  function handleDraftCreated(draft: Draft) {
    setInitialDraft(draft);
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
