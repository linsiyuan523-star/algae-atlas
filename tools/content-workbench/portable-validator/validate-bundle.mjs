import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, open, readFile, readdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;
const MANIFEST_KEYS = [
  "FormatVersion",
  "Branch",
  "HeadCommit",
  "BaseCommit",
  "BundleFile",
  "BundleSizeBytes",
  "BundleSha256",
  "History",
  "ImportBranch",
  "ChangedFileCount",
  "Artifacts",
];
const FIXED_ARTIFACTS = [
  "MANIFEST.txt",
  "HANDOFF.md",
  "TEST-SUMMARY.txt",
  "CHANGED-FILES.txt",
  "Import-Bundle.ps1",
  "Validate-Bundle.sh",
  "validate-bundle.mjs",
];

class ValidationError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "ValidationError";
    this.stage = stage;
  }
}

function fail(stage, message) {
  throw new ValidationError(stage, message);
}

function assertSafeArgument(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\0\r\n]/u.test(value)) {
    fail("INPUT", `${label} is invalid`);
  }
}

function parseArguments(argv) {
  let bundlePath;
  let sidecarDirectory;
  let keepTemp = false;
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!positionalOnly && argument === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && argument === "--keep-temp") {
      keepTemp = true;
      continue;
    }
    if (!positionalOnly && argument === "--sidecar-dir") {
      const value = argv[index + 1];
      if (value === undefined) {
        fail("INPUT", "--sidecar-dir requires a directory");
      }
      assertSafeArgument(value, "sidecar directory");
      sidecarDirectory = value;
      index += 1;
      continue;
    }
    if (!positionalOnly && argument.startsWith("-")) {
      fail("INPUT", "unsupported option");
    }
    if (bundlePath !== undefined) {
      fail("INPUT", "exactly one bundle file is required");
    }
    assertSafeArgument(argument, "bundle path");
    bundlePath = argument;
  }

  if (bundlePath === undefined) {
    fail("INPUT", "a bundle file path is required");
  }

  const resolvedBundlePath = resolve(bundlePath);
  const resolvedSidecarDirectory = resolve(sidecarDirectory ?? dirname(resolvedBundlePath));
  return {
    bundlePath: resolvedBundlePath,
    sidecarDirectory: resolvedSidecarDirectory,
    keepTemp,
  };
}

async function regularFile(path, stage, label) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(stage, `${label} is missing`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(stage, `${label} must be a regular file`);
  }
  return metadata;
}

async function directory(path, stage, label) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail(stage, `${label} is missing`);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(stage, `${label} must be a real directory`);
  }
}

async function readTextFile(path, stage, label) {
  const metadata = await regularFile(path, stage, label);
  if (metadata.size === 0 || metadata.size > MAX_TEXT_FILE_BYTES) {
    fail(stage, `${label} has an invalid size`);
  }
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    fail(stage, `cannot read ${label}`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(stage, `${label} is not valid UTF-8`);
  }
}

function strictLines(text, stage, label) {
  if (text.includes("\0") || !text.endsWith("\n")) {
    fail(stage, `${label} has an invalid line format`);
  }
  const normalized = text.replaceAll("\r\n", "\n");
  if (normalized.includes("\r")) {
    fail(stage, `${label} has an invalid line format`);
  }
  const lines = normalized.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) {
    fail(stage, `${label} has an invalid line format`);
  }
  return lines;
}

function parseManifest(text) {
  const lines = strictLines(text, "MANIFEST", "MANIFEST.txt");
  if (lines.length !== MANIFEST_KEYS.length) {
    fail("MANIFEST", "MANIFEST.txt has an unexpected field count");
  }
  const fields = new Map();
  lines.forEach((line, index) => {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      fail("MANIFEST", "MANIFEST.txt has an invalid field");
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (key !== MANIFEST_KEYS[index] || value.length === 0 || fields.has(key)) {
      fail("MANIFEST", "MANIFEST.txt has an invalid schema");
    }
    fields.set(key, value);
  });
  return Object.fromEntries(fields);
}

function validObjectId(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
}

function parseBranch(value) {
  const match = /^content\/(\d{8})-([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(value);
  if (!match || match[2].length > 200) {
    fail("MANIFEST", "Branch is not an approved content branch");
  }
  return { branch: value, recordId: match[2] };
}

function decimal(value, label, stage = "MANIFEST") {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    fail(stage, `${label} is not a non-negative integer`);
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(stage, `${label} is too large`);
  }
  return parsed;
}

function expectedArtifacts(bundleName) {
  return [
    bundleName,
    `${bundleName}.sha256.txt`,
    ...FIXED_ARTIFACTS,
  ];
}

function safeArtifactName(name) {
  return name.length > 0
    && name !== "."
    && name !== ".."
    && !/[\\/\0\r\n]/u.test(name)
    && !name.includes(":");
}

function parseArtifactList(value, bundleName) {
  const expected = expectedArtifacts(bundleName);
  const actual = value.split(",");
  if (actual.some((name) => !safeArtifactName(name))
      || actual.length !== expected.length
      || actual.some((name, index) => name !== expected[index])) {
    fail("MANIFEST", "Artifacts does not match the delivery format");
  }
  return expected;
}

function artifactPath(directoryPath, name, stage = "SIDECARS") {
  if (!safeArtifactName(name)) {
    fail(stage, "an artifact name is unsafe");
  }
  return join(directoryPath, name);
}

function samePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  if (process.platform === "win32") {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

async function validateArtifactDirectory(sidecarDirectory, artifactNames, bundlePath) {
  const bundleInDirectory = samePath(dirname(bundlePath), sidecarDirectory);
  const expected = artifactNames.filter((name) => bundleInDirectory || name !== basename(bundlePath));
  let entries;
  try {
    entries = await readdir(sidecarDirectory, { withFileTypes: true });
  } catch {
    fail("SIDECARS", "cannot list the sidecar directory");
  }
  const actual = entries.map((entry) => entry.name).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
      || actual.some((name, index) => name !== sortedExpected[index])) {
    fail("SIDECARS", "the sidecar collection is incomplete or contains extra files");
  }
  for (const name of expected) {
    const metadata = await regularFile(artifactPath(sidecarDirectory, name), "SIDECARS", name);
    if (name !== basename(bundlePath)
        && (metadata.size === 0 || metadata.size > MAX_TEXT_FILE_BYTES)) {
      fail("SIDECARS", `${name} has an invalid size`);
    }
  }
}

function parseShaSidecar(text, bundleName) {
  if (!/^[0-9a-f]{64}  [A-Za-z0-9._-]+(?:\r\n|\n)$/iu.test(text)) {
    fail("SHA256", "the SHA-256 sidecar format is invalid");
  }
  const line = text.replace(/\r?\n$/u, "");
  const separator = line.indexOf("  ");
  const hash = line.slice(0, separator).toUpperCase();
  const name = line.slice(separator + 2);
  if (name !== bundleName) {
    fail("SHA256", "the SHA-256 sidecar names a different bundle");
  }
  return hash;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectPromise);
    stream.once("end", resolvePromise);
  });
  return hash.digest("hex").toUpperCase();
}

async function readBundleHeader(path) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(128 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const headerEnd = buffer.subarray(0, bytesRead).indexOf(Buffer.from("\n\n"));
    if (headerEnd < 0) {
      fail("GIT_BUNDLE", "the bundle header is invalid");
    }
    const header = buffer.subarray(0, headerEnd + 2).toString("utf8");
    if (header.split("\n").some((line) => line.startsWith("-"))) {
      fail("GIT_BUNDLE", "the bundle is not a complete history");
    }
  } finally {
    await handle.close();
  }
}

function gitEnvironment() {
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  return {
    PATH: pathValue,
    Path: pathValue,
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : devNull,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    LC_ALL: "C",
  };
}

async function runGit(cwd, args, stage, encoding = "utf8") {
  try {
    return await execFileAsync("git", args, {
      cwd,
      env: gitEnvironment(),
      encoding,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch {
    fail(stage, "the Git validation command failed");
  }
}

function parseHeadLines(text) {
  const lines = text.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) {
    fail("GIT_REFS", "the bundle must contain exactly one head");
  }
  const match = /^([a-f0-9]{40}|[a-f0-9]{64}) (refs\/heads\/[^\s]+)$/u.exec(lines[0]);
  if (!match) {
    fail("GIT_REFS", "the bundle head format is invalid");
  }
  return { commit: match[1], ref: match[2] };
}

function parseNulPaths(buffer, stage, label) {
  if (!Buffer.isBuffer(buffer)) {
    fail(stage, `${label} output is invalid`);
  }
  const parts = buffer.toString("utf8").split("\0").filter(Boolean);
  if (parts.some((value) => value.includes("\ufffd"))) {
    fail(stage, `${label} contains a non-UTF-8 path`);
  }
  return parts;
}

function forbiddenPath(path) {
  if (path.length === 0
      || path.includes("\\")
      || path.includes("\0")
      || path.startsWith("/")
      || /^[A-Za-z]:/u.test(path)) {
    return true;
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return true;
  }
  const normalizedSegments = segments.map((segment) => segment.toLowerCase());
  const fileName = normalizedSegments.at(-1);
  if (normalizedSegments.includes(".git")
      || normalizedSegments.includes("node_modules")
      || normalizedSegments.some((segment) => ["dist", "target", ".next", ".wrangler", "coverage"].includes(segment))) {
    return true;
  }
  if (fileName === ".env"
      || (fileName.startsWith(".env.") && ![".env.example", ".env.sample"].includes(fileName))) {
    return true;
  }
  if (fileName === "id_rsa"
      || fileName === "id_ed25519"
      || ["credentials.json", "service-account.json", "service_account.json"].includes(fileName)
      || /(?:^|[-_.])(token|secret|credential|credentials)(?:[-_.]|$)/u.test(fileName)
      || [".pem", ".key", ".p12", ".pfx", ".kdbx"].some((suffix) => fileName.endsWith(suffix))) {
    return true;
  }
  return false;
}

function allowedChangedPath(path) {
  return path.startsWith("content/records/")
    || path.startsWith("content/media/")
    || path.startsWith("public/images/uploads/");
}

function validateChangedFileList(text) {
  const paths = strictLines(text, "CHANGED_FILES", "CHANGED-FILES.txt");
  const seen = new Set();
  const sortedPaths = [...paths].sort();
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    fail("CHANGED_FILES", "CHANGED-FILES.txt is not sorted");
  }
  for (const path of paths) {
    if (forbiddenPath(path) || !allowedChangedPath(path)) {
      fail("PATHS", "CHANGED-FILES.txt contains a forbidden path");
    }
    if (seen.has(path)) {
      fail("CHANGED_FILES", "CHANGED-FILES.txt contains duplicate paths");
    }
    seen.add(path);
  }
  return paths;
}

function validateTestSummary(text, manifest) {
  const lines = strictLines(text, "TEST_SUMMARY", "TEST-SUMMARY.txt");
  const expected = [
    "Bundle create: PASS",
    "Bundle verify: PASS",
    `Bundle head: ${manifest.HeadCommit} refs/heads/${manifest.Branch}`,
    "SHA-256: PASS",
    "Copied bundle hash: PASS",
    `Import script: verifies then fetches only ${manifest.ImportBranch}`,
  ];
  if (lines.length !== expected.length || lines.some((line, index) => line !== expected[index])) {
    fail("TEST_SUMMARY", "TEST-SUMMARY.txt does not match the generator format");
  }
}

async function validateBundle(options, state) {
  const bundleMetadata = await regularFile(options.bundlePath, "INPUT", "Bundle");
  if (bundleMetadata.size === 0 || bundleMetadata.size > MAX_BUNDLE_BYTES) {
    fail("INPUT", "Bundle size is outside the supported range");
  }
  await directory(options.sidecarDirectory, "SIDECARS", "sidecar directory");

  const bundleName = basename(options.bundlePath);
  if (!safeArtifactName(bundleName)) {
    fail("INPUT", "Bundle filename is unsafe");
  }
  const manifestPath = artifactPath(options.sidecarDirectory, "MANIFEST.txt");
  const manifest = parseManifest(await readTextFile(manifestPath, "MANIFEST", "MANIFEST.txt"));
  const { branch, recordId } = parseBranch(manifest.Branch);
  const expectedBundleName = `${branch.replace("/", "-")}-v1.bundle`;
  if (manifest.BundleFile !== bundleName || bundleName !== expectedBundleName) {
    fail("MANIFEST", "BundleFile does not match the approved branch name");
  }
  if (!validObjectId(manifest.HeadCommit) || !validObjectId(manifest.BaseCommit)) {
    fail("MANIFEST", "Manifest commit ids are invalid");
  }
  if (!/^[0-9A-Fa-f]{64}$/u.test(manifest.BundleSha256)) {
    fail("MANIFEST", "Manifest SHA-256 is invalid");
  }
  if (manifest.FormatVersion !== "1" || manifest.History !== "complete") {
    fail("MANIFEST", "Manifest version or history marker is invalid");
  }
  if (manifest.ImportBranch !== `import/${branch.replace("/", "-")}`) {
    fail("MANIFEST", "ImportBranch is invalid");
  }
  const declaredSize = decimal(manifest.BundleSizeBytes, "BundleSizeBytes");
  const declaredChangedCount = decimal(manifest.ChangedFileCount, "ChangedFileCount");
  const artifactNames = parseArtifactList(manifest.Artifacts, bundleName);

  await validateArtifactDirectory(options.sidecarDirectory, artifactNames, options.bundlePath);
  const sidecarPath = artifactPath(options.sidecarDirectory, `${bundleName}.sha256.txt`);
  const sidecarHash = parseShaSidecar(
    await readTextFile(sidecarPath, "SHA256", "SHA-256 sidecar"),
    bundleName,
  );
  const actualHash = await hashFile(options.bundlePath);
  if (actualHash !== sidecarHash || actualHash !== manifest.BundleSha256.toUpperCase()) {
    fail("SHA256", "Bundle SHA-256 does not match the sidecar and manifest");
  }
  if (BigInt(bundleMetadata.size) !== declaredSize) {
    fail("MANIFEST", "BundleSizeBytes does not match the Bundle");
  }

  const changedFileList = validateChangedFileList(
    await readTextFile(artifactPath(options.sidecarDirectory, "CHANGED-FILES.txt"), "CHANGED_FILES", "CHANGED-FILES.txt"),
  );
  if (BigInt(changedFileList.length) !== declaredChangedCount) {
    fail("MANIFEST", "ChangedFileCount does not match CHANGED-FILES.txt");
  }
  validateTestSummary(
    await readTextFile(artifactPath(options.sidecarDirectory, "TEST-SUMMARY.txt"), "TEST_SUMMARY", "TEST-SUMMARY.txt"),
    manifest,
  );

  await readBundleHeader(options.bundlePath);
  state.tempRoot = await mkdtemp(join(tmpdir(), "algae-bundle-validator-"));
  const isolatedRepository = join(state.tempRoot, "repository.git");
  await runGit(state.tempRoot, ["init", "--bare", "--quiet", isolatedRepository], "GIT_BUNDLE");

  const verifyResult = await runGit(
    isolatedRepository,
    ["bundle", "verify", options.bundlePath],
    "GIT_BUNDLE",
  );
  if (verifyResult.stdout === undefined) {
    fail("GIT_BUNDLE", "Bundle verification did not produce a result");
  }
  const heads = parseHeadLines(
    (await runGit(isolatedRepository, ["bundle", "list-heads", options.bundlePath], "GIT_REFS")).stdout,
  );
  const expectedRef = `refs/heads/${branch}`;
  if (heads.commit !== manifest.HeadCommit || heads.ref !== expectedRef) {
    fail("GIT_REFS", "Bundle head does not match the manifest");
  }

  const refspec = `+${expectedRef}:refs/validation/bundle-head`;
  await runGit(
    isolatedRepository,
    ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", options.bundlePath, refspec],
    "GIT_FETCH",
  );
  const fetchedHead = (await runGit(
    isolatedRepository,
    ["rev-parse", "--verify", "refs/validation/bundle-head^{commit}"],
    "GIT_TOPOLOGY",
  )).stdout.trim();
  if (fetchedHead !== manifest.HeadCommit) {
    fail("GIT_TOPOLOGY", "Fetched Bundle head does not match the manifest");
  }
  const parentLine = (await runGit(
    isolatedRepository,
    ["rev-list", "--parents", "-n", "1", "refs/validation/bundle-head"],
    "GIT_TOPOLOGY",
  )).stdout.trim().split(/\s+/u);
  if (parentLine.length !== 2 || parentLine[0] !== manifest.HeadCommit || parentLine[1] !== manifest.BaseCommit) {
    fail("GIT_TOPOLOGY", "Bundle head must be a single-parent commit with the declared base");
  }
  const subject = (await runGit(
    isolatedRepository,
    ["log", "-1", "--format=%s", "refs/validation/bundle-head"],
    "GIT_TOPOLOGY",
  )).stdout.trim();
  if (subject !== `content: publish ${recordId}`) {
    fail("GIT_TOPOLOGY", "Bundle head commit subject is not generated by the workbench");
  }
  await runGit(isolatedRepository, ["cat-file", "-e", `${manifest.BaseCommit}^{commit}`], "GIT_TOPOLOGY");

  const changedOutput = (await runGit(
    isolatedRepository,
    ["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", "refs/validation/bundle-head"],
    "CHANGED_FILES",
    "buffer",
  )).stdout;
  const actualChangedFiles = parseNulPaths(changedOutput, "CHANGED_FILES", "Git changed-file").sort();
  const declaredChangedFiles = [...changedFileList].sort();
  if (actualChangedFiles.length !== declaredChangedFiles.length
      || actualChangedFiles.some((path, index) => path !== declaredChangedFiles[index])) {
    fail("CHANGED_FILES", "CHANGED-FILES.txt does not match the isolated Git diff");
  }
  const historyPaths = (await runGit(
    isolatedRepository,
    ["rev-list", "--objects", "refs/validation/bundle-head"],
    "PATHS",
  )).stdout.split(/\r?\n/u);
  for (const line of historyPaths) {
    const separator = line.indexOf(" ");
    const historyPath = separator >= 0 ? line.slice(separator + 1) : "";
    if (historyPath && forbiddenPath(historyPath)) {
      fail("PATHS", "Bundle history contains a forbidden path");
    }
  }

  return {
    bundlePath: options.bundlePath,
    bundleSha256: actualHash,
    headRef: expectedRef,
    headCommit: manifest.HeadCommit,
    baseCommit: manifest.BaseCommit,
    changedFileCount: changedFileList.length,
  };
}

function outputValue(value) {
  return String(value).replace(/[\r\n]/gu, "");
}

function emitPass(result, keptTemp) {
  console.log("VALIDATION_RESULT=PASS");
  console.log(`BUNDLE_PATH=${outputValue(result.bundlePath)}`);
  console.log(`BUNDLE_SHA256=${result.bundleSha256}`);
  console.log(`HEAD_REF=${result.headRef}`);
  console.log(`HEAD_COMMIT=${result.headCommit}`);
  console.log(`BASE_COMMIT=${result.baseCommit}`);
  console.log(`CHANGED_FILE_COUNT=${result.changedFileCount}`);
  console.log("MANIFEST_STATUS=PASS");
  console.log("SIDECAR_STATUS=PASS");
  console.log("GIT_BUNDLE_STATUS=PASS");
  console.log("PATH_GATE_STATUS=PASS");
  if (keptTemp) {
    console.log(`TEMPORARY_REPOSITORY=${outputValue(keptTemp)}`);
  }
}

function emitFail(error, keptTemp) {
  console.log("VALIDATION_RESULT=FAIL");
  console.log(`VALIDATION_STAGE=${outputValue(error.stage ?? "UNKNOWN")}`);
  console.log(`VALIDATION_ERROR=${outputValue(error instanceof ValidationError ? error.message : "validation failed")}`);
  if (keptTemp) {
    console.log(`TEMPORARY_REPOSITORY=${outputValue(keptTemp)}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const state = { tempRoot: undefined };
  let result;
  let error;
  try {
    result = await validateBundle(options, state);
  } catch (caught) {
    error = caught;
  }

  if (state.tempRoot && !options.keepTemp) {
    try {
      await rm(state.tempRoot, { recursive: true, force: true });
    } catch {
      error = new ValidationError("CLEANUP", "temporary validation directory could not be removed");
    }
  }

  if (error) {
    emitFail(error, options.keepTemp ? state.tempRoot : undefined);
    process.exitCode = 1;
    return;
  }
  emitPass(result, options.keepTemp ? state.tempRoot : undefined);
}

main().catch((error) => {
  emitFail(error instanceof ValidationError ? error : new ValidationError("RUNTIME", "validator failed"));
  process.exitCode = 1;
});
