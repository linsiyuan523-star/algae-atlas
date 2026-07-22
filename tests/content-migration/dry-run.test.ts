import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildMigrationPlan } from "../../scripts/content-migration/planner";

async function withEmptyRepository(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "algae-migration-dry-run-"));
  await Promise.all(
    ["records", "authors", "media"].map((directory) =>
      mkdir(path.join(root, "content", directory), { recursive: true }),
    ),
  );
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function snapshotTree(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        snapshot[`${relative}/`] = "directory";
        await visit(absolute);
      } else {
        snapshot[relative] = (await readFile(absolute)).toString("base64");
      }
    }
  }
  await visit(root);
  return snapshot;
}

test("default dry-run reports candidates and writes nothing", async () => {
  await withEmptyRepository(async (root) => {
    const before = await snapshotTree(root);
    const plan = await buildMigrationPlan({
      mode: "dry-run",
      operationAt: "2026-07-22T21:00:00+08:00",
      repositoryRoot: root,
    });
    const after = await snapshotTree(root);
    assert.deepEqual(after, before);
    assert.equal(plan.files.length, 10);
    assert.equal(plan.report.migrated.length, 3);
    assert.ok(
      plan.report.skipped.some(
        ({ code }) => code === "MANUAL_CLASSIFICATION_REQUIRED",
      ),
    );
    assert.ok(
      plan.report.skipped.some(
        ({ code }) => code === "EMPTY_COLLECTION_PRESERVED",
      ),
    );
    assert.equal(plan.report.conflicts.length, 0);
    assert.equal(plan.report.validationIssues.length, 0);
    assert.equal(plan.report.missingFields.length, 6);
    assert.equal(plan.report.manualReview.length, 15);
    assert.equal(plan.report.missingImageAttribution.length, 3);
  });
});
