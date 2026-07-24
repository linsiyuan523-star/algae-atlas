# Integrated Content Workbench Handoff

The final integration joins the website content repository and migration path
with the Windows desktop authoring workflow. The integration branch is
`feature/algae-content-workbench`; remote publication remains pending approval.

## Included

- Schema-version-1 records for 11 content types and optional English content.
- Repository loader and legacy/record source routing.
- Default-dry-run, no-overwrite migration tooling with deterministic ledger.
- Tauri 2 desktop forms, autosave/recovery, rich text, media intake, responsive preview, local Git commit, and offline Bundle export/import.
- First-run diagnostics, Windows packaging, operator documentation, and offline acceptance coverage.

## Migration State

The three migrated science articles are preservation drafts only. Their public
selectors remain `legacy`, and no publication permission is implied. Complete
author/reviewer evidence, translation provenance, body review, image rights,
and page-level parity approval are still required before any source switch.
See `MIGRATION-TOOL.md` and `delivery/migration-reports/stage-03-science-articles.json`.

## Operational Boundaries

- Chinese content may publish independently; absent English produces no English detail page.
- Managed images target `public/images/uploads/YYYY/MM/`.
- Navigation, routes, theme, footer, and server configuration remain code-owned.
- Desktop GitHub integration is disabled by default; the shipped implementation uses a mock backend unless explicitly replaced and authorized.
- The Windows candidate is unsigned and requires an available WebView2 runtime.

## Operator References

- `QUICKSTART.md`
- `TROUBLESHOOTING.md`
- `BACKUP-RECOVERY.md`
- `ADMIN-SECURITY.md`
- `ACCEPTANCE-REPORT.md`
- `MIGRATION-TOOL.md`

Final integration evidence is recorded in `FINAL-INTEGRATION-REPORT.md`,
`SECURITY-AUDIT.md`, `ACCEPTANCE-REPORT.md`, and
`RELEASE-CANDIDATE-NOTES.md` at the repository root.
