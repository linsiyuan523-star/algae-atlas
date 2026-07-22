import assert from "node:assert/strict";
import test from "node:test";

import { runMigrationCli } from "../../scripts/content-migration/cli";
import type { MigrationPlan } from "../../scripts/content-migration/types";

const EMPTY_PLAN: MigrationPlan = {
  files: [],
  report: {
    reportVersion: 1,
    mode: "dry-run",
    contentSchemaVersion: 1,
    repositoryApiVersion: 1,
    migrationLedgerVersion: 1,
    operationAt: "2026-07-22T21:00:00+08:00",
    migrated: [],
    skipped: [],
    missingFields: [],
    manualReview: [],
    conflicts: [],
    missingImageAttribution: [],
    validationIssues: [],
  },
};

test("default invocation is a dry-run", async () => {
  const stdout: string[] = [];
  let receivedMode: string | undefined;
  const exitCode = await runMigrationCli([], {
    repositoryRoot: "fixture-root",
    operationAt: () => EMPTY_PLAN.report.operationAt,
    stdout: (line) => stdout.push(line),
    stderr: (line) => assert.fail(`unexpected stderr: ${line}`),
    planner: async (options) => {
      receivedMode = options.mode;
      return EMPTY_PLAN;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(receivedMode, "dry-run");
  assert.match(stdout[0], /Migration dry-run/);
  assert.equal(JSON.parse(stdout[1]).mode, "dry-run");
});

test("write, report, and unknown arguments are rejected with exit code 2", async () => {
  for (const args of [["--write"], ["--report", "report.json"], ["--unknown"]]) {
    const stderr: string[] = [];
    const exitCode = await runMigrationCli(args, {
      stdout: (line) => assert.fail(`unexpected stdout: ${line}`),
      stderr: (line) => stderr.push(line),
      planner: async () => assert.fail("invalid arguments must not call planner"),
    });
    assert.equal(exitCode, 2);
    assert.match(stderr.join("\n"), /Invalid migration arguments/);
  }
});
