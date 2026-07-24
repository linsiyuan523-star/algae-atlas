# Stage 6B1 Delivery Handoff

- Stage: Stage-06B1 - Localized Detail Preview
- Start commit: `2beb9506506387e6579515d214ae40dd195eca01`
- Feature commit: `048c0b8a722eb18037abfa63c5a90e6fe9784806`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Controlled desktop detail preview integrated into the draft editor with edit/preview switching.
- Chinese/English locale selection and explicit English `missing` state that does not represent an English detail page.
- Localized title, summary, author IDs, time, workflow/review status, and constrained Markdown body rendering.
- React-node Markdown rendering using the existing Tiptap profile; unsafe bodies are blocked and raw HTML is never injected.
- In-order images with alt, caption, attribution, validated preview-source loading, and a stable missing-media fallback.
- Focused preview safety/language tests, draft-editor integration coverage, desktop build, and `1280x800` browser smoke verification.

## Not Completed

- Stage-06A media intake/processing was not merged; current drafts do not provide media metadata or preview sources.
- No mobile preview, section/home cards, layout diagnostics, repository export, Git publishing, remote write, merge, or deployment.

## Test Summary

- Offline npm install: PASS; 662 packages, 0 vulnerabilities.
- Desktop TypeScript/ESLint: PASS; existing missing-pages notice remains informational.
- Desktop Vitest: PASS; 14 files, 127 tests. Focused preview suite: PASS; 2 files, 17 tests.
- Desktop frontend production build: PASS; existing non-fatal large-chunk warning remains.
- Browser visual/interaction smoke at `1280x800`: PASS; no overflow or console errors.
- Git whitespace check: PASS.
- Root website, Rust, and native Tauri suites: NOT RUN; their owned files did not change.

## Known Issues

- Images remain placeholders until Stage-06A provides validated metadata and a resolved preview source.
- Stable author IDs are shown because author display-name records are not part of the draft envelope.
- Existing non-fatal missing-pages and large-chunk notices remain.

## Next Stage Exact Start

- Integrate this clean delivery tip with the clean Stage-06A2 delivery tip.
- Next instruction: `27_Stage6B2_卡片响应式与Stage6检查点.md`.

## Do Not Repeat

- Do not convert repository-relative `Media.filePath` into a browser URL inside the preview.
- Do not bypass the controlled Markdown-to-React renderer or weaken URL validation.
- Scope DraftPages status assertions; save and missing-language states are both status regions.
- Use `npm.cmd`; do not run root website checks until shared Schema or website code changes.
