import { buildMigrationPlan } from "./planner";

export type MigrationCliDependencies = {
  repositoryRoot?: string;
  operationAt?: () => string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  planner?: typeof buildMigrationPlan;
};

const USAGE = "Usage: npm run content:migrate -- [--dry-run|--help]";

function isDryRunArguments(args: readonly string[]): boolean {
  return args.length === 0 || (args.length === 1 && args[0] === "--dry-run");
}

export async function runMigrationCli(
  args: readonly string[],
  dependencies: MigrationCliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  if (args.length === 1 && args[0] === "--help") {
    stdout(USAGE);
    stdout("Default mode is --dry-run; write mode requires explicit enablement.");
    return 0;
  }
  if (!isDryRunArguments(args)) {
    stderr(`Invalid migration arguments: ${args.join(" ") || "(none)"}`);
    stderr(USAGE);
    return 2;
  }

  try {
    const plan = await (dependencies.planner ?? buildMigrationPlan)({
      mode: "dry-run",
      operationAt:
        dependencies.operationAt?.() ?? new Date().toISOString(),
      repositoryRoot: dependencies.repositoryRoot ?? process.cwd(),
    });
    const { report } = plan;
    stdout(
      `Migration dry-run: ${report.migrated.length} planned, ${report.skipped.length} skipped, ${report.conflicts.length} conflicts, ${report.validationIssues.length} validation issues.`,
    );
    stdout(JSON.stringify(report, null, 2));
    return report.conflicts.length === 0 && report.validationIssues.length === 0
      ? 0
      : 1;
  } catch (error) {
    stderr(error instanceof Error ? error.message : "Migration planning failed.");
    return 1;
  }
}
