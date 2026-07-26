import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  executeMigration,
  nodeFileOps,
  type FileOps,
} from "../../scripts/content-migration/writer";

const FIXED_TIME = "2026-07-22T21:00:00+08:00";
const LATER_TIME = "2026-07-23T09:00:00+08:00";

async function withEmptyRepository(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "algae-migration-write-"));
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

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function recordIds(root: string): Promise<string[]> {
  const entries = await readdir(
    path.join(root, "content", "records", "science-article"),
    { withFileTypes: true },
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function failingFileOpsOnCopy(failingCopy: number): FileOps {
  let copies = 0;
  return {
    ...nodeFileOps,
    async copyFile(source, target, mode) {
      copies += 1;
      if (copies === failingCopy) throw new Error("injected copy failure");
      await nodeFileOps.copyFile(source, target, mode);
    },
  };
}

test("write creates only the planned candidates and deterministic ledger", async () => {
  await withEmptyRepository(async (root) => {
    const result = await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.migrated.length, 3);
    assert.equal(
      result.report.migrated.every(({ status }) => status === "written"),
      true,
    );
    assert.deepEqual(await recordIds(root), [
      "photobioreactor-basics",
      "what-are-algae",
      "why-water-turns-green",
    ]);
    assert.equal(
      await exists(path.join(root, "content", "migration-ledger.json")),
      true,
    );
  });
});

test("second write creates no duplicate and preserves every byte", async () => {
  await withEmptyRepository(async (root) => {
    await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
    });
    const before = await snapshotTree(root);
    const second = await executeMigration({
      mode: "write",
      operationAt: LATER_TIME,
      repositoryRoot: root,
    });
    assert.equal(second.exitCode, 0);
    assert.equal(second.report.migrated.length, 0);
    assert.equal(
      second.report.skipped.filter(({ code }) => code === "TARGET_EXISTS")
        .length,
      3,
    );
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("partial manual target aborts all writes and remains byte-identical", async () => {
  await withEmptyRepository(async (root) => {
    const manualPath = path.join(
      root,
      "content",
      "records",
      "science-article",
      "what-are-algae",
      "record.json",
    );
    await mkdir(path.dirname(manualPath), { recursive: true });
    await writeFile(manualPath, "manual-content\n", "utf8");
    const before = await snapshotTree(root);
    const result = await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
    });
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.report.conflicts.some(
        ({ code }) => code === "PARTIAL_TARGET_CONFLICT",
      ),
    );
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("injected copy failure removes only operation-created paths", async () => {
  await withEmptyRepository(async (root) => {
    const before = await snapshotTree(root);
    const result = await executeMigration(
      { mode: "write", operationAt: FIXED_TIME, repositoryRoot: root },
      failingFileOpsOnCopy(4),
    );
    assert.equal(result.exitCode, 1);
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("report is part of the exclusive write plan", async () => {
  await withEmptyRepository(async (root) => {
    const reportPath = "delivery/migration-reports/write-result.json";
    const result = await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
      reportPath,
    });
    assert.equal(result.exitCode, 0);
    const written = JSON.parse(
      await readFile(path.join(root, ...reportPath.split("/")), "utf8"),
    );
    assert.equal(written.mode, "write");
    assert.equal(
      written.migrated.every(({ status }: { status: string }) => status === "written"),
      true,
    );
  });
});

test("a final report copy failure rolls back candidates and ledger", async () => {
  await withEmptyRepository(async (root) => {
    const before = await snapshotTree(root);
    const result = await executeMigration(
      {
        mode: "write",
        operationAt: FIXED_TIME,
        repositoryRoot: root,
        reportPath: "delivery/migration-reports/failing-report.json",
      },
      failingFileOpsOnCopy(11),
    );
    assert.equal(result.exitCode, 1);
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("an existing report aborts before candidate writes", async () => {
  await withEmptyRepository(async (root) => {
    const reportPath = "delivery/migration-reports/existing.json";
    const absoluteReport = path.join(root, ...reportPath.split("/"));
    await mkdir(path.dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, "manual-report\n", "utf8");
    const before = await snapshotTree(root);
    const result = await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
      reportPath,
    });
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.report.conflicts.some(
        ({ code }) => code === "TARGET_WRITE_CONFLICT",
      ),
    );
    assert.deepEqual(await snapshotTree(root), before);
  });
});
