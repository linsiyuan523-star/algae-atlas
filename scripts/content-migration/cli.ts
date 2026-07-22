import { executeMigration, normalizeReportPath } from "./writer";

export type MigrationCliDependencies = {
  repositoryRoot?: string;
  operationAt?: () => string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  executor?: typeof executeMigration;
};

const USAGE =
  "Usage: npm run content:migrate -- [--dry-run | --write [--report delivery/migration-reports/<name>.json] | --help]";

class MigrationArgumentError extends Error {}

function parseArguments(args: readonly string[]): {
  mode: "dry-run" | "write";
  reportPath?: string;
} {
  let mode: "dry-run" | "write" | undefined;
  let reportPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run" || argument === "--write") {
      const nextMode = argument === "--write" ? "write" : "dry-run";
      if (mode !== undefined) {
        throw new MigrationArgumentError("Choose exactly one migration mode.");
      }
      mode = nextMode;
      continue;
    }
    if (argument === "--report") {
      if (reportPath !== undefined) {
        throw new MigrationArgumentError("Specify at most one report path.");
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new MigrationArgumentError("--report requires a JSON file path.");
      }
      try {
        reportPath = normalizeReportPath(value);
      } catch {
        throw new MigrationArgumentError(
          "Report must be delivery/migration-reports/<name>.json.",
        );
      }
      index += 1;
      continue;
    }
    throw new MigrationArgumentError(`Unknown argument: ${argument}`);
  }

  const resolvedMode = mode ?? "dry-run";
  if (reportPath && resolvedMode !== "write") {
    throw new MigrationArgumentError("--report is only valid with --write.");
  }
  return { mode: resolvedMode, ...(reportPath ? { reportPath } : {}) };
}

export async function runMigrationCli(
  args: readonly string[],
  dependencies: MigrationCliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  if (args.length === 1 && args[0] === "--help") {
    stdout(USAGE);
    stdout("Default mode is --dry-run; writing requires explicit --write.");
    return 0;
  }

  let parsed: ReturnType<typeof parseArguments>;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    stderr(
      error instanceof MigrationArgumentError
        ? `Invalid migration arguments: ${error.message}`
        : "Invalid migration arguments.",
    );
    stderr(USAGE);
    return 2;
  }

  try {
    const result = await (dependencies.executor ?? executeMigration)({
      ...parsed,
      operationAt:
        dependencies.operationAt?.() ?? new Date().toISOString(),
      repositoryRoot: dependencies.repositoryRoot ?? process.cwd(),
    });
    const { report } = result;
    const action = parsed.mode === "write" ? "written" : "planned";
    stdout(
      `Migration ${parsed.mode}: ${report.migrated.length} ${action}, ${report.skipped.length} skipped, ${report.conflicts.length} conflicts, ${report.validationIssues.length} validation issues.`,
    );
    stdout(JSON.stringify(report, null, 2));
    return result.exitCode;
  } catch {
    stderr("Migration execution failed before a safe report could be produced.");
    return 1;
  }
}
