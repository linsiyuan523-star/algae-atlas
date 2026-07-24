# Stage 8B Delivery Handoff

- Stage: Stage-08B - Windows Installation Candidate
- Start commit: `4d74c25739ede050d740247c82fce2907da934cd`
- Implementation commit: `c3a0b0023f1783b8e8e54b0d469bfa8a24939ed4`
- Delivery commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the clean Stage-08B branch tip)

## Completed

- Built unsigned x64 NSIS candidate `content-workbench_0.1.0_x64-setup.exe`.
- Recorded build environment and SHA-256 in the delivery directory.
- Passed install, launch, overwrite upgrade, uninstall, data-retention, local-path, credential-pattern, capability, and CSP checks.

## Not Completed

- No signing certificate was supplied or used.
- No separate clean Windows VM rehearsal was available.
- No GitHub release, remote operation, deployment, or Stage 8C acceptance was performed.

## Test Summary

- Candidate SHA-256: `51227623E19C502233B1954A46E2F2DF0669D7DDA48A07DF2E501B1278A22602`.
- Fresh current-user install, `0.0.9` to `0.1.0` upgrade, launch, graceful close, and uninstall: PASS.
- Default draft retention and zero established application TCP connections during launch observation: PASS.

## Known Issues

- Candidate is unsigned.
- Installed WebView2 is a prerequisite; rehearsal host version was `150.0.4078.83`.
- Existing Vite chunk-size warning remains non-blocking.

## Next Stage Exact Start

- Verify the candidate SHA-256 and execute `34_Stage8C_端到端验收与文档.md` from the clean Stage-08B branch tip.

## Do Not Repeat

- Do not use the discarded pre-remap candidate hash or retry the failed direct GitHub plugin download.
- Do not add a remote, push, create a release, sign, merge, or deploy on this worker.
