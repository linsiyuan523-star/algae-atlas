# Stage 6A1 Delivery Handoff

- Stage: Stage-06A1 - Image Intake and Attribution Metadata
- Start commit: `2beb9506506387e6579515d214ae40dd195eca01`
- Feature commit: `fc437a7552ef439708ac29d726dfc6c8b7d4801e`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the delivery bundle head)

## Completed

- Local image selection and drag/drop intake for cover, body, gallery, and portrait images.
- Safe app-data staging with UUID v4 filenames, file type/dimension inspection, SHA-256 metadata, and fixed upload path previews.
- Attribution, license, rights, consent, Chinese/English alt, and caption metadata UI and persistence.
- Publication-candidate blocks for missing license, non-public rights, pending identifiable-person consent, missing alt text, or unsaved metadata.
- Draft recovery reconnects staged media references after an interrupted autosave.

## Not Completed

- No conversion, EXIF cleanup, duplicate hash comparison, media repository export, Git publication, remote write, merge, release, or deployment.

## Test Summary

- Focused Vitest: PASS; 4 files, 24 tests.
- Rust media tests: PASS; 5 tests.
- Desktop check, Rust format/Clippy, frontend build, visual responsive review, and Git whitespace check: PASS.

## Known Issues

- Existing missing-pages and Vite large-chunk notices remain non-blocking.

## Next Stage Exact Start

- `25_Stage6A2_图片处理与隐私.md`

## Do Not Repeat

- Do not rerun root website checks without a shared Schema or website change.
- Do not add conversion, EXIF cleanup, or duplicate-image hashing to Stage-06A1.
