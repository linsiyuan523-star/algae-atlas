import { runMigrationCli } from "./content-migration/cli";

process.exitCode = await runMigrationCli(process.argv.slice(2));
