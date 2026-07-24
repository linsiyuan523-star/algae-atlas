# Acceptance Report

Status: PASS_WITH_LIMITATIONS

## Accepted Behavior

- The shared schema supports content-type-specific fields and optional English.
- The website loader keeps legacy selectors active while formal records remain
  available for reviewed migration.
- The three legacy science-article candidates remain bilingual drafts; no public
  source switch occurred.
- Desktop forms, autosave/recovery, rich-text cleanup, media intake, responsive
  preview, local Git commit, and offline Bundle export/import are covered by
  passing desktop tests.
- The Stage 8C acceptance scenario covers Chinese team news, missing English,
  cover/body images, rights metadata, desktop/mobile preview, native local
  commit, and clean-repository Bundle import.

## Verification Evidence

- Schema tests: 58 passed.
- Content loader tests: 10 passed.
- Migration tests: 15 passed.
- Desktop scaffold: 1 passed.
- Desktop Vitest: 23 files, 159 passed.
- Rendered website checks: 25 passed.
- IndexNow check: 1 passed.
- Rust tests: 37 passed.
- Next production build: 97 static pages generated.
- Tauri development startup created a responsive local application window.
- Final integration Bundle imported with exact head and tree equality into a
  no-remote test repository without moving its checked-out baseline `main`.

## Windows Candidate

- Candidate: `content-workbench_0.1.0_x64-setup.exe`
- SHA-256: `8682A7DA94E64A5DD915617ABC2DAF6610B8939D81D9E7136BFE35D184B9E6F7`
- Build target: x64 NSIS, current-user install mode.
- Candidate signing: not signed.

An existing current-user 0.1.0 installation was detected and deliberately left
unchanged. Stage 8B/8C already covered install, upgrade, launch, uninstall, and
data retention; a clean-machine rehearsal of this final hash remains required
before a non-Draft release.

## Limitations

- The installer is unsigned.
- No clean Windows VM was available.
- Windows UI automation previously inspected the application but could not
  inject click or value input; component and native tests cover those flows.
- First-run diagnostics may falsely report MSVC and WebView2 missing on this
  host even though Rust builds and the desktop window run.
- Production npm audit findings and the incomplete RustSec scan block merge and
  deployment; see `SECURITY-AUDIT.md`.
