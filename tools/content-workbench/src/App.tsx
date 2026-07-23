import { FilePlus2 } from "lucide-react";

const APP_VERSION = "0.1.0";

export default function App() {
  return (
    <div className="workbench-shell">
      <header className="workbench-header">
        <h1>藻类团队内容发布工作台</h1>
      </header>
      <main>
        <section className="workbench-intro" aria-labelledby="workbench-description">
          <p id="workbench-description" className="workbench-description">
            用于在本机准备团队网站内容。
          </p>
          <div className="workbench-actions">
            <dl className="version-info">
              <dt>应用版本</dt>
              <dd>{APP_VERSION}</dd>
            </dl>
            <button type="button" disabled>
              <FilePlus2 aria-hidden="true" size={18} strokeWidth={1.8} />
              新建内容
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
