import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const desktop = resolve(root, "tools/content-workbench");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function normalizeToml(toml) {
  return toml
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function resolveWorkspacePackage(packageLock, packageName) {
  const candidates = [
    `tools/content-workbench/node_modules/${packageName}`,
    `tools/node_modules/${packageName}`,
    `node_modules/${packageName}`,
  ];
  return candidates.find((candidate) => packageLock.packages[candidate]);
}

test("content workbench scaffold has the local-only desktop contract", () => {
  const rootPackage = readJson(resolve(root, "package.json"));
  const packageLock = readJson(resolve(root, "package-lock.json"));
  const workspacePackage = readJson(resolve(desktop, "package.json"));
  const tauriConfig = readJson(resolve(desktop, "src-tauri/tauri.conf.json"));
  const capability = readJson(resolve(desktop, "src-tauri/capabilities/main-local.json"));
  const cargoToml = readText(resolve(desktop, "src-tauri/Cargo.toml"));
  const rustLib = readText(resolve(desktop, "src-tauri/src/lib.rs"));
  const toolchain = readText(resolve(desktop, "rust-toolchain.toml"));
  const viteConfig = readText(resolve(desktop, "vite.config.ts"));
  const indexHtml = readText(resolve(desktop, "index.html"));
  const gitignore = readText(resolve(root, ".gitignore"));

  assert.deepEqual(rootPackage.workspaces, ["packages/*", "tools/content-workbench"]);
  assert.equal(workspacePackage.name, "@algae-atlas/content-workbench");
  assert.equal(workspacePackage.version, "0.1.0");
  assert.equal(workspacePackage.private, true);

  const expectedDependencies = {
    "@tauri-apps/api": "2.11.1",
    "lucide-react": "1.25.0",
    react: "19.2.6",
    "react-dom": "19.2.6",
  };
  const expectedDevDependencies = {
    "@tauri-apps/cli": "2.11.4",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "22.19.19",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    jsdom: "29.1.1",
    typescript: "5.9.3",
    vite: "8.0.16",
    vitest: "4.1.10",
  };
  assert.deepEqual(workspacePackage.dependencies, expectedDependencies);
  assert.deepEqual(workspacePackage.devDependencies, expectedDevDependencies);
  const workspaceVitePath = resolveWorkspacePackage(packageLock, "vite");
  assert.equal(workspaceVitePath, "tools/content-workbench/node_modules/vite");
  assert.equal(packageLock.packages[workspaceVitePath].version, "8.0.16");
  assert.equal(packageLock.packages["node_modules/vite"].version, "8.0.13");

  assert.equal(tauriConfig.bundle.active, false);
  assert.equal(tauriConfig.build.frontendDist, "../dist");
  assert.equal(tauriConfig.build.devUrl, "http://localhost:1420");
  assert.match(viteConfig, /port:\s*1420/);
  assert.match(viteConfig, /strictPort:\s*true/);
  assert.match(indexHtml, /<link rel="icon" href="\/favicon\.ico" \/>/);
  assert.ok(existsSync(resolve(desktop, "public/favicon.ico")), "local favicon must exist");

  const productionCsp = tauriConfig.app.security.csp;
  const developmentCsp = tauriConfig.app.security.devCsp;
  assert.equal(productionCsp, "default-src 'self'; connect-src ipc: http://ipc.localhost; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.equal(developmentCsp, "default-src 'self'; connect-src ipc: http://ipc.localhost http://localhost:1420 ws://localhost:1420 ws://localhost:1421; font-src 'self'; img-src 'self' data:; script-src 'self' 'nonce-content-workbench-dev'; style-src 'self' 'nonce-content-workbench-dev'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.doesNotMatch(productionCsp, /https?:\/\/(?!ipc\.localhost\b)|wss?:\/\/|\*|nonce-|unsafe-(?:inline|eval)/);
  assert.doesNotMatch(developmentCsp, /https?:\/\/(?!(?:ipc\.localhost|localhost:1420)\b)|wss?:\/\/(?!localhost:142[01]\b)|\*|unsafe-(?:inline|eval)/);
  assert.match(
    viteConfig,
    /const htmlConfig = command === "serve"\s*\? \{ cspNonce: "content-workbench-dev" \} : undefined;/,
  );
  assert.match(viteConfig, /html:\s*htmlConfig/);
  assert.doesNotMatch(viteConfig, /html:\s*\{\s*cspNonce:/);

  assert.equal(capability.local, true);
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.platforms, ["windows"]);
  assert.deepEqual(capability.permissions, []);

  const expectedCargoToml = [
    "[package]",
    'name = "content-workbench"',
    'version = "0.1.0"',
    'description = "Local content workbench for Algae Atlas"',
    'edition = "2021"',
    'rust-version = "1.97.1"',
    "[lib]",
    'name = "content_workbench_lib"',
    'crate-type = ["staticlib", "cdylib", "rlib"]',
    "[build-dependencies]",
    'tauri-build = { version = "=2.6.3", features = [] }',
    "[dependencies]",
    'tauri = { version = "=2.11.5", features = [] }',
    'tauri-plugin-single-instance = "=2.4.3"',
    'serde = { version = "=1.0.229", features = ["derive"] }',
    'serde_json = "=1.0.151"',
    'uuid = { version = "=1.24.0", features = ["v4"] }',
    'time = { version = "=0.3.54", features = ["formatting", "parsing"] }',
    'thiserror = "=2.0.19"',
    "[target.'cfg(windows)'.dependencies]",
    'windows-sys = { version = "=0.61.2", features = ["Win32_Foundation", "Win32_Storage_FileSystem"] }',
    "[dev-dependencies]",
    'tempfile = "=3.27.0"',
  ].join("\n");
  assert.equal(normalizeToml(cargoToml), expectedCargoToml);
  assert.doesNotMatch(cargoToml, /\b(?:git|path)\s*=/);
  assert.doesNotMatch(cargoToml, /\bcustom-protocol\b/);
  assert.doesNotMatch(cargoToml, /(?:tauri-plugin-(?:fs|shell|http|opener|dialog|store|updater|localhost)|tauri-plugin-url|tauri-plugin-git|tauri-plugin-process)\b/);
  assert.doesNotMatch(readText(resolve(desktop, "src-tauri/Cargo.lock")), /source = "git\+/);
  assert.doesNotMatch(readText(resolve(root, "package-lock.json")), /"resolved": "git\+/);

  assert.match(toolchain, /channel\s*=\s*"1\.97\.1"/);
  assert.match(toolchain, /"rustfmt"/);
  assert.match(toolchain, /"clippy"/);
  assert.match(toolchain, /"x86_64-pc-windows-msvc"/);
  assert.equal(workspacePackage.scripts["tauri:build"], "tauri build --debug --no-bundle");

  const forbiddenDependencyNames = new Set([
    "fs",
    "shell",
    "http",
    "opener",
    "dialog",
    "store",
    "updater",
    "localhost",
    "url",
    "git",
    "process",
    ...["fs", "shell", "http", "opener", "dialog", "store", "updater", "localhost", "url", "git", "process"].flatMap((name) => [
      `@tauri-apps/plugin-${name}`,
      `tauri-plugin-${name}`,
    ]),
  ]);
  for (const dependency of new Set([
    ...Object.keys(workspacePackage.dependencies),
    ...Object.keys(workspacePackage.devDependencies),
  ])) {
    assert.ok(!forbiddenDependencyNames.has(dependency), `forbidden desktop dependency: ${dependency}`);
  }
  assert.doesNotMatch(JSON.stringify(capability), /tauri-plugin-single-instance/);
  assert.match(
    rustLib,
    /if let Err\(error\) = window\.set_focus\(\) \{\s*eprintln!\("failed to focus existing main window: \{error\}"\);\s*\}/,
  );
  assert.doesNotMatch(rustLib, /let _ = window\.set_focus\(\);/);

  const tsbuildInfoPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.tsbuildinfo"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  assert.equal(tsbuildInfoPaths, "", ".tsbuildinfo files must be ignored or absent");

  assert.match(gitignore, /^node_modules\/$/m, "node_modules must be ignored at every workspace depth");
  const generatedDependencyPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "tools/content-workbench/node_modules/**"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  assert.equal(generatedDependencyPaths, "", "workspace node_modules must be ignored or absent");
});
