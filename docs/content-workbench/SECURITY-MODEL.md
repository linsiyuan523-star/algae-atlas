# Security Model

## 1. Security objective

The workbench turns untrusted local inputs into reviewable repository changes without gaining authority over GitHub, production, unrelated files, or secrets. Safety depends on least privilege, explicit operator confirmation, shared validation, deterministic files, and ordinary Git recovery.

The desktop is not a security boundary for an already compromised Windows account. It is designed to prevent accidental scope expansion and to make malicious or malformed content fail closed.

## 2. Protected assets

- repository source and history;
- unrelated dirty/untracked operator files;
- content integrity, scientific boundaries, and review evidence;
- image rights, attribution, consent, and private metadata;
- author/member privacy and sensitive field/sample locations;
- credentials, environment values, private keys, certificates, and consent documents;
- route/navigation/site structure and deployment configuration;
- production availability and main-only release provenance.

## 3. Actors and roles

| Role | Allowed | Not allowed |
| --- | --- | --- |
| Content editor | Create/edit drafts, run validation, prepare an allowlisted local diff | Approve own protected content by implication, access arbitrary files, publish remotely |
| Reviewer | Record review decision for an assigned locale/type | Invent evidence, expose private review documents, bypass required gates |
| Operator | Select approved worktree, confirm paths/diff/local commit, move verified bundles | Use the desktop as a remote/deployment console |
| Integration operator | Verify/import bundles, resolve documented conflicts, run all tests | Enable remote or push without separate explicit approval |
| Website build | Read eligible committed records and render public output | Read drafts as public, call desktop/network/database implicitly |
| Production operator | Existing main-only deploy/rollback workflow | Accept a stage branch as production source |

The initial application does not implement accounts or cloud authentication. Role evidence is stored as public author/reviewer IDs plus operator process, not as passwords in the repository.

## 4. Threat model

| Threat | Example | Required mitigation |
| --- | --- | --- |
| Path traversal | Record ID or media path contains `..`, drive letter, ADS, encoded separator | Canonicalize against an approved root; fixed derived paths; reject traversal before I/O. |
| Junction/symlink escape | Managed directory points outside the worktree | Inspect every path component/reparse point and refuse escaped or unresolved targets. |
| Arbitrary process execution | Markdown or title becomes a shell/Git argument | No shell interpolation; argument-vector APIs; fixed commands and allowlists. |
| Content injection | Script, raw HTML, unsafe URL, MDX import | Safe Markdown profile; sanitize render; reject executable constructs and schemes. |
| Malicious media | Renamed executable, polyglot, decompression bomb, SVG script | Signature/MIME/dimension/byte limits; raster allowlist initially; normalized public copy. |
| Privacy leak | GPS EXIF, private contact, exact sensitive station, consent scan | Remove private metadata; schema exclusions; disclosure/location gates; no evidence files in Git. |
| False authorship/review | Free-form name marks machine translation reviewed | Stable approved IDs; enforced state transition and human verification field. |
| Git scope escape | `git add -A`, dirty worktree, malicious alias/hook | Exact paths, controlled config, staged-diff recheck, no alias expansion, stop on unrelated changes. |
| Remote write | Added origin or push from desktop | Remote must be absent on workers; deny network Git verbs and credential operations. |
| Protected branch modification | Commit on main/integration | Branch denylist and expected-stage branch check before save/publish. |
| Silent fallback | Invalid records cause legacy data to render instead | Explicit collection source; migrated invalid data fails build. |
| Supply-chain change | Desktop self-updates from unknown source | No silent updater initially; pinned lockfiles/toolchains; official sources and artifact hashes. |
| Log leakage | Errors print environment or full private draft | Structured redacted logs; minimal fields; no environment dump. |
| Data loss | Partial multi-file write or cleanup | Transaction plan, same-directory temp, atomic replace, no reset/clean/delete of unknown files. |
| Stale state | Sleep, power loss, VPN/network change | Re-read repository, paths, branch, HEAD, remotes, status, and proposed diff before continuing. |

## 5. Filesystem boundary

The operator chooses one existing worktree. The privileged layer resolves:

1. the absolute canonical worktree root;
2. `git rev-parse --show-toplevel`;
3. worktree registration in the repository hub;
4. current stage branch and expected base;
5. every managed target relative to the canonical root.

Write allowlist:

- `content/records/**`;
- `content/authors/*.json`;
- `content/media/*.json`;
- `public/images/uploads/YYYY/MM/*`;
- explicitly approved delivery summaries when a stage requires them.

The first implementation must not expose a generic “write file” command. Schema, navigation, routes, components, CSS, configuration, package files, legacy content, existing images, `.git`, and paths outside the allowlist are read-only to the workbench.

Additional controls:

- reject reserved Windows device names, trailing dots/spaces, control characters, colon streams, UNC paths, and case-colliding IDs;
- do not follow reparse points for managed targets;
- create temporary files in the same approved directory with unpredictable operation IDs;
- use create-new semantics and atomic replacement;
- verify canonical target again immediately before replace;
- set conservative file permissions inherited from the repository; do not broaden ACLs;
- remove only temporary files created and tracked by the same operation.

## 6. Markdown and link safety

- Parse as data; do not execute MDX, JSX, imports, directives, templates, raw HTML, or embedded forms.
- Reject scripts, style, iframe, object, embed, SVG, event handlers, and unsafe URL schemes.
- Default external URL scheme is HTTPS.
- Internal links are generated from validated record IDs/routes rather than arbitrary path strings.
- Add `rel="noopener noreferrer"` to external links opened in a new context.
- Apply the same sanitizer in preview and website rendering.
- Test stored-XSS payloads, encoded protocols, Unicode confusables, malformed Markdown, and oversized nesting.

Content safety also includes scientific integrity: prohibited hazardous parameters, unsupported claims, invented projects/people, and warning-like interpretations are validation/review concerns even when they are not software exploits.

## 7. Media safety

Initial uploads accept a narrow raster allowlist selected by the media stage. SVG, HTML, PDF, archives, video, and executable formats require separate designs.

Processing order:

1. read with a strict maximum byte count;
2. inspect magic bytes and decode with bounded dimensions/pixels;
3. reject extension/MIME/signature mismatch and malformed/truncated input;
4. normalize to an approved output format;
5. remove GPS, device IDs, thumbnails, comments, and unnecessary EXIF/IPTC/XMP;
6. calculate SHA-256 on the exact public bytes;
7. collect attribution, license, usage scope, identifiable-person flag, and consent state;
8. require alt text for each published locale;
9. write public bytes and media JSON in one transaction plan.

The original file and consent document remain outside Git. A non-secret reference label may connect the public metadata to the operator's private records.

## 8. Privacy and disclosure

Repository schemas intentionally exclude:

- passwords, tokens, SSH/private signing keys, recovery codes, real environment files;
- personal phone, personal email by default, student/employee number, identity document, signature;
- home/private address, schedule, health/biometric information;
- consent forms or internal HR/member records;
- exact sensitive field sites, unpublished sample coordinates, embargoed partner/data details.

A public contact channel may be added only as approved site content through its designated code/content process. Team-member and collaboration publication requires explicit public-scope state. Coastal observations default to hidden or generalized location.

Data minimization beats redaction after the fact: fields not required for the public site are not part of the schema.

## 9. Review and translation integrity

- Reviewer selection uses approved author IDs.
- A reviewer cannot be inferred from the current Windows username.
- `reviewedAt` and version are required for published protected content.
- Machine-assisted text records its origin and a human verifier.
- The application never sends text to an online translation service unless a later stage obtains explicit operator authorization and adds a separate privacy assessment.
- A substantive locale edit invalidates that locale's approval.
- English review never controls Chinese availability, and vice versa.
- Review metadata is evidence of content review, not laboratory access, project approval, collaboration approval, or legal authorization.

## 10. Git controls

Before any local commit, require:

- canonical expected worktree and repository hub;
- stage branch not equal to `main`, `integration/main`, or another protected branch;
- expected base/ancestor;
- no remote for a worker;
- no merge/rebase/cherry-pick/revert/bisect operation in progress;
- no unrelated staged, modified, deleted, or untracked files;
- proposed paths entirely allowlisted;
- repository-wide content validation pass.

Commit flow:

1. show summary and exact diff;
2. receive explicit operator confirmation;
3. stage with `git add -- <exact paths>`;
4. list staged names and reject any unexpected path;
5. run directly relevant tests;
6. commit with a validated message;
7. verify HEAD advanced once and worktree is clean.

Disallowed commands include reset, clean, checkout/restore over user files, stash as cleanup, remote modification, fetch/pull/push, merge protected branches, tag, release, and deployment.

Repository-local hooks and filters are treated as untrusted. A later implementation must decide whether to disable hooks for its controlled commit or audit them and run them visibly; it may not assume they are safe.

## 11. Tauri least privilege

- Expose named commands such as `inspect_worktree`, `read_record`, `validate_plan`, `save_draft`, and `prepare_local_commit`; no generic shell or filesystem command.
- Limit filesystem scope to the active canonical worktree and operation-specific paths.
- Disable arbitrary URL opening; allow only validated HTTPS sources after confirmation.
- Use a restrictive content security policy and no remote UI code.
- Keep network capability off for core editing/publishing.
- Do not store Git credentials, production secrets, or private keys in application settings.
- Treat frontend messages as untrusted and validate again in Rust/privileged services.
- Pin the Rust toolchain and audit Tauri capabilities during packaging.

## 12. Secrets and logs

- Never read real `.env` files for content editing.
- Website builds consume existing environment through the established process; the workbench does not display it.
- Logs include operation ID, issue codes, record/media IDs, path relative to worktree, branch/SHA, and pass/fail.
- Logs exclude file bodies by default, environment dumps, credentials, private contact details, EXIF, and consent evidence.
- Error messages redact URL credentials and absolute private paths outside the approved worktree.
- Test fixtures use unmistakably fake values.

If a secret is discovered, stop, avoid copying it into reports, notify the operator, rotate through the responsible system, and handle any history remediation as a separately approved task.

## 13. Offline and network policy

Core edit, validation, preview, local commit, and bundle creation work offline. Network access is not required and cannot be triggered by record content.

Allowed later network actions, each outside the desktop core and separately authorized, may include official dependency installation during development and the final GitHub/production workflows. No third-party mirrors, content scraping, analytics upload, or automatic telemetry is part of the initial product.

## 14. Failure and power-loss behavior

After application restart, sleep, or power/network change:

- discard stale in-memory authorization;
- rescan canonical paths, branch, HEAD, remotes, status, and operation markers;
- detect operation-created temporary files and offer only exact safe recovery;
- never auto-commit or resume a prior publication confirmation;
- re-hash media and revalidate the full plan.

An unchanged external state is not evidence that a prior operation completed.

## 15. Security acceptance gates

Security work is incomplete until tests prove:

- traversal, Windows path edge cases, junction/symlink escape, and case collisions fail;
- malformed/active Markdown and unsafe URLs cannot execute;
- malicious/oversized/mismatched media cannot be published;
- missing rights, consent, alt text, review, or disclosure blocks eligibility;
- machine-assisted English cannot publish without human verification;
- dirty/untracked/staged unrelated files remain untouched;
- protected branches and any worker remote block publication;
- exact Git staging cannot include package, configuration, code, or existing-image paths;
- failure injection leaves previous files/index intact;
- logs and installer artifacts contain no secrets;
- packaged Tauri capabilities match the documented allowlist.
