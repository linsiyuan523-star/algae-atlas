# Security Audit

Status: PASS_WITH_RELEASE_BLOCKERS

Scope: tracked source, desktop capability/CSP configuration, generated
candidate, Git configuration, npm dependency audit, and Rust build controls.

## Passed Controls

- No high-confidence private key, GitHub token, OpenAI token, AWS key, Slack
  token, tracked credential file, or user-home absolute path was found.
- The repository has no configured remote and no tracked real remote-write call.
- The desktop capability is local-only, Windows-only, and declares no Tauri
  permissions. Its CSP restricts production connections to local IPC.
- GitHub publishing defaults to an in-memory mock; integration defaults to
  disabled and the only enabled setting is a test fixture.
- Path traversal, reparse-point, atomic replacement, rollback, and local Git
  mutation boundaries are covered by passing Rust tests.
- The one actual Rust `unsafe` block is the Windows UTF-16 atomic replace FFI;
  it uses owned null-terminated buffers and checks the Win32 result.
- The final installer is unsigned but has matching source/copy SHA-256 and no
  workspace or user path match in a binary scan.

## Release Blockers

1. `npm audit --omit=dev` reports 3 high findings: direct `next` plus
   transitive `postcss` and `sharp`. `next@16.2.11` is the current stable npm
   release, but the advisory range still includes it and offers no compatible
   stable 16.x fix. Keep the PR Draft; do not merge or deploy until an upstream
   fixed release is available or an authorized risk decision is recorded.
2. The Windows candidate is not Authenticode signed. Do not distribute it as a
   production installer until a signing decision and trust path are approved.

## Development Dependency Risk

`npm audit` reports 19 findings overall: 12 high, 6 moderate, and 1 low, with
no critical findings. In addition to the production chain above, direct
build/development packages include `@cloudflare/vite-plugin`, `vite`,
`wrangler`, `drizzle-kit`, and `vinext`. Do not expose development servers to
untrusted networks. No automatic bulk upgrade was applied because the audit
does not provide a safe compatible path for all findings.

## Residual Gap

`cargo-audit` was not preinstalled. A local-only installation attempt was
stopped after 20 minutes while downloading the tool's own locked dependencies;
no executable was installed. Rust lockfile vulnerability scanning remains a
required follow-up before a non-Draft release.

## Required Before Merge Or Deployment

- Re-run npm audit after a patched stable Next release and remove or formally
  accept all production findings.
- Run a completed RustSec audit against `tools/content-workbench/src-tauri/Cargo.lock`.
- Sign the NSIS installer or record an approved unsigned-distribution policy.
- Recheck the final branch head and all required tests after remediation.
