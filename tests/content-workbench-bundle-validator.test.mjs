import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const workspaceRoot = resolve(import.meta.dirname, "..");
const validatorSource = resolve(
  workspaceRoot,
  "tools/content-workbench/portable-validator/validate-bundle.mjs",
);
const wrapperSource = resolve(
  workspaceRoot,
  "tools/content-workbench/portable-validator/Validate-Bundle.sh",
);
const branch = "content/20260725-portable-validator";
const recordId = "portable-validator";
const bundleName = "content-20260725-portable-validator-v1.bundle";
const changedPath = `content/records/team-news/${recordId}/record.json`;
const manifestKeys = [
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
function git(cwd, args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd,
    encoding,
    env: {
      PATH: process.env.PATH,
      Path: process.env.Path,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
    windowsHide: true,
  }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function writeManifest(fixture) {
  const text = `${manifestKeys.map((key) => `${key}=${fixture.manifest[key]}`).join("\r\n")}\r\n`;
  writeFileSync(join(fixture.delivery, "MANIFEST.txt"), text);
}

function writeTestSummary(fixture) {
  writeFileSync(
    join(fixture.delivery, "TEST-SUMMARY.txt"),
    [
      "Bundle create: PASS",
      "Bundle verify: PASS",
      `Bundle head: ${fixture.manifest.HeadCommit} refs/heads/${fixture.manifest.Branch}`,
      "SHA-256: PASS",
      "Copied bundle hash: PASS",
      `Import script: verifies then fetches only ${fixture.manifest.ImportBranch}`,
      "",
    ].join("\r\n"),
  );
}

function refreshBundleIntegrity(fixture) {
  fixture.manifest.BundleSizeBytes = String(statSync(fixture.bundlePath).size);
  fixture.manifest.BundleSha256 = sha256(fixture.bundlePath);
  writeFileSync(
    join(fixture.delivery, `${fixture.bundleName}.sha256.txt`),
    `${fixture.manifest.BundleSha256}  ${fixture.bundleName}\r\n`,
  );
  writeManifest(fixture);
}

function createFixture(options = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "algae-validator-test-"));
  const source = join(temporary, "source");
  const delivery = join(temporary, "delivery ; no-shell");
  const validationTemp = join(temporary, "validator-temp");
  mkdirSync(source);
  mkdirSync(delivery);
  mkdirSync(validationTemp);
  git(source, ["init", "-b", "main"]);
  git(source, ["config", "user.name", "Bundle Validator Test"]);
  git(source, ["config", "user.email", "bundle-validator@example.invalid"]);
  mkdirSync(join(source, ".github", "workflows"), { recursive: true });
  writeFileSync(join(source, "package.json"), "{\"private\":true}\n");
  writeFileSync(join(source, ".github", "workflows", "base.yml"), "name: base\n");
  git(source, ["add", "--", "package.json", ".github/workflows/base.yml"]);
  git(source, ["commit", "-m", "test: initialize fixture"]);
  const baseCommit = git(source, ["rev-parse", "HEAD"]);
  const fixtureBranch = options.branch ?? branch;
  const fixtureRecordId = options.recordId ?? recordId;
  const fixtureBundleName = `${fixtureBranch.replace("/", "-")}-v1.bundle`;
  const fixtureArtifacts = [
    fixtureBundleName,
    `${fixtureBundleName}.sha256.txt`,
    "MANIFEST.txt",
    "HANDOFF.md",
    "TEST-SUMMARY.txt",
    "CHANGED-FILES.txt",
    "Import-Bundle.ps1",
    "Validate-Bundle.sh",
    "validate-bundle.mjs",
  ];
  git(source, ["switch", "-c", fixtureBranch]);

  const fixtureChangedPath = options.changedPath ?? changedPath;
  mkdirSync(dirname(join(source, ...fixtureChangedPath.split("/"))), { recursive: true });
  writeFileSync(join(source, ...fixtureChangedPath.split("/")), "{\"schemaVersion\":1}\n");
  git(source, ["add", "--", fixtureChangedPath]);
  git(source, ["commit", "-m", `content: publish ${fixtureRecordId}`]);
  const headCommit = git(source, ["rev-parse", "HEAD"]);
  const bundlePath = join(delivery, fixtureBundleName);
  git(source, ["bundle", "create", bundlePath, `refs/heads/${fixtureBranch}`]);

  const manifest = {
    FormatVersion: "1",
    Branch: fixtureBranch,
    HeadCommit: headCommit,
    BaseCommit: baseCommit,
    BundleFile: fixtureBundleName,
    BundleSizeBytes: String(statSync(bundlePath).size),
    BundleSha256: sha256(bundlePath),
    History: "complete",
    ImportBranch: `import/${fixtureBranch.replace("/", "-")}`,
    ChangedFileCount: "1",
    Artifacts: fixtureArtifacts.join(","),
  };
  const fixture = {
    temporary,
    source,
    delivery,
    validationTemp,
    bundlePath,
    branch: fixtureBranch,
    recordId: fixtureRecordId,
    bundleName: fixtureBundleName,
    manifest,
    changedPath: fixtureChangedPath,
  };
  writeManifest(fixture);
  writeFileSync(join(delivery, `${fixtureBundleName}.sha256.txt`), `${manifest.BundleSha256}  ${fixtureBundleName}\r\n`);
  writeFileSync(join(delivery, "HANDOFF.md"), "# Offline Content Bundle Handoff\n");
  writeTestSummary(fixture);
  writeFileSync(join(delivery, "CHANGED-FILES.txt"), `${fixtureChangedPath}\r\n`);
  writeFileSync(join(delivery, "Import-Bundle.ps1"), "Write-Output 'fixture only'\r\n");
  copyFileSync(wrapperSource, join(delivery, "Validate-Bundle.sh"));
  copyFileSync(validatorSource, join(delivery, "validate-bundle.mjs"));
  return fixture;
}

function cleanupFixture(fixture) {
  rmSync(fixture.temporary, { force: true, recursive: true });
}

function runValidator(fixture, options = {}) {
  const program = options.wrapper ? "bash" : process.execPath;
  const script = options.wrapper
    ? join(fixture.delivery, "Validate-Bundle.sh")
    : join(fixture.delivery, "validate-bundle.mjs");
  const args = [script, fixture.bundlePath];
  if (options.sidecarDirectory) {
    args.push("--sidecar-dir", options.sidecarDirectory);
  }
  if (options.keepTemp) {
    args.push("--keep-temp");
  }
  return spawnSync(program, args, {
    cwd: fixture.delivery,
    encoding: "utf8",
    env: {
      ...process.env,
      TMPDIR: fixture.validationTemp,
      TEMP: fixture.validationTemp,
      TMP: fixture.validationTemp,
      VALIDATOR_TEST_SECRET: "MUST_NOT_APPEAR",
    },
    windowsHide: true,
  });
}

function assertFailure(result, stage) {
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /^VALIDATION_RESULT=FAIL$/m);
  assert.match(result.stdout, new RegExp(`^VALIDATION_STAGE=${stage}$`, "m"));
  assert.doesNotMatch(result.stdout, /^VALIDATION_RESULT=PASS$/m);
  assert.doesNotMatch(result.stdout, /MUST_NOT_APPEAR/u);
}

test("portable validator accepts a complete workbench-format Bundle without source-repository side effects", () => {
  const fixture = createFixture();
  try {
    const headBefore = git(fixture.source, ["rev-parse", "HEAD"]);
    const refsBefore = git(fixture.source, ["show-ref"]);
    const result = runValidator(fixture);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^VALIDATION_RESULT=PASS$/m);
    assert.match(result.stdout, new RegExp(`^BUNDLE_SHA256=${fixture.manifest.BundleSha256}$`, "m"));
    assert.match(result.stdout, new RegExp(`^HEAD_REF=refs/heads/${branch}$`, "m"));
    assert.match(result.stdout, new RegExp(`^HEAD_COMMIT=${fixture.manifest.HeadCommit}$`, "m"));
    assert.match(result.stdout, new RegExp(`^BASE_COMMIT=${fixture.manifest.BaseCommit}$`, "m"));
    assert.match(result.stdout, /^CHANGED_FILE_COUNT=1$/m);
    assert.doesNotMatch(result.stdout, /MUST_NOT_APPEAR/u);
    assert.equal(git(fixture.source, ["rev-parse", "HEAD"]), headBefore);
    assert.equal(git(fixture.source, ["show-ref"]), refsBefore);
    assert.equal(git(fixture.source, ["status", "--short"]), "");
    assert.deepEqual(readdirSync(fixture.validationTemp), [], "temporary Git repository was not cleaned");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator accepts a unique direct-publishing branch", () => {
  const directBranch = "content/direct-0123456789abcdef0123456789abcdef-portable-validator";
  const fixture = createFixture({ branch: directBranch });
  try {
    const result = runValidator(fixture);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^VALIDATION_RESULT=PASS$/m);
    assert.match(
      result.stdout,
      new RegExp(`^HEAD_REF=refs/heads/${directBranch}$`, "m"),
    );
    assert.match(result.stdout, /^CHANGED_FILE_COUNT=1$/m);
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator accepts a controlled public upload image path", () => {
  const fixture = createFixture({
    changedPath: "public/images/uploads/2026/07/fictional-image.thumbnail.webp",
  });
  try {
    const result = runValidator(fixture);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^VALIDATION_RESULT=PASS$/m);
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects malformed public upload image paths", () => {
  for (const changedPath of [
    "public/images/uploads/2026/13/fictional-image.webp",
    "public/images/uploads/2026/07/fictional-image.svg",
  ]) {
    const fixture = createFixture({ changedPath });
    try {
      assertFailure(runValidator(fixture), "PATHS");
    } finally {
      cleanupFixture(fixture);
    }
  }
});

test("portable validator accepts an explicit sidecar directory", () => {
  const fixture = createFixture();
  try {
    const separateBundleDirectory = join(fixture.temporary, "bundle-only");
    mkdirSync(separateBundleDirectory);
    const separateBundle = join(separateBundleDirectory, bundleName);
    copyFileSync(fixture.bundlePath, separateBundle);
    rmSync(fixture.bundlePath);
    fixture.bundlePath = separateBundle;
    fixture.manifest.BundleSha256 = fixture.manifest.BundleSha256.toLowerCase();
    writeManifest(fixture);
    writeFileSync(join(fixture.delivery, `${bundleName}.sha256.txt`), `${fixture.manifest.BundleSha256}  ${bundleName}\n`);
    const result = runValidator(fixture, { sidecarDirectory: fixture.delivery });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^VALIDATION_RESULT=PASS$/m);
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a tampered Bundle at SHA-256 validation", () => {
  const fixture = createFixture();
  try {
    appendFileSync(fixture.bundlePath, "tampered");
    assertFailure(runValidator(fixture), "SHA256");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a malformed SHA-256 sidecar", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.delivery, `${bundleName}.sha256.txt`), "not-a-sidecar\n");
    assertFailure(runValidator(fixture), "SHA256");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a missing manifest", () => {
  const fixture = createFixture();
  try {
    rmSync(join(fixture.delivery, "MANIFEST.txt"));
    assertFailure(runValidator(fixture), "MANIFEST");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a manifest head that differs from the Bundle head", () => {
  const fixture = createFixture();
  try {
    fixture.manifest.HeadCommit = "0".repeat(40);
    writeManifest(fixture);
    writeTestSummary(fixture);
    assertFailure(runValidator(fixture), "GIT_REFS");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects CHANGED-FILES.txt that differs from the isolated Git diff", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.delivery, "CHANGED-FILES.txt"), "content/media/other.json\r\n");
    assertFailure(runValidator(fixture), "CHANGED_FILES");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator parses the generated test summary instead of accepting an arbitrary PASS", () => {
  const fixture = createFixture();
  try {
    writeFileSync(join(fixture.delivery, "TEST-SUMMARY.txt"), "PASS\r\n");
    assertFailure(runValidator(fixture), "TEST_SUMMARY");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a manifest base that is not the head commit parent", () => {
  const fixture = createFixture();
  try {
    fixture.manifest.BaseCommit = "0".repeat(40);
    writeManifest(fixture);
    assertFailure(runValidator(fixture), "GIT_TOPOLOGY");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects forbidden publication paths", () => {
  const fixture = createFixture({ changedPath: ".github/workflows/deploy.yml" });
  try {
    assertFailure(runValidator(fixture), "PATHS");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects an unapproved Bundle ref", () => {
  const fixture = createFixture();
  try {
    rmSync(fixture.bundlePath);
    git(fixture.source, ["bundle", "create", fixture.bundlePath, "refs/heads/main"]);
    refreshBundleIntegrity(fixture);
    assertFailure(runValidator(fixture), "GIT_REFS");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a corrupt Bundle even when sidecar hashes are refreshed", () => {
  const fixture = createFixture();
  try {
    writeFileSync(fixture.bundlePath, "not a git bundle\n");
    refreshBundleIntegrity(fixture);
    assertFailure(runValidator(fixture), "GIT_BUNDLE");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects a Bundle with multiple heads", () => {
  const fixture = createFixture();
  try {
    rmSync(fixture.bundlePath);
    git(fixture.source, [
      "bundle",
      "create",
      fixture.bundlePath,
      `refs/heads/${branch}`,
      "refs/heads/main",
    ]);
    refreshBundleIntegrity(fixture);
    assertFailure(runValidator(fixture), "GIT_REFS");
  } finally {
    cleanupFixture(fixture);
  }
});

test("portable validator rejects an incomplete sidecar collection", () => {
  const fixture = createFixture();
  try {
    rmSync(join(fixture.delivery, "HANDOFF.md"));
    assertFailure(runValidator(fixture), "SIDECARS");
  } finally {
    cleanupFixture(fixture);
  }
});

test(
  "Ubuntu shell wrapper invokes the same validator contract",
  { skip: process.platform === "win32" },
  () => {
    const fixture = createFixture();
    try {
      const result = runValidator(fixture, { wrapper: true });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /^VALIDATION_RESULT=PASS$/m);
    } finally {
      cleanupFixture(fixture);
    }
  },
);

test("portable validator retains and reports only an explicitly requested debug directory", () => {
  const fixture = createFixture();
  try {
    const result = runValidator(fixture, { keepTemp: true });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const match = /^TEMPORARY_REPOSITORY=(.+)$/m.exec(result.stdout);
    assert.ok(match, result.stdout);
    assert.ok(existsSync(match[1]));
    rmSync(match[1], { force: true, recursive: true });
  } finally {
    cleanupFixture(fixture);
  }
});
