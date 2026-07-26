import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runContentValidationCli } from "../../scripts/validate-content";

test("repository mode reports relative paths without leaking the root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "algae-repository-validation-"));
  const recordDirectory = path.join(
    root,
    "content",
    "records",
    "science-article",
    "broken-record",
  );
  await Promise.all([
    mkdir(recordDirectory, { recursive: true }),
    mkdir(path.join(root, "content", "authors"), { recursive: true }),
    mkdir(path.join(root, "content", "media"), { recursive: true }),
  ]);
  await writeFile(path.join(recordDirectory, "record.json"), "{invalid\n", "utf8");
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const exitCode = await runContentValidationCli(
      [],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
      root,
    );
    const diagnostics = [...stdout, ...stderr].join("\n");
    assert.equal(exitCode, 1);
    assert.match(
      diagnostics,
      /content\/records\/science-article\/broken-record\/record\.json/,
    );
    assert.equal(diagnostics.includes(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
