import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runContentValidationCli } from "../../../scripts/validate-content";
import {
  invalidRecordFixtures,
  validRecordFixtures,
} from "../fixtures/index";

test("CLI 校验有效和无效 record.json", async () => {
  const directory = await mkdtemp(join(tmpdir(), "algae-schema-cli-"));
  const validPath = join(directory, "valid.json");
  const invalidPath = join(directory, "invalid.json");
  const repositoryRoot = join(directory, "repository");
  await Promise.all(
    ["records", "authors", "media"].map((child) =>
      mkdir(join(repositoryRoot, "content", child), { recursive: true }),
    ),
  );
  await writeFile(
    validPath,
    JSON.stringify(validRecordFixtures["science-article"]),
    "utf8",
  );
  await writeFile(
    invalidPath,
    JSON.stringify(invalidRecordFixtures["science-article"]),
    "utf8",
  );

  const stdout: string[] = [];
  const stderr: string[] = [];
  const io = {
    stdout: (message: string) => stdout.push(message),
    stderr: (message: string) => stderr.push(message),
  };

  try {
    assert.equal(await runContentValidationCli([validPath], io), 0);
    assert.ok(stdout.some((line) => line.includes("PASS")));

    assert.equal(await runContentValidationCli([invalidPath], io), 1);
    assert.ok(stderr.some((line) => line.includes("locales.zh.fields.topic")));
    stdout.length = 0;
    stderr.length = 0;
    assert.equal(await runContentValidationCli([], io, repositoryRoot), 0);
    assert.ok(stdout.some((line) => line.includes("PASS")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
