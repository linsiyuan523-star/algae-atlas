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
    executor: async (options) => {
      receivedMode = options.mode;
      return { exitCode: 0, report: EMPTY_PLAN.report };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(receivedMode, "dry-run");
  assert.match(stdout[0], /Migration dry-run/);
  assert.equal(JSON.parse(stdout[1]).mode, "dry-run");
});

test("invalid mode and report combinations exit with code 2", async () => {
  const invalidArguments = [
    ["--dry-run", "--write"],
    ["--report"],
    ["--report", "delivery/migration-reports/report.json"],
    ["--write", "--report", "../report.json"],
    ["--write", "--report", "C:\\report.json"],
    ["--write", "--report", "delivery/migration-reports/report.txt"],
    ["--unknown"],
  ];
  for (const args of invalidArguments) {
    const stderr: string[] = [];
    const exitCode = await runMigrationCli(args, {
      stdout: (line) => assert.fail(`unexpected stdout: ${line}`),
      stderr: (line) => stderr.push(line),
      executor: async () =>
        assert.fail("invalid arguments must not execute migration"),
    });
    assert.equal(exitCode, 2);
    assert.match(stderr.join("\n"), /Invalid migration arguments/);
  }
});

test("explicit write accepts one allowlisted JSON report", async () => {
  const reportPath = "delivery/migration-reports/stage-03.json";
  let received:
    | { mode: string; reportPath?: string }
    | undefined;
  const writeReport = { ...EMPTY_PLAN.report, mode: "write" as const };
  const exitCode = await runMigrationCli(
    ["--write", "--report", reportPath],
    {
      stdout: () => undefined,
      stderr: (line) => assert.fail(`unexpected stderr: ${line}`),
      executor: async (options) => {
        received = options;
        return { exitCode: 0, report: writeReport };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(received?.mode, "write");
  assert.equal(received?.reportPath, reportPath);
});
