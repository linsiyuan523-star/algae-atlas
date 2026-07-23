const navigationItems = ["Library", "Drafts", "Validation"];

export default function App() {
  return (
    <div className="workbench-shell">
      <header className="workbench-header">
        <div>
          <p className="product-kicker">Algae Atlas</p>
          <h1>Algae Atlas Content Workbench</h1>
        </div>
        <p className="local-status" role="status">
          Local / Offline-ready
        </p>
      </header>
      <nav aria-label="Workbench sections">
        <ul>
          {navigationItems.map((item) => (
            <li key={item}>
              <button type="button">{item}</button>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <section aria-labelledby="workspace-heading">
          <h2 id="workspace-heading">Content workspace</h2>
          <p>Select a local content record to begin.</p>
        </section>
      </main>
    </div>
  );
}
