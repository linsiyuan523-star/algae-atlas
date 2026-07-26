# Security Audit

Status: BLOCKED

- Recorded: `2026-07-25T10:47:47+08:00`
- Audited implementation head: `af8ecd4cdccf6f689794887d18f432ff17f8983e`
- Lockfiles: `package-lock.json` and
  `tools/content-workbench/src-tauri/Cargo.lock`
- Risk acceptance by Codex: none

## npm Production Audit

`npm audit --omit=dev --json` reports 0 critical, 3 high, 0 moderate,
and 0 low findings.

| Package | Installed | Advisory | Runtime relevance | Compatible fix |
| --- | --- | --- | --- | --- |
| `next` | 16.2.11 | Aggregate high through `postcss` and `sharp` | Direct production website framework | No. `npm view next version` is still 16.2.11. npm suggests 14.2.35 with `isSemVerMajor: true`, which is a breaking downgrade. |
| `postcss` | 8.4.31 | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 | Transitive Next production dependency; the affected paths process CSS/source maps during builds | No compatible stable Next 16 release currently selects a fixed `postcss` (>8.5.17). |
| `sharp` | 0.34.5 | GHSA-f88m-g3jw-g9cj (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591) | Transitive Next production image dependency and potentially server-runtime relevant | Fixed in `sharp` 0.35.0, but no compatible stable Next 16 release currently selects it. |

The production audit remains a merge blocker. No downgrade, forced audit fix,
or unsupported override was applied.

## npm Full Audit

Before remediation, `npm audit --json` reported 20 findings: 13 high,
6 moderate, and 1 low. Exact compatible upgrades were applied for
`@cloudflare/vite-plugin` 1.47.0, `wrangler` 4.114.0, root Vite 8.1.5,
and the React/React DOM/react-server-dom-webpack 19.2.8 patch set. The desktop
workspace React pair was aligned to 19.2.8 to prevent duplicate React runtimes.

After remediation, the full audit reports 11 findings: 6 high, 4 moderate,
1 low, and 0 critical. Remaining findings are the production Next chain plus
development/build transitive packages. `drizzle-kit` has no compatible fix;
npm suggests the breaking downgrade 0.18.1. No `npm audit fix --force` was run.

## RustSec Audit

`cargo-audit` 0.22.2 scanned 474 dependencies using advisory database commit
`1abf7a8c1822223a38e99f652bc232071c44a86d`.

- Vulnerabilities: 0.
- Informational warnings: 17.
- Unsound warning: `glib` 0.18.5, RUSTSEC-2024-0429. It is patched in
  `glib >=0.20.0`; the current Tauri/Wry GTK3 chain cannot take that upgrade as
  a compatible direct bump.
- Unmaintained GTK3 warnings: `atk`, `atk-sys`, `gdk`, `gdk-sys`,
  `gdkwayland-sys`, `gdkx11`, `gdkx11-sys`, `gtk`, `gtk-sys`, and
  `gtk3-macros` 0.18.2 (RUSTSEC-2024-0411 through RUSTSEC-2024-0420 as
  applicable). No patched versions are listed.
- Other unmaintained warnings: `proc-macro-error` 1.0.4
  (RUSTSEC-2024-0370), and `unic-char-property`, `unic-char-range`,
  `unic-common`, `unic-ucd-ident`, and `unic-ucd-version` 0.9.0
  (RUSTSEC-2025-0075, 0080, 0081, 0098, and 0100). No patched versions are
  listed.

The warning chain is pulled by Tauri/Wry for GTK Linux targets. `cargo tree`
shows none of these crates for `x86_64-pc-windows-msvc`, so they are not linked
into the Windows candidate. They remain in the cross-platform lockfile and are
not silently accepted; RUSTSEC-2024-0429 requires remediation or an owner risk
decision before this gate can be treated as passed.

## Signing

No code-signing certificate with a private key exists in either the current
user or local machine certificate store. `Get-AuthenticodeSignature` reports
`NotSigned` for the NSIS candidate. Public unsigned distribution therefore
carries Windows SmartScreen and source-trust risk. The two owner choices are
recorded in `docs/content-workbench/INSTALLER-SIGNING-DECISION.md`; Codex did
not choose either option.

## Required Resolution

1. Upgrade to a stable compatible Next release that clears the production
   audit, or obtain a written repository-owner risk acceptance.
2. Remove the RustSec unsound warning through a supported dependency upgrade,
   or obtain a written repository-owner risk acceptance.
3. Record the repository owner's installer signing/distribution choice.
