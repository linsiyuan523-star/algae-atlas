# Stage 8C Handoff

- Stage: Stage-08C - End-to-End Acceptance and Documentation
- Start commit: `485088f5058f71128cafa6d5b4d6c316439d037c`
- Acceptance commit: `4980964`
- Documentation commit: `f4656a8`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the clean Stage-08C branch tip)

## Completed

- Added a schema-to-preview acceptance test for Chinese team news with English `missing`.
- Covered cover and body images, a cover thumbnail, author, license, attribution, and Chinese alt text.
- Added a native Git acceptance test that creates one content branch and commit with seven exact files.
- Verified a complete bundle, SHA256 sidecar, and import into a second repository without changing its current branch or HEAD.
- Verified the Stage-08B installer SHA256, installed `0.1.0`, and opened the first-run diagnostics page.
- Added concise quick-start, troubleshooting, backup/recovery, administrator security, and acceptance documents.
- Updated the stale desktop scaffold assertions to the approved Stage-08B NSIS packaging contract.

## Not Completed

- No remote Git, Draft PR, merge, tag, release, signing, or deployment was performed.
- No separate clean Windows VM was available.
- Direct Windows UI automation could read the candidate window but could not inject input; component and native acceptance tests covered the workflow instead.

## Test Summary

- `npm run check`: PASS.
- `npm test` constituent suites after the packaging-guard correction: PASS.
- Schema: 58; desktop Vitest: 159; rendered HTML: 25; IndexNow: 1; all PASS.
- `npm run build:next`: PASS; 97 static pages generated.
- Rust: 37/37 PASS, including the Stage-08C offline Git flow.
- Installer SHA256: PASS (`51227623E19C502233B1954A46E2F2DF0669D7DDA48A07DF2E501B1278A22602`).

## Known Issues

- Candidate is unsigned and may show a Windows reputation warning.
- Actual first-run diagnostics reported MSVC and WebView2 as missing although Rust builds and the WebView window work on this host.
- The Windows automation runtime rejected click and value injection after returning the complete accessibility tree.
- Existing Vite chunk-size warning remains non-blocking.

## Next Stage Exact Start

- Start from the clean Stage-08C branch tip recorded in the USB `MANIFEST.txt`.
- Verify and import `stage-08c-acceptance-v1.bundle` under a namespaced local ref.
- Execute `35_最终集成主机_汇总与DraftPR.md` only on the authorized integration host.

## Do Not Repeat

- Do not retry the rejected Computer Use click or `set_value` paths on this worker.
- Do not restore the obsolete `bundle.active=false` scaffold expectation.
- Do not use a level-one heading in managed Markdown bodies.
- Do not push, merge, sign, release, or deploy from this worker.
