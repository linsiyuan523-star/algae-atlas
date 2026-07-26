import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileText,
  GitCommitHorizontal,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  Search,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { inspectDraft } from "../drafts";
import type { Draft, DraftApi } from "../drafts";
import { defaultGitHubPublishApi } from "../github-publish";
import type { GitHubPublishApi } from "../github-publish";
import type { MediaApi, StagedImage } from "../media";
import {
  createExportPlan,
  runRepositoryBundleExport,
  runRepositoryBundlePreflight,
  runRepositoryExportDryRun,
  runRepositoryLocalCommit,
} from "../repository";
import { GitHubDraftPrPanel } from "./GitHubDraftPrPanel";
import type {
  ExportDryRunResult,
  PlannedGitOperation,
  PlannedTarget,
  RepositoryApi,
  RepositoryBundleExportResult,
  RepositoryBundlePreflightResult,
  RepositoryImageFile,
  RepositoryLocalCommitResult,
  RepositoryTextFile,
} from "../repository";

type RepositoryExportPageProps = {
  draftApi: DraftApi;
  mediaApi: MediaApi;
  repositoryApi: RepositoryApi;
  githubPublishApi?: GitHubPublishApi;
  initialRepositoryPath?: string;
  initialDraftId?: string;
  showGitHubDraftPr?: boolean;
  now?: () => Date;
};

type PreparedCommit = {
  draft: Draft;
  images: StagedImage[];
  plannedAt: Date;
};

export function RepositoryExportPage({
  draftApi,
  mediaApi,
  repositoryApi,
  githubPublishApi = defaultGitHubPublishApi,
  initialRepositoryPath = "",
  initialDraftId = "",
  showGitHubDraftPr = false,
  now = () => new Date(),
}: RepositoryExportPageProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState(initialDraftId);
  const [repositoryPath, setRepositoryPath] = useState(initialRepositoryPath);
  const [result, setResult] = useState<ExportDryRunResult | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [prepared, setPrepared] = useState<PreparedCommit | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [commitResult, setCommitResult] =
    useState<RepositoryLocalCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    draftApi
      .listDrafts()
      .then((loaded) => {
        if (!current) {
          return;
        }
        setDrafts(loaded);
        setSelectedDraftId((selected) =>
          loaded.some((draft) => draft.draftId === initialDraftId)
            ? initialDraftId
            : loaded.some((draft) => draft.draftId === selected)
            ? selected
            : (loaded[0]?.draftId ?? ""),
        );
        setError(null);
      })
      .catch((caught: unknown) => {
        if (current) {
          setError(`无法读取草稿：${describeError(caught)}`);
        }
      })
      .finally(() => {
        if (current) {
          setLoadingDrafts(false);
        }
      });

    return () => {
      current = false;
    };
  }, [draftApi, initialDraftId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPath = repositoryPath.trim();
    if (!selectedDraftId || !selectedPath) {
      setError("请选择草稿并填写仓库根目录。");
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    setPrepared(null);
    setConfirmed(false);
    setCommitResult(null);
    try {
      const draft = await draftApi.openDraft(selectedDraftId);
      const images = await mediaApi.listImages(selectedDraftId);
      const plannedAt = now();
      const nextResult = await runRepositoryExportDryRun(
        repositoryApi,
        selectedPath,
        draft,
        images,
        plannedAt,
      );
      setResult(nextResult);
      setPrepared({ draft, images, plannedAt });
    } catch (caught: unknown) {
      setError(`预演失败：${describeError(caught)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleCommit() {
    if (!confirmed || !result?.ready || !prepared) {
      setError("请先完成预演并确认本地提交内容。");
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      setCommitResult(
        await runRepositoryLocalCommit(
          repositoryApi,
          repositoryPath.trim(),
          prepared.draft,
          prepared.images,
          result,
          prepared.plannedAt,
        ),
      );
      setConfirmed(false);
    } catch (caught: unknown) {
      setError(`本地提交失败：${describeError(caught)}`);
    } finally {
      setCommitting(false);
    }
  }

  function clearPreparedResult() {
    setResult(null);
    setPrepared(null);
    setConfirmed(false);
    setCommitResult(null);
  }

  const publicationPlan = prepared
    ? createExportPlan(prepared.draft, prepared.images, prepared.plannedAt)
    : null;
  const busy = running || committing;

  return (
    <div className="repository-export">
      {!loadingDrafts && drafts.length === 0 && !error ? (
        <div className="empty-state" role="status">
          <Inbox aria-hidden="true" size={28} strokeWidth={1.6} />
          <p>目前没有可导出的草稿。</p>
        </div>
      ) : (
        <form className="repository-export-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="export-draft">导出草稿</label>
            <select
              id="export-draft"
              value={selectedDraftId}
              disabled={loadingDrafts || busy}
              onChange={(event) => {
                setSelectedDraftId(event.target.value);
                clearPreparedResult();
              }}
            >
              {loadingDrafts ? <option value="">正在读取草稿...</option> : null}
              {drafts.map((draft) => (
                <option key={draft.draftId} value={draft.draftId}>
                  {draftLabel(draft)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group repository-path-field">
            <label htmlFor="repository-path">仓库根目录</label>
            <input
              id="repository-path"
              type="text"
              value={repositoryPath}
              placeholder="D:\\project-worktree"
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setRepositoryPath(event.target.value);
                clearPreparedResult();
              }}
            />
          </div>
          <button
            className="primary-button repository-run-button"
            type="submit"
            disabled={loadingDrafts || busy || drafts.length === 0}
          >
            {running ? (
              <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
            ) : (
              <Search aria-hidden="true" size={18} />
            )}
            {running ? "正在预演" : "诊断并预演"}
          </button>
        </form>
      )}

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <DryRunReport result={result} /> : null}
      {result?.ready && publicationPlan && !commitResult ? (
        <LocalCommitPanel
          branchName={publicationPlan.request.branchName}
          textFiles={publicationPlan.textFiles}
          imageFiles={publicationPlan.imageFiles}
          confirmed={confirmed}
          committing={committing}
          onConfirmedChange={setConfirmed}
          onCommit={handleCommit}
        />
      ) : null}
      {commitResult ? (
        <>
          <LocalCommitResult result={commitResult} />
          {showGitHubDraftPr ? (
            <GitHubDraftPrPanel api={githubPublishApi} commit={commitResult} />
          ) : null}
        </>
      ) : null}
      <BundleExportPanel repositoryApi={repositoryApi} />
    </div>
  );
}

function LocalCommitPanel({
  branchName,
  textFiles,
  imageFiles,
  confirmed,
  committing,
  onConfirmedChange,
  onCommit,
}: {
  branchName: string;
  textFiles: RepositoryTextFile[];
  imageFiles: RepositoryImageFile[];
  confirmed: boolean;
  committing: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onCommit: () => void;
}) {
  return (
    <section className="repository-commit-panel" aria-labelledby="local-commit-title">
      <div className="repository-commit-heading">
        <GitCommitHorizontal aria-hidden="true" size={21} />
        <div>
          <h3 id="local-commit-title">本地内容提交</h3>
          <code>{branchName}</code>
        </div>
      </div>

      <details className="repository-content-preview">
        <summary>新文件内容 ({textFiles.length})</summary>
        <div>
          {textFiles.map((file) => (
            <article key={file.path}>
              <code>{file.path}</code>
              <pre>{file.contents}</pre>
            </article>
          ))}
        </div>
      </details>

      {imageFiles.length ? (
        <ul className="repository-binary-preview" aria-label="图片写入清单">
          {imageFiles.map((file) => (
            <li key={file.path}>
              <ImageIcon aria-hidden="true" size={16} />
              <code>{file.path}</code>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="repository-commit-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={committing}
          onChange={(event) => onConfirmedChange(event.target.checked)}
        />
        <span>确认创建上述本地分支，并仅提交所列文件</span>
      </label>
      <button
        className="primary-button repository-commit-button"
        type="button"
        disabled={!confirmed || committing}
        onClick={onCommit}
      >
        {committing ? (
          <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
        ) : (
          <GitCommitHorizontal aria-hidden="true" size={18} />
        )}
        {committing ? "正在创建提交" : "创建本地提交"}
      </button>
    </section>
  );
}

function LocalCommitResult({ result }: { result: RepositoryLocalCommitResult }) {
  return (
    <section className="repository-commit-result" role="status">
      <CheckCircle2 aria-hidden="true" size={24} />
      <div>
        <strong>本地提交完成</strong>
        <span>{result.branchName}</span>
        <code>{result.commitSha}</code>
        <small>{result.commitMessage}</small>
      </div>
    </section>
  );
}

function BundleExportPanel({ repositoryApi }: { repositoryApi: RepositoryApi }) {
  const [repositoryPath, setRepositoryPath] = useState("");
  const [destinationDirectory, setDestinationDirectory] = useState("");
  const [preflight, setPreflight] =
    useState<RepositoryBundlePreflightResult | null>(null);
  const [exportResult, setExportResult] =
    useState<RepositoryBundleExportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearPreflight() {
    setPreflight(null);
    setExportResult(null);
    setConfirmed(false);
  }

  async function handlePreflight(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedRepository = repositoryPath.trim();
    const selectedDestination = destinationDirectory.trim();
    if (!selectedRepository || !selectedDestination) {
      setError("请填写源仓库根目录和目标交接目录。");
      return;
    }

    setRunning(true);
    setError(null);
    clearPreflight();
    try {
      setPreflight(
        await runRepositoryBundlePreflight(
          repositoryApi,
          selectedRepository,
          selectedDestination,
        ),
      );
    } catch (caught: unknown) {
      setError(`Bundle 预检失败：${describeError(caught)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleExport() {
    if (!confirmed || !preflight?.ready) {
      setError("请先完成 Bundle 预检并确认导出。");
      return;
    }

    setExporting(true);
    setError(null);
    try {
      setExportResult(
        await runRepositoryBundleExport(
          repositoryApi,
          preflight,
          repositoryPath.trim(),
          destinationDirectory.trim(),
        ),
      );
      setConfirmed(false);
    } catch (caught: unknown) {
      setError(`Bundle 导出失败：${describeError(caught)}`);
    } finally {
      setExporting(false);
    }
  }

  const busy = running || exporting;
  return (
    <section className="repository-bundle-panel" aria-labelledby="bundle-export-title">
      <div className="repository-commit-heading">
        <Archive aria-hidden="true" size={21} />
        <div>
          <h3 id="bundle-export-title">离线 Bundle 交接</h3>
          <span>完整内容分支</span>
        </div>
      </div>

      <form className="repository-bundle-form" onSubmit={handlePreflight}>
        <div className="field-group repository-path-field">
          <label htmlFor="bundle-repository-path">源仓库根目录</label>
          <input
            id="bundle-repository-path"
            type="text"
            value={repositoryPath}
            placeholder="D:\\project-worktree"
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setRepositoryPath(event.target.value);
              clearPreflight();
            }}
          />
        </div>
        <div className="field-group repository-path-field">
          <label htmlFor="bundle-destination-directory">目标交接目录</label>
          <input
            id="bundle-destination-directory"
            type="text"
            value={destinationDirectory}
            placeholder="E:\\content-handoff"
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setDestinationDirectory(event.target.value);
              clearPreflight();
            }}
          />
        </div>
        <button
          className="secondary-button repository-bundle-run-button"
          type="submit"
          disabled={busy}
        >
          {running ? (
            <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
          ) : (
            <Search aria-hidden="true" size={18} />
          )}
          {running ? "正在预检" : "预检 Bundle"}
        </button>
      </form>

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
      {preflight ? <BundlePreflightReport result={preflight} /> : null}
      {preflight?.ready && !exportResult ? (
        <div className="repository-bundle-confirmation">
          <label className="repository-commit-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>确认导出完整分支并创建上述交接目录</span>
          </label>
          <button
            className="primary-button repository-commit-button"
            type="button"
            disabled={!confirmed || busy}
            onClick={handleExport}
          >
            {exporting ? (
              <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
            ) : (
              <Archive aria-hidden="true" size={18} />
            )}
            {exporting ? "正在导出" : "导出离线交接包"}
          </button>
        </div>
      ) : null}
      {exportResult ? <BundleExportResult result={exportResult} /> : null}
    </section>
  );
}

function BundlePreflightReport({ result }: { result: RepositoryBundlePreflightResult }) {
  return (
    <div
      className={`repository-bundle-summary ${result.ready ? "is-ready" : "is-blocked"}`}
      role="status"
    >
      {result.ready ? (
        <CheckCircle2 aria-hidden="true" size={21} />
      ) : (
        <AlertTriangle aria-hidden="true" size={21} />
      )}
      <div>
        <strong>{result.ready ? "Bundle 预检通过" : "Bundle 预检被阻止"}</strong>
        <dl>
          <Diagnostic label="分支" value={result.branchName ?? "未识别"} mono />
          <Diagnostic label="HEAD" value={shortSha(result.headSha)} mono />
          <Diagnostic label="Bundle" value={result.bundleFileName ?? "未生成"} mono />
          <Diagnostic label="改动文件" value={`${result.changedFiles.length} 个`} />
        </dl>
      </div>
      {result.conflicts.length ? (
        <ul className="repository-conflict-list" aria-label="Bundle 预检阻断项">
          {result.conflicts.map((item, index) => (
            <li key={`${item.code}-${item.path ?? ""}-${index}`}>
              <div>
                <code>{item.code}</code>
                {item.path ? <span>{item.path}</span> : null}
              </div>
              <strong>{item.message}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BundleExportResult({ result }: { result: RepositoryBundleExportResult }) {
  return (
    <section className="repository-commit-result repository-bundle-result" role="status">
      <CheckCircle2 aria-hidden="true" size={24} />
      <div>
        <strong>离线交接包已验证</strong>
        <code>{result.destinationDirectory}</code>
        <span>{result.bundleFileName}</span>
        <code>{result.sha256}</code>
        <small>{result.importBranchName}</small>
        <ul aria-label="交接文件清单">
          {result.artifactNames.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DryRunReport({ result }: { result: ExportDryRunResult }) {
  const diagnostics = result.diagnostics;
  return (
    <div className="repository-report">
      <section
        className={`repository-summary ${result.ready ? "is-ready" : "is-blocked"}`}
        aria-label="预演结果"
        role="status"
      >
        {result.ready ? (
          <CheckCircle2 aria-hidden="true" size={22} />
        ) : (
          <AlertTriangle aria-hidden="true" size={22} />
        )}
        <div>
          <strong>{result.ready ? "预演通过" : "预演被阻止"}</strong>
          <span>
            {result.ready
              ? "仓库状态、目标路径与 Schema 均通过。"
              : `${result.conflicts.length} 项仓库冲突，${result.schema.issues.filter((issue) => issue.severity === "error").length} 项 Schema 错误。`}
          </span>
        </div>
      </section>

      <ReportSection title="仓库诊断">
        <dl className="repository-diagnostics">
          <Diagnostic label="Git 仓库" value={yesNo(diagnostics.isGitRepository)} />
          <Diagnostic label="当前分支" value={diagnostics.currentBranch ?? "detached"} mono />
          <Diagnostic
            label="工作区"
            value={
              diagnostics.worktreeClean === undefined
                ? "未检查"
                : diagnostics.worktreeClean
                  ? "干净"
                  : "有改动"
            }
          />
          <Diagnostic label="HEAD" value={shortSha(diagnostics.headSha)} mono />
          <Diagnostic label="Git" value={toolVersion(diagnostics.git)} mono />
          <Diagnostic label="Node" value={toolVersion(diagnostics.node)} mono />
          <Diagnostic
            label="Remote"
            value={diagnostics.remotes.length ? diagnostics.remotes.join(", ") : "无"}
            mono
          />
          <Diagnostic
            label="项目脚本"
            value={`${diagnostics.projectScripts.length} 个`}
          />
        </dl>
        <p className="repository-root-path">
          <span>规范仓库根目录</span>
          <code>{diagnostics.canonicalRoot ?? diagnostics.selectedPath}</code>
        </p>
        {diagnostics.status.length ? (
          <ul className="repository-status-list" aria-label="工作区状态">
            {diagnostics.status.map((status) => (
              <li key={status}>
                <code>{status}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </ReportSection>

      <ReportSection title="项目脚本">
        {diagnostics.projectScripts.length ? (
          <div className="repository-script-table" role="table" aria-label="项目脚本">
            {diagnostics.projectScripts.map((script) => (
              <div className="repository-script-row" role="row" key={script.name}>
                <code role="cell">{script.name}</code>
                <span role="cell">{script.command}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="repository-section-empty">未检测到项目脚本。</p>
        )}
      </ReportSection>

      <div className="repository-target-columns">
        <ReportSection title={`内容目标 (${result.contentTargets.length})`}>
          <TargetList targets={result.contentTargets} icon="content" />
        </ReportSection>
        <ReportSection title={`图片目标 (${result.imageTargets.length})`}>
          <TargetList targets={result.imageTargets} icon="image" />
        </ReportSection>
      </div>

      <ReportSection title="Schema 结果">
        <div className={`schema-result-line ${result.schema.valid ? "is-valid" : "is-invalid"}`}>
          {result.schema.valid ? (
            <CheckCircle2 aria-hidden="true" size={18} />
          ) : (
            <AlertTriangle aria-hidden="true" size={18} />
          )}
          <strong>{result.schema.valid ? "通过" : "未通过"}</strong>
          <span>{result.schema.issues.length} 项结果</span>
        </div>
        {result.schema.issues.length ? (
          <ul className="repository-issue-list">
            {result.schema.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.path}-${index}`}>
                <div>
                  <code>{issue.code}</code>
                  <span className={`issue-severity is-${issue.severity}`}>
                    {issue.severity === "error" ? "错误" : "警告"}
                  </span>
                </div>
                <strong>{issue.message}</strong>
                <span>{issue.path}</span>
                <p>{issue.remedy}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="repository-section-empty">候选记录、正文与图片元数据均通过。</p>
        )}
      </ReportSection>

      <ReportSection title={`冲突 (${result.conflicts.length})`}>
        {result.conflicts.length ? (
          <ul className="repository-conflict-list">
            {result.conflicts.map((conflict, index) => (
              <li key={`${conflict.code}-${conflict.path ?? index}`}>
                <AlertTriangle aria-hidden="true" size={17} />
                <div>
                  <code>{conflict.code}</code>
                  <strong>{conflict.message}</strong>
                  {conflict.path ? <span>{conflict.path}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="repository-section-empty">未检测到冲突。</p>
        )}
      </ReportSection>

      <ReportSection title="拟执行 Git 操作">
        <ol className="repository-git-plan">
          {result.plannedGitOperations.map((operation, index) => (
            <li key={`${operation.description}-${index}`}>
              <Terminal aria-hidden="true" size={17} />
              <div>
                <span>{operation.description}</span>
                <code>{formatCommand(operation)}</code>
              </div>
            </li>
          ))}
        </ol>
      </ReportSection>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="repository-report-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Diagnostic({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "is-mono" : undefined}>{value}</dd>
    </div>
  );
}

function TargetList({
  targets,
  icon,
}: {
  targets: PlannedTarget[];
  icon: "content" | "image";
}) {
  if (!targets.length) {
    return <p className="repository-section-empty">无目标文件。</p>;
  }
  return (
    <ul className="repository-target-list">
      {targets.map((target) => (
        <li key={target.path}>
          {icon === "content" ? (
            <FileText aria-hidden="true" size={17} />
          ) : (
            <ImageIcon aria-hidden="true" size={17} />
          )}
          <code>{target.path}</code>
          <span className={`target-state is-${target.state}`}>
            {targetStateLabel(target.state)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function draftLabel(draft: Draft) {
  const inspection = inspectDraft(draft);
  const title = inspection.fields.titleZh.trim() || "未命名草稿";
  const id = inspection.fields.stableId || draft.draftId;
  return `${title} (${id})`;
}

function targetStateLabel(state: PlannedTarget["state"]) {
  switch (state) {
    case "new":
      return "新文件";
    case "existing":
      return "已存在";
    case "case-conflict":
      return "大小写冲突";
    case "unsafe":
      return "不安全";
    case "unchecked":
      return "未检查";
  }
}

function toolVersion(tool: { available: boolean; version?: string }) {
  return tool.available ? (tool.version ?? "可用") : "不可用";
}

function yesNo(value: boolean) {
  return value ? "是" : "否";
}

function shortSha(value?: string) {
  return value ? value.slice(0, 12) : "不可用";
}

function formatCommand(operation: PlannedGitOperation) {
  return [operation.program, ...operation.args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "仓库预演失败。";
}
