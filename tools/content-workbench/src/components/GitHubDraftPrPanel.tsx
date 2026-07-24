import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequestDraft,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type {
  GitHubPublishApi,
  GitHubPublishPreflight,
  GitHubPublishRequest,
  GitHubPublishResult,
  GitHubRepository,
} from "../github-publish";
import type { RepositoryLocalCommitResult } from "../repository";

type GitHubDraftPrPanelProps = {
  api: GitHubPublishApi;
  commit: RepositoryLocalCommitResult;
};

export function GitHubDraftPrPanel({ api, commit }: GitHubDraftPrPanelProps) {
  const [repositorySlug, setRepositorySlug] = useState(
    formatRepository(api.allowedRepositories[0]),
  );
  const [baseBranch, setBaseBranch] = useState("main");
  const [title, setTitle] = useState(commit.commitMessage);
  const [integrationMode, setIntegrationMode] = useState(false);
  const [preflight, setPreflight] = useState<GitHubPublishPreflight | null>(null);
  const [preparedRequest, setPreparedRequest] =
    useState<GitHubPublishRequest | null>(null);
  const [publishResult, setPublishResult] = useState<GitHubPublishResult | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearPrepared() {
    setPreflight(null);
    setPreparedRequest(null);
    setPublishResult(null);
    setConfirmed(false);
  }

  function selectedRepository() {
    return api.allowedRepositories.find(
      (repository) => formatRepository(repository) === repositorySlug,
    );
  }

  function createRequest(repository: GitHubRepository): GitHubPublishRequest {
    return {
      mode: integrationMode ? "integration" : "mock",
      repository,
      source: {
        branchName: commit.branchName,
        headSha: commit.commitSha,
        baseBranch,
        worktreeClean: true,
        changedPaths: commit.committedPaths,
        title,
      },
    };
  }

  async function handlePreflight(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repository = selectedRepository();
    if (!repository || !baseBranch.trim() || !title.trim()) {
      setError("请填写目标仓库、基础分支和 Draft PR 标题。");
      return;
    }

    const request = createRequest(repository);
    setRunning(true);
    setError(null);
    clearPrepared();
    try {
      const nextPreflight = await api.preflight(request);
      setPreparedRequest(request);
      setPreflight(nextPreflight);
    } catch (caught: unknown) {
      setError(`GitHub 预检失败：${describeError(caught)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handlePublish() {
    if (!confirmed || !preparedRequest || !preflight?.ready) {
      setError("请先完成 GitHub 预检并确认运行模式。");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      setPublishResult(await api.publish(preparedRequest, preflight));
      setConfirmed(false);
    } catch (caught: unknown) {
      setError(`Draft PR 模拟失败：${describeError(caught)}`);
    } finally {
      setPublishing(false);
    }
  }

  const busy = running || publishing;
  const retryPending = publishResult?.status === "retry-required";

  return (
    <section className="github-publish-panel" aria-labelledby="github-publish-title">
      <div className="repository-commit-heading">
        <GitPullRequestDraft aria-hidden="true" size={21} />
        <div>
          <h3 id="github-publish-title">GitHub Draft PR</h3>
          <span>{integrationMode ? "Integration" : "Mock / Dry-run"}</span>
        </div>
      </div>

      <form className="github-publish-form" onSubmit={handlePreflight}>
        <div className="field-group">
          <label htmlFor="github-target-repository">目标仓库</label>
          <select
            id="github-target-repository"
            value={repositorySlug}
            disabled={busy || api.allowedRepositories.length === 0}
            onChange={(event) => {
              setRepositorySlug(event.target.value);
              clearPrepared();
            }}
          >
            {api.allowedRepositories.length === 0 ? (
              <option value="">未配置允许仓库</option>
            ) : null}
            {api.allowedRepositories.map((repository) => {
              const slug = formatRepository(repository);
              return (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="github-base-branch">基础分支</label>
          <input
            id="github-base-branch"
            type="text"
            value={baseBranch}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setBaseBranch(event.target.value);
              clearPrepared();
            }}
          />
        </div>
        <div className="field-group github-pr-title-field">
          <label htmlFor="github-pr-title">Draft PR 标题</label>
          <input
            id="github-pr-title"
            type="text"
            value={title}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value);
              clearPrepared();
            }}
          />
        </div>
        <label className="github-integration-switch">
          <input
            type="checkbox"
            checked={integrationMode}
            disabled={busy || !api.integrationEnabled}
            onChange={(event) => {
              setIntegrationMode(event.target.checked);
              clearPrepared();
            }}
          />
          <span>Integration 模式</span>
          <small>{api.integrationEnabled ? "可用" : "未启用"}</small>
        </label>
        <button
          className="secondary-button github-preflight-button"
          type="submit"
          disabled={busy || api.allowedRepositories.length === 0}
        >
          {running ? (
            <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
          ) : (
            <Search aria-hidden="true" size={18} />
          )}
          {running ? "正在预检" : "预检 Draft PR"}
        </button>
      </form>

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
      {preflight ? <GitHubPreflightReport preflight={preflight} /> : null}

      {preflight?.ready ? (
        <div className="github-publish-confirmation">
          <label className="repository-commit-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              {preflight.mode === "mock"
                ? "确认仅运行 Mock，不执行真实 push 或远程 PR"
                : "确认使用已启用的 Integration 后端"}
            </span>
          </label>
          <button
            className="primary-button repository-commit-button"
            type="button"
            disabled={!confirmed || busy}
            onClick={handlePublish}
          >
            {publishing ? (
              <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
            ) : retryPending ? (
              <RefreshCw aria-hidden="true" size={18} />
            ) : (
              <ShieldCheck aria-hidden="true" size={18} />
            )}
            {publishing ? "正在运行" : retryPending ? "重试 Mock" : "运行 Mock"}
          </button>
        </div>
      ) : null}

      {publishResult ? <GitHubPublishReport result={publishResult} /> : null}
    </section>
  );
}

function GitHubPreflightReport({
  preflight,
}: {
  preflight: GitHubPublishPreflight;
}) {
  const blockedChecks = preflight.checks.filter(
    (check) => check.status === "blocked",
  );
  return (
    <div
      className={`repository-bundle-summary ${preflight.ready ? "is-ready" : "is-blocked"}`}
      role="status"
    >
      {preflight.ready ? (
        <CheckCircle2 aria-hidden="true" size={21} />
      ) : (
        <AlertTriangle aria-hidden="true" size={21} />
      )}
      <div>
        <strong>
          {preflight.ready ? "Draft PR 预检通过" : "Draft PR 预检被阻止"}
        </strong>
        <dl>
          <div>
            <dt>模式</dt>
            <dd>{preflight.mode}</dd>
          </div>
          <div>
            <dt>仓库</dt>
            <dd>{preflight.repositorySlug}</dd>
          </div>
          <div>
            <dt>分支</dt>
            <dd>{preflight.pullRequest.head}</dd>
          </div>
          <div>
            <dt>凭据</dt>
            <dd>{preflight.credentialState}</dd>
          </div>
        </dl>
      </div>
      {blockedChecks.length ? (
        <ul className="repository-conflict-list" aria-label="GitHub 预检阻断项">
          {blockedChecks.map((item) => (
            <li key={item.code}>
              <div>
                <code>{item.code}</code>
              </div>
              <strong>{item.message}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <details className="github-pr-preview">
        <summary>Draft PR 描述</summary>
        <strong>{preflight.pullRequest.title}</strong>
        <pre>{preflight.pullRequest.body}</pre>
      </details>
    </div>
  );
}

function GitHubPublishReport({ result }: { result: GitHubPublishResult }) {
  const successful =
    result.status === "created" || result.status === "already-exists";
  const networkCheck = result.checks.find((item) =>
    item.code.startsWith("NETWORK_RETRY_"),
  );
  return (
    <section
      className={`github-publish-result ${successful ? "is-ready" : "is-blocked"}`}
      role="status"
    >
      {successful ? (
        <CheckCircle2 aria-hidden="true" size={23} />
      ) : (
        <AlertTriangle aria-hidden="true" size={23} />
      )}
      <div>
        <strong>{publishResultLabel(result)}</strong>
        <span>{result.repositorySlug}</span>
        {result.branch ? (
          <code>
            {result.branch.branchName} @ {shortSha(result.branch.headSha)}
          </code>
        ) : null}
        {result.pullRequest ? <code>{result.pullRequest.url}</code> : null}
        {networkCheck ? <small>{networkCheck.message}</small> : null}
        {result.retry.state !== "idle" ? (
          <small>
            重试 {result.retry.attempt}/{result.retry.maxAttempts}
          </small>
        ) : null}
      </div>
    </section>
  );
}

function publishResultLabel(result: GitHubPublishResult) {
  switch (result.status) {
    case "created":
      return "Draft PR 模拟完成";
    case "already-exists":
      return "已复用现有 Mock Draft PR";
    case "retry-required":
      return "Mock 网络状态等待重试";
    default:
      return "Draft PR 发布被阻止";
  }
}

function formatRepository(repository: GitHubRepository | undefined) {
  return repository ? `${repository.owner}/${repository.name}` : "";
}

function shortSha(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "未知错误";
}
