export type GitHubRepository = {
  owner: string;
  name: string;
};

export type GitHubPublishMode = "mock" | "integration";

export type GitHubPublishSource = {
  branchName: string;
  headSha: string;
  baseBranch: string;
  worktreeClean: boolean;
  changedPaths: string[];
  title: string;
};

export type GitHubPublishRequest = {
  mode: GitHubPublishMode;
  repository: GitHubRepository;
  source: GitHubPublishSource;
};

export type GitHubDraftPullRequest = {
  repository: GitHubRepository;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: true;
};

export type GitHubSafetyCheck = {
  code: string;
  status: "passed" | "blocked";
  message: string;
};

export type GitHubPublishPreflight = {
  snapshotId: string;
  mode: GitHubPublishMode;
  repositorySlug: string;
  integrationEnabled: boolean;
  credentialState: "not-required" | "available" | "missing" | "disabled";
  pullRequest: GitHubDraftPullRequest;
  checks: GitHubSafetyCheck[];
  ready: boolean;
};

export type GitHubCredential = {
  kind: "token";
  secret: string;
};

export type GitHubAuthProvider = {
  getCredential: (
    repository: GitHubRepository,
  ) => Promise<GitHubCredential | null>;
};

export type GitHubBranchPublishResult = {
  state: "created" | "already-exists";
  branchName: string;
  headSha: string;
};

export type GitHubDraftPullRequestResult = {
  state: "created" | "already-exists";
  number: number;
  url: string;
  draft: true;
};

export type GitHubRetryState = {
  state: "idle" | "pending" | "exhausted";
  attempt: number;
  maxAttempts: number;
  retryAfterMs?: number;
};

export type GitHubPublishResult = {
  status: "created" | "already-exists" | "retry-required" | "blocked";
  backend: GitHubPublishMode;
  repositorySlug: string;
  branch?: GitHubBranchPublishResult;
  pullRequest?: GitHubDraftPullRequestResult;
  checks: GitHubSafetyCheck[];
  retry: GitHubRetryState;
};

export type GitHubBackend = {
  kind: GitHubPublishMode;
  pushBranch: (
    request: {
      repository: GitHubRepository;
      branchName: string;
      headSha: string;
    },
    credential: GitHubCredential | null,
  ) => Promise<GitHubBranchPublishResult>;
  createDraftPullRequest: (
    request: GitHubDraftPullRequest,
    credential: GitHubCredential | null,
  ) => Promise<GitHubDraftPullRequestResult>;
};

export type GitHubPublishApi = {
  allowedRepositories: readonly GitHubRepository[];
  integrationEnabled: boolean;
  preflight: (request: GitHubPublishRequest) => Promise<GitHubPublishPreflight>;
  publish: (
    request: GitHubPublishRequest,
    preflight: GitHubPublishPreflight,
  ) => Promise<GitHubPublishResult>;
};

export type MockGitHubBackendOptions = {
  pushFailures?: number;
  pullRequestFailures?: number;
  retryAfterMs?: number;
  initialBranches?: Array<{
    repository: GitHubRepository;
    branchName: string;
    headSha: string;
  }>;
};

export type GitHubPublishApiOptions = {
  allowedRepositories?: readonly GitHubRepository[];
  mockBackend?: GitHubBackend;
  integrationBackend?: GitHubBackend;
  integrationEnabled?: boolean;
  authProvider?: GitHubAuthProvider;
  maxAttempts?: number;
};

export const DEFAULT_GITHUB_REPOSITORY_ALLOWLIST: readonly GitHubRepository[] = [
  { owner: "algae-content-mock", name: "algae-atlas" },
];

export const noGitHubAuthProvider: GitHubAuthProvider = {
  getCredential: async () => null,
};

export class GitHubNetworkError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number;

  constructor(
    message: string,
    options: { retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "GitHubNetworkError";
    this.retryable = options.retryable ?? true;
    this.retryAfterMs = options.retryAfterMs ?? 1_000;
  }
}

class GitHubBackendConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubBackendConflictError";
    this.code = code;
  }
}

export function createMockGitHubBackend(
  options: MockGitHubBackendOptions = {},
): GitHubBackend {
  const branches = new Map<string, string>();
  const pullRequests = new Map<
    string,
    Omit<GitHubDraftPullRequestResult, "state">
  >();
  let pushFailures = Math.max(0, options.pushFailures ?? 0);
  let pullRequestFailures = Math.max(0, options.pullRequestFailures ?? 0);
  let nextPullRequestNumber = 1;

  for (const branch of options.initialBranches ?? []) {
    branches.set(
      branchKey(branch.repository, branch.branchName),
      branch.headSha.toLowerCase(),
    );
  }

  return {
    kind: "mock",
    async pushBranch(request) {
      if (pushFailures > 0) {
        pushFailures -= 1;
        throw new GitHubNetworkError("Mock branch publication is temporarily unavailable.", {
          retryAfterMs: options.retryAfterMs,
        });
      }

      const key = branchKey(request.repository, request.branchName);
      const existingHead = branches.get(key);
      if (existingHead && existingHead !== request.headSha.toLowerCase()) {
        throw new GitHubBackendConflictError(
          "BRANCH_HEAD_CONFLICT",
          "The target branch already exists at a different commit.",
        );
      }
      branches.set(key, request.headSha.toLowerCase());
      return {
        state: existingHead ? "already-exists" : "created",
        branchName: request.branchName,
        headSha: request.headSha,
      };
    },
    async createDraftPullRequest(request) {
      if (pullRequestFailures > 0) {
        pullRequestFailures -= 1;
        throw new GitHubNetworkError("Mock Draft PR creation is temporarily unavailable.", {
          retryAfterMs: options.retryAfterMs,
        });
      }

      const key = pullRequestKey(request);
      const existing = pullRequests.get(key);
      if (existing) {
        return { ...existing, state: "already-exists" };
      }

      const number = nextPullRequestNumber;
      nextPullRequestNumber += 1;
      const created = {
        number,
        url: `https://github.invalid/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/pull/${number}`,
        draft: true as const,
      };
      pullRequests.set(key, created);
      return { ...created, state: "created" };
    },
  };
}

export function createGitHubPublishApi(
  options: GitHubPublishApiOptions = {},
): GitHubPublishApi {
  const allowedRepositories = (options.allowedRepositories ??
    DEFAULT_GITHUB_REPOSITORY_ALLOWLIST).map(normalizeRepository);
  const allowedSlugs = new Set(allowedRepositories.map(repositorySlug));
  const mockBackend = options.mockBackend ?? createMockGitHubBackend();
  const integrationBackend = options.integrationBackend;
  const integrationEnabled = options.integrationEnabled ?? false;
  const authProvider = options.authProvider ?? noGitHubAuthProvider;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const retryAttempts = new Map<string, number>();

  if (mockBackend.kind !== "mock") {
    throw new Error("The default GitHub backend must be a mock backend.");
  }
  if (integrationBackend && integrationBackend.kind !== "integration") {
    throw new Error("The integration backend must identify itself as integration.");
  }

  async function inspect(request: GitHubPublishRequest) {
    const normalized = normalizeRequest(request);
    const checks = buildSafetyChecks(
      normalized,
      allowedSlugs,
      integrationEnabled,
      integrationBackend,
    );
    let credential: GitHubCredential | null = null;
    let credentialState: GitHubPublishPreflight["credentialState"] =
      normalized.mode === "mock" ? "not-required" : "disabled";

    if (
      normalized.mode === "integration" &&
      integrationEnabled &&
      integrationBackend &&
      checks.every((check) => check.status === "passed")
    ) {
      credential = await authProvider.getCredential(normalized.repository);
      credentialState = credential ? "available" : "missing";
      checks.push(
        check(
          "AUTH_AVAILABLE",
          Boolean(credential),
          credential
            ? "An integration credential is available in memory."
            : "Integration mode requires an authentication credential.",
        ),
      );
    }

    const pullRequest = buildGitHubDraftPullRequest(normalized);
    const preflight: GitHubPublishPreflight = {
      snapshotId: requestSnapshotId(normalized),
      mode: normalized.mode,
      repositorySlug: repositorySlug(normalized.repository),
      integrationEnabled,
      credentialState,
      pullRequest,
      checks,
      ready: checks.every((item) => item.status === "passed"),
    };
    return {
      request: normalized,
      preflight,
      credential,
      backend: normalized.mode === "mock" ? mockBackend : integrationBackend,
    };
  }

  return {
    allowedRepositories,
    integrationEnabled,
    async preflight(request) {
      return (await inspect(request)).preflight;
    },
    async publish(request, expectedPreflight) {
      const inspected = await inspect(request);
      const { preflight } = inspected;
      if (
        expectedPreflight.snapshotId !== preflight.snapshotId ||
        expectedPreflight.ready !== preflight.ready
      ) {
        throw new Error("GitHub publish preflight is stale; run it again.");
      }
      if (!preflight.ready || !inspected.backend) {
        return blockedResult(preflight, maxAttempts);
      }

      try {
        const branch = await inspected.backend.pushBranch(
          {
            repository: inspected.request.repository,
            branchName: inspected.request.source.branchName,
            headSha: inspected.request.source.headSha,
          },
          inspected.credential,
        );
        const pullRequest = await inspected.backend.createDraftPullRequest(
          preflight.pullRequest,
          inspected.credential,
        );
        const previousAttempts = retryAttempts.get(preflight.snapshotId) ?? 0;
        retryAttempts.delete(preflight.snapshotId);
        return {
          status:
            branch.state === "already-exists" &&
            pullRequest.state === "already-exists"
              ? "already-exists"
              : "created",
          backend: inspected.backend.kind,
          repositorySlug: preflight.repositorySlug,
          branch,
          pullRequest,
          checks: preflight.checks,
          retry: {
            state: "idle",
            attempt: previousAttempts,
            maxAttempts,
          },
        };
      } catch (error) {
        if (error instanceof GitHubNetworkError) {
          const attempt = (retryAttempts.get(preflight.snapshotId) ?? 0) + 1;
          retryAttempts.set(preflight.snapshotId, attempt);
          const pending = error.retryable && attempt < maxAttempts;
          return {
            status: pending ? "retry-required" : "blocked",
            backend: inspected.backend.kind,
            repositorySlug: preflight.repositorySlug,
            checks: [
              ...preflight.checks,
              check(
                pending ? "NETWORK_RETRY_PENDING" : "NETWORK_RETRY_EXHAUSTED",
                false,
                error.message,
              ),
            ],
            retry: {
              state: pending ? "pending" : "exhausted",
              attempt,
              maxAttempts,
              ...(pending ? { retryAfterMs: error.retryAfterMs } : {}),
            },
          };
        }
        if (error instanceof GitHubBackendConflictError) {
          return {
            status: "blocked",
            backend: inspected.backend.kind,
            repositorySlug: preflight.repositorySlug,
            checks: [
              ...preflight.checks,
              check(error.code, false, error.message),
            ],
            retry: { state: "idle", attempt: 0, maxAttempts },
          };
        }
        throw error;
      }
    },
  };
}

export function buildGitHubDraftPullRequest(
  request: GitHubPublishRequest,
): GitHubDraftPullRequest {
  const normalized = normalizeRequest(request);
  const changedPaths = normalized.source.changedPaths.filter(isSafeRelativePath);
  const changedFileLines = changedPaths.length
    ? changedPaths.map((path) => `- \`${path}\``).join("\n")
    : "- No publishable paths were supplied.";
  return {
    repository: normalized.repository,
    title: normalized.source.title,
    body: [
      "## Summary",
      "",
      `Publish content branch \`${normalized.source.branchName}\` at \`${normalized.source.headSha}\`.`,
      "",
      "## Changed files",
      "",
      changedFileLines,
      "",
      "## Validation",
      "",
      "- Local content commit completed.",
      "- Pull request remains a draft for human review.",
    ].join("\n"),
    head: normalized.source.branchName,
    base: normalized.source.baseBranch,
    draft: true,
  };
}

export const defaultGitHubPublishApi = createGitHubPublishApi();

function buildSafetyChecks(
  request: GitHubPublishRequest,
  allowedSlugs: ReadonlySet<string>,
  integrationEnabled: boolean,
  integrationBackend: GitHubBackend | undefined,
) {
  const sourceBranch = request.source.branchName;
  const baseBranch = request.source.baseBranch;
  const protectedBranch = /^(main|master)$/i.test(sourceBranch);
  const checks = [
    check(
      "REPOSITORY_ALLOWED",
      allowedSlugs.has(repositorySlug(request.repository)),
      "The target repository must be present in the configured allowlist.",
    ),
    check(
      "WORKTREE_CLEAN",
      request.source.worktreeClean,
      "The local content worktree must be clean before publication.",
    ),
    check(
      "SOURCE_BRANCH_SAFE",
      isSafeBranchName(sourceBranch) && !protectedBranch && sourceBranch !== baseBranch,
      "The source branch must be a non-protected branch distinct from the base branch.",
    ),
    check(
      "HEAD_SHA_VALID",
      /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(request.source.headSha),
      "The source commit must be a full Git object ID.",
    ),
    check(
      "CHANGED_PATHS_SAFE",
      request.source.changedPaths.length > 0 &&
        request.source.changedPaths.every(isSafeRelativePath),
      "Changed files must be repository-relative paths without traversal.",
    ),
    check(
      "DRAFT_PR_VALID",
      Boolean(request.source.title) && isSafeBranchName(baseBranch),
      "A title and valid base branch are required for the Draft PR.",
    ),
  ];

  if (request.mode === "integration") {
    checks.push(
      check(
        "INTEGRATION_ENABLED",
        integrationEnabled,
        "Integration mode is disabled unless the host explicitly enables it.",
      ),
      check(
        "INTEGRATION_BACKEND_AVAILABLE",
        Boolean(integrationBackend),
        "Integration mode requires an explicitly configured backend.",
      ),
    );
  }
  return checks;
}

function blockedResult(
  preflight: GitHubPublishPreflight,
  maxAttempts: number,
): GitHubPublishResult {
  return {
    status: "blocked",
    backend: preflight.mode,
    repositorySlug: preflight.repositorySlug,
    checks: preflight.checks,
    retry: { state: "idle", attempt: 0, maxAttempts },
  };
}

function normalizeRequest(request: GitHubPublishRequest): GitHubPublishRequest {
  return {
    mode: request.mode,
    repository: normalizeRepository(request.repository),
    source: {
      branchName: request.source.branchName.trim(),
      headSha: request.source.headSha.trim(),
      baseBranch: request.source.baseBranch.trim(),
      worktreeClean: request.source.worktreeClean,
      changedPaths: [...new Set(request.source.changedPaths.map(normalizePath))],
      title: request.source.title.trim(),
    },
  };
}

function normalizeRepository(repository: GitHubRepository): GitHubRepository {
  return {
    owner: repository.owner.trim().toLowerCase(),
    name: repository.name.trim().toLowerCase(),
  };
}

function repositorySlug(repository: GitHubRepository) {
  return `${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`;
}

function branchKey(repository: GitHubRepository, branchName: string) {
  return `${repositorySlug(repository)}:${branchName}`;
}

function pullRequestKey(request: GitHubDraftPullRequest) {
  return `${repositorySlug(request.repository)}:${request.head}:${request.base}`;
}

function requestSnapshotId(request: GitHubPublishRequest) {
  return JSON.stringify(request);
}

function normalizePath(path: string) {
  return path.trim().replaceAll("\\", "/");
}

function isSafeRelativePath(path: string) {
  const normalized = normalizePath(path);
  const segments = normalized.split("/");
  return (
    Boolean(normalized) &&
    !normalized.startsWith("/") &&
    !/^[a-z]:/i.test(normalized) &&
    !normalized.includes("\0") &&
    segments.every((segment) => segment && segment !== "." && segment !== "..")
  );
}

function isSafeBranchName(branchName: string) {
  return (
    Boolean(branchName) &&
    branchName.length <= 255 &&
    !branchName.startsWith("-") &&
    !branchName.startsWith("/") &&
    !branchName.endsWith("/") &&
    !branchName.endsWith(".") &&
    !branchName.includes("..") &&
    !branchName.includes("@{") &&
    !/[\s~^:?*[\]\\]/.test(branchName)
  );
}

function check(code: string, passed: boolean, message: string): GitHubSafetyCheck {
  return {
    code,
    status: passed ? "passed" : "blocked",
    message,
  };
}
