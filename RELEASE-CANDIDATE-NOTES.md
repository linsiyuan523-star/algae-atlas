# Release Candidate Notes

Status: BLOCKED

- Product: Algae Team Content Publishing Workbench
- Version: 0.1.0
- Audited implementation head: `af8ecd4cdccf6f689794887d18f432ff17f8983e`
- Target: Windows x64, NSIS current-user installer
- Pre-report candidate:
  `tools/content-workbench/src-tauri/target/release/bundle/nsis/藻类团队内容发布工作台_0.1.0_x64-setup.exe`
- Pre-report SHA-256:
  `3A737A83DA4606ADEDF351CD8E6C651D1E7AE81A48741FBA1593AAC35D25951F`
- Pre-report size: 2,626,740 bytes
- Signature: `NotSigned`
- Runtime prerequisite: installed WebView2 runtime

This is an acceptance-only unsigned candidate. It was not uploaded as a formal
release, installed, signed, released, or deployed. NSIS rebuilds were not
byte-reproducible, so a fresh final-head build must carry its own hash and must
not reuse the value above as release evidence.

Release remains blocked by:

1. Three high production npm findings in the Next/PostCSS/Sharp chain.
2. RustSec RUSTSEC-2024-0429 (`glib` 0.18.5, unsound) plus 16 unmaintained
   transitive warnings.
3. No valid Authenticode certificate and no repository-owner unsigned
   internal-distribution approval.
4. Pending GitHub Actions results for the newly added PR workflow.

Do not mark the PR Ready, merge it, create a GitHub Release, publish the EXE,
or deploy the website from this state.
