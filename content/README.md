# Structured content store

This directory follows the version 1 repository contract in
`docs/content-workbench/CONTENT-SCHEMA.md` and the Stage-02 loader rules in
`docs/content-workbench/CONTENT-LOADER.md`.

Real public records are added only by a reviewed migration stage. Stage 2 keeps
all production collections on the legacy TypeScript source and uses fictional
fixtures under `tests/fixtures/` to exercise the file loader.

The fixed layout is:

~~~text
content/records/<content-type>/<stable-id>/record.json
content/records/<content-type>/<stable-id>/zh.md
content/records/<content-type>/<stable-id>/en.md
content/authors/<stable-id>.json
content/media/<stable-id>.json
~~~

Record, author, and media directories contain only reviewed repository data.
Files use UTF-8 without BOM, LF line endings, and one final newline.
