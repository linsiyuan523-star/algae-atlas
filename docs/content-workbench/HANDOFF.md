# Stage 8B Handoff

- Stage: Stage-08B - Windows Installation Candidate
- Start commit: `4d74c25739ede050d740247c82fce2907da934cd`
- Implementation commit: `c3a0b0023f1783b8e8e54b0d469bfa8a24939ed4`
- Delivery commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the clean Stage-08B branch tip)

## Completed

- Fixed the candidate version at `0.1.0` across the existing Tauri, npm, and Cargo metadata.
- Enabled an unsigned x64 NSIS bundle with current-user installation, downgrade blocking, local pinned tools, and no installer-time network dependency.
- Added a Windows candidate build script that rejects version drift and remaps workspace/user source paths before compiling.
- Generated `content-workbench_0.1.0_x64-setup.exe` with SHA-256 `51227623E19C502233B1954A46E2F2DF0669D7DDA48A07DF2E501B1278A22602`.
- Verified fresh install, application launch, `0.0.9` to `0.1.0` overwrite upgrade, clean exit, default uninstall, and draft retention.

## Not Completed

- Code signing was not performed because no external signing certificate was supplied.
- A separate clean Windows VM was unavailable; installation was rehearsed from a current-user state with no existing product installation or uninstall registration.
- End-to-end content publication acceptance remains owned by Stage 8C.

## Test Summary

- Locked dependency install and production Tauri/NSIS build: PASS.
- Installed application version, window title, launch, and graceful close: PASS.
- Application process tree established TCP connections during launch observation: `0`.
- Upgrade registration changed from `0.0.9` to `0.1.0`: PASS.
- Default uninstall removed installed files and registration while retaining a marker in the default drafts directory: PASS.
- Local-path and credential-shape scans of the final application and installer: PASS.
- Tauri capability has no permissions; packaged CSP allows only local content and Tauri IPC: PASS.

## Known Issues

- The installer is unsigned and may trigger a Windows reputation warning.
- The candidate uses the supported host's installed WebView2 runtime; version `150.0.4078.83` was verified on the rehearsal host.
- The existing Vite chunk-size warning remains non-blocking.

## Next Stage Exact Start

- Start from the clean Stage-08B branch tip after resolving `BRANCH_TIP_AT_DELIVERY`.
- Verify the candidate against `delivery/WINDOWS-CANDIDATE.sha256.txt`.
- Execute `34_Stage8C_端到端验收与文档.md`.

## Do Not Repeat

- Do not use the discarded pre-remap candidate hash `11C3195711483E1D2234419B830A78645794C61C152BAB9C8FFECFDD5BBDCF10`.
- Do not retry the timed-out direct NSIS plugin download; the official Releases API asset and recorded hashes were verified.
- Do not add remote Git, GitHub release, signing credentials, deployment, or production content to this worker.
