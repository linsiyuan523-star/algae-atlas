import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  Search,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { inspectDraft } from "../drafts";
import type { Draft, DraftApi } from "../drafts";
import type { MediaApi } from "../media";
import {
  runRepositoryExportDryRun,
} from "../repository";
import type {
  ExportDryRunResult,
  PlannedGitOperation,
  PlannedTarget,
  RepositoryApi,
} from "../repository";

type RepositoryExportPageProps = {
  draftApi: DraftApi;
  mediaApi: MediaApi;
  repositoryApi: RepositoryApi;
  now?: () => Date;
};

export function RepositoryExportPage({
  draftApi,
  mediaApi,
  repositoryApi,
  now = () => new Date(),
}: RepositoryExportPageProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [result, setResult] = useState<ExportDryRunResult | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [running, setRunning] = useState(false);
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
          loaded.some((draft) => draft.draftId === selected)
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
  }, [draftApi]);

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
    try {
      const draft = await draftApi.openDraft(selectedDraftId);
      const images = await mediaApi.listImages(selectedDraftId);
      setResult(
        await runRepositoryExportDryRun(
          repositoryApi,
          selectedPath,
          draft,
          images,
          now(),
        ),
      );
    } catch (caught: unknown) {
      setError(`预演失败：${describeError(caught)}`);
    } finally {
      setRunning(false);
    }
  }

  if (!loadingDrafts && drafts.length === 0 && !error) {
    return (
      <div className="empty-state" role="status">
        <Inbox aria-hidden="true" size={28} strokeWidth={1.6} />
        <p>目前没有可导出的草稿。</p>
      </div>
    );
  }

  return (
    <div className="repository-export">
      <form className="repository-export-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="export-draft">导出草稿</label>
          <select
            id="export-draft"
            value={selectedDraftId}
            disabled={loadingDrafts || running}
            onChange={(event) => {
              setSelectedDraftId(event.target.value);
              setResult(null);
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
            disabled={running}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setRepositoryPath(event.target.value);
              setResult(null);
            }}
          />
        </div>
        <button
          className="primary-button repository-run-button"
          type="submit"
          disabled={loadingDrafts || running || drafts.length === 0}
        >
          {running ? (
            <LoaderCircle className="repository-spinner" aria-hidden="true" size={18} />
          ) : (
            <Search aria-hidden="true" size={18} />
          )}
          {running ? "正在预演" : "诊断并预演"}
        </button>
      </form>

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <DryRunReport result={result} /> : null}
    </div>
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
