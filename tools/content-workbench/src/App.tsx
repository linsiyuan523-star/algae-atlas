import { Activity, Archive, FilePlus2, Files, Inbox, Settings } from "lucide-react";
import { useState } from "react";

const APP_VERSION = "0.1.0";

const navigationItems = [
  {
    id: "new-content",
    label: "新建内容",
    emptyState: "当前没有可创建的内容类型。",
    icon: FilePlus2,
  },
  {
    id: "drafts",
    label: "草稿箱",
    emptyState: "目前没有草稿。",
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

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>("new-content");
  const activeItem =
    navigationItems.find((item) => item.id === activeSection) ?? navigationItems[0];

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
          <div className="empty-state" role="status">
            <Inbox aria-hidden="true" size={28} strokeWidth={1.6} />
            <p>{activeItem.emptyState}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
