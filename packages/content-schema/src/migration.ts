import { CONTENT_SCHEMA_VERSION } from "./constants";
import type { MigrationResult } from "./issues";
import type { ContentRecord } from "./schemas";
import { parseRecord } from "./validation";

export function migrateRecord(
  input: unknown,
  fromVersion: number,
  toVersion: number,
): MigrationResult<ContentRecord> {
  if (
    fromVersion !== CONTENT_SCHEMA_VERSION ||
    toVersion !== CONTENT_SCHEMA_VERSION
  ) {
    return {
      success: false,
      fromVersion,
      toVersion,
      issues: [
        {
          code: "SCHEMA_MIGRATION_UNSUPPORTED",
          severity: "error",
          path: "schemaVersion",
          message: `不支持从 schema ${fromVersion} 迁移到 ${toVersion}`,
          remedy: "使用已登记并经过 fixture 测试的逐版本迁移函数。",
        },
      ],
    };
  }

  const parsed = parseRecord(input);
  if (!parsed.success) {
    return {
      success: false,
      fromVersion,
      toVersion,
      issues: parsed.issues,
    };
  }

  return {
    success: true,
    fromVersion,
    toVersion,
    data: structuredClone(parsed.data),
    issues: [],
  };
}
