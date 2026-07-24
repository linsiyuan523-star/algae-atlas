import { expect, test, vi } from "vitest";
import {
  createGitHubPublishApi,
  createMockGitHubBackend,
} from "./github-publish";
import type {
  GitHubBackend,
  GitHubPublishRequest,
  GitHubRepository,
} from "./github-publish";

const repository: GitHubRepository = {
  owner: "fictional-algae-team",
  name: "algae-atlas",
};

function request(
  overrides: Partial<GitHubPublishRequest["source"]> = {},
  mode: GitHubPublishRequest["mode"] = "mock",
): GitHubPublishRequest {
  return {
    mode,
    repository,
    source: {
      branchName: "content/20260724-fictional-news",
      headSha: "a".repeat(40),
      baseBranch: "main",
      worktreeClean: true,
      changedPaths: [
        "content/records/team-news/fictional-news/record.json",
        "content/records/team-news/fictional-news/zh.md",
      ],
      title: "content: publish fictional-news",
      ...overrides,
    },
  };
}

test("uses the offline mock without requesting credentials", async () => {
  const getCredential = vi.fn(async () => null);
  const api = createGitHubPublishApi({
    allowedRepositories: [repository],
    authProvider: { getCredential },
  });
  const publishRequest = request();

  const preflight = await api.preflight(publishRequest);
  const result = await api.publish(publishRequest, preflight);

  expect(preflight).toMatchObject({
    mode: "mock",
    repositorySlug: "fictional-algae-team/algae-atlas",
    credentialState: "not-required",
    integrationEnabled: false,
    ready: true,
    pullRequest: {
      draft: true,
      head: "content/20260724-fictional-news",
      base: "main",
    },
  });
  expect(preflight.pullRequest.body).toContain(
    "content/records/team-news/fictional-news/record.json",
  );
  expect(result).toMatchObject({
    status: "created",
    backend: "mock",
    branch: { state: "created", headSha: "a".repeat(40) },
    pullRequest: {
      state: "created",
      draft: true,
      url: "https://github.invalid/fictional-algae-team/algae-atlas/pull/1",
    },
  });
  expect(getCredential).not.toHaveBeenCalled();
});

test("treats an existing branch and Draft PR as an idempotent success", async () => {
  const api = createGitHubPublishApi({ allowedRepositories: [repository] });
  const publishRequest = request();
  const preflight = await api.preflight(publishRequest);

  const first = await api.publish(publishRequest, preflight);
  const duplicate = await api.publish(publishRequest, preflight);

  expect(first.status).toBe("created");
  expect(duplicate).toMatchObject({
    status: "already-exists",
    branch: { state: "already-exists" },
    pullRequest: { state: "already-exists", number: 1 },
  });
});

test("blocks a protected source branch and repositories outside the allowlist", async () => {
  const api = createGitHubPublishApi({ allowedRepositories: [repository] });
  const protectedBranch = await api.preflight(
    request({ branchName: "main" }),
  );
  const unknownRepository = await api.preflight({
    ...request(),
    repository: { owner: "unapproved", name: "algae-atlas" },
  });

  expect(protectedBranch.ready).toBe(false);
  expect(protectedBranch.checks).toContainEqual(
    expect.objectContaining({ code: "SOURCE_BRANCH_SAFE", status: "blocked" }),
  );
  expect(unknownRepository.ready).toBe(false);
  expect(unknownRepository.checks).toContainEqual(
    expect.objectContaining({ code: "REPOSITORY_ALLOWED", status: "blocked" }),
  );
});

test("surfaces retry state and resumes the same idempotent request", async () => {
  const api = createGitHubPublishApi({
    allowedRepositories: [repository],
    mockBackend: createMockGitHubBackend({
      pullRequestFailures: 1,
      retryAfterMs: 250,
    }),
    maxAttempts: 2,
  });
  const publishRequest = request();
  const preflight = await api.preflight(publishRequest);

  const failed = await api.publish(publishRequest, preflight);
  const retried = await api.publish(publishRequest, preflight);

  expect(failed).toMatchObject({
    status: "retry-required",
    retry: {
      state: "pending",
      attempt: 1,
      maxAttempts: 2,
      retryAfterMs: 250,
    },
  });
  expect(failed.checks).toContainEqual(
    expect.objectContaining({ code: "NETWORK_RETRY_PENDING", status: "blocked" }),
  );
  expect(retried).toMatchObject({
    status: "created",
    branch: { state: "already-exists" },
    pullRequest: { state: "created" },
    retry: { state: "idle", attempt: 1 },
  });
});

test("keeps integration disabled by default and never asks for a credential", async () => {
  const getCredential = vi.fn(async () => null);
  const api = createGitHubPublishApi({
    allowedRepositories: [repository],
    authProvider: { getCredential },
  });
  const integrationRequest = request({}, "integration");

  const preflight = await api.preflight(integrationRequest);
  const result = await api.publish(integrationRequest, preflight);

  expect(preflight).toMatchObject({
    integrationEnabled: false,
    credentialState: "disabled",
    ready: false,
  });
  expect(preflight.checks).toContainEqual(
    expect.objectContaining({ code: "INTEGRATION_ENABLED", status: "blocked" }),
  );
  expect(result.status).toBe("blocked");
  expect(getCredential).not.toHaveBeenCalled();
});

test("blocks an enabled integration backend when credentials are absent", async () => {
  const mock = createMockGitHubBackend();
  const pushBranch = vi.fn(mock.pushBranch);
  const createDraftPullRequest = vi.fn(mock.createDraftPullRequest);
  const integrationBackend: GitHubBackend = {
    kind: "integration",
    pushBranch,
    createDraftPullRequest,
  };
  const api = createGitHubPublishApi({
    allowedRepositories: [repository],
    integrationEnabled: true,
    integrationBackend,
    authProvider: { getCredential: async () => null },
  });
  const integrationRequest = request({}, "integration");

  const preflight = await api.preflight(integrationRequest);
  const result = await api.publish(integrationRequest, preflight);

  expect(preflight.credentialState).toBe("missing");
  expect(preflight.checks).toContainEqual(
    expect.objectContaining({ code: "AUTH_AVAILABLE", status: "blocked" }),
  );
  expect(result.status).toBe("blocked");
  expect(pushBranch).not.toHaveBeenCalled();
  expect(createDraftPullRequest).not.toHaveBeenCalled();
});

test("blocks a duplicate branch whose existing head differs", async () => {
  const api = createGitHubPublishApi({
    allowedRepositories: [repository],
    mockBackend: createMockGitHubBackend({
      initialBranches: [
        {
          repository,
          branchName: "content/20260724-fictional-news",
          headSha: "b".repeat(40),
        },
      ],
    }),
  });
  const publishRequest = request();
  const preflight = await api.preflight(publishRequest);

  const result = await api.publish(publishRequest, preflight);

  expect(result.status).toBe("blocked");
  expect(result.checks).toContainEqual(
    expect.objectContaining({ code: "BRANCH_HEAD_CONFLICT", status: "blocked" }),
  );
});
