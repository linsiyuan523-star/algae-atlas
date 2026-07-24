import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "packages/content-schema/.browser-contract/**",
    "tools/content-workbench/dist/**",
    "tools/content-workbench/coverage/**",
    "tools/content-workbench/src-tauri/target/**",
    "tools/content-workbench/src-tauri/gen/schemas/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
