# Repository audit: 2026-07-20

This record captures the evidence and irreversible-action checks used for the 2026-07-20 repository cleanup. Times are Asia/Shanghai unless noted.

## Initial branch audit

| Branch | Latest SHA | Last update | Relative to initial `main` | Unique commits | Pull Request | Production relation | Recommendation |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `main` | `cce4f1a5f640a6e06009e47524f36ea2db838c8d` | 2026-07-10 16:22 | Audit base | 0 | Base of PR #1 | Not the initial production SHA | 保留 |
| `agent/team-website` | `e2e16b0b49fceafa9e0827d7e6c1641ef09c4cb1` | 2026-07-13 09:33 | Ahead 7, behind 0 | 7 | PR #1, initially open Draft | Initial production SHA | 合并后删除 |

The recommendation was based on commit, Pull Request and production evidence, not the branch name.

## Production evidence

Initial state:

- `current`: `/srv/algae-atlas/releases/20260720064250-pr1-e2e16b0`
- production SHA: `e2e16b0b49fceafa9e0827d7e6c1641ef09c4cb1`
- initial GitHub `main`: `cce4f1a5f640a6e06009e47524f36ea2db838c8d`
- service: active and running

After PR #1 was validated and squash merged:

- GitHub `main`: `66a696dff91e6dd60b5ebbad21aa6dcc4758750c`
- `current`: `/srv/algae-atlas/releases/20260720082037`
- `current/.release-sha`: `66a696dff91e6dd60b5ebbad21aa6dcc4758750c`
- `previous`: `/srv/algae-atlas/releases/20260720064250-pr1-e2e16b0`
- `previous/.release-sha`: `e2e16b0b49fceafa9e0827d7e6c1641ef09c4cb1`
- failed deployment marker: absent
- service and local application: active; `/zh` and `/en` returned 200
- public routes: root 302 to `/zh`; `/zh` and `/en` returned 200; www `/zh` returned 301 to the root domain path

## Pull Requests and branch action

- PR #1 was initially open, mergeable and Draft at head `e2e16b0`.
- Validation passed: TypeScript/ESLint, 24 rendered tests and the native Next.js production build with 97 generated pages.
- PR #1 was marked ready and squash merged as `66a696d`.
- Because squash merge left the original seven commits outside the direct ancestry of `main`, the branch tip was preserved by annotated tag `archive/pre-main-algae-team-site-2026-07-20`.
- The production server was redeployed from `main` and verified before `agent/team-website` was deleted.
- The deleted branch is recoverable from PR #1 and the archive tag.

## Tags and Release

| Tag | Type | Target | Purpose |
| --- | --- | --- | --- |
| `v1.0.0` | annotated | `66a696dff91e6dd60b5ebbad21aa6dcc4758750c` | First verified production release |
| `archive/pre-main-algae-team-site-2026-07-20` | annotated | `e2e16b0b49fceafa9e0827d7e6c1641ef09c4cb1` | Restore the pre-squash PR #1 history |

Release: https://github.com/linsiyuan523-star/algae-atlas/releases/tag/v1.0.0

## File audit

The initial `main` snapshot contained 54 tracked files totaling 9,060,503 bytes. Audit results:

- no tracked `node_modules`, `.next`, `dist`, `.wrangler`, coverage, log, temporary archive or secret environment file was present;
- `.env.example` was retained;
- no duplicate SHA-256 hashes were found among the seven files in `public/images`;
- all current referenced images and image-credit records were retained;
- `bloom.jpg`, `diatoms.jpg` and `photobioreactor.jpg` were not mechanically deleted because their scientific-asset purpose and licence history require confirmation;
- three unreferenced generic Next.js starter SVG files (`file.svg`, `globe.svg`, `window.svg`) were removed, totaling 1,811 bytes; they remain recoverable from Git history and `v1.0.0`;
- compatibility files under `build/`, `db/`, `drizzle/`, `examples/`, `worker/` and `.openai/` were retained because current tests or hosting integrations still depend on that structure.

No Git history rewrite, force push, Git LFS migration or bulk wildcard deletion was performed.

## Deferred image performance

Image optimization was not performed during repository cleanup. The measured follow-up is tracked in:

- https://github.com/linsiyuan523-star/algae-atlas/issues/2

The issue covers image dimensions and bytes, hero and ordinary image usage, responsive delivery, WebP/AVIF, Nginx caching, public bandwidth, LCP and before/after comparisons.

## Repository settings observed

At the initial audit:

- default branch: `main`;
- squash merge: enabled;
- merge commits: enabled;
- rebase merge: enabled;
- automatic head-branch deletion: disabled;
- `main` protection: not enabled.

Recommended final settings are squash merge, automatic head-branch deletion, no force push or deletion of `main`, Pull Request-only changes, up-to-date branches and required checks once a stable CI workflow exists. With one maintainer, do not require an approval from a second person.
