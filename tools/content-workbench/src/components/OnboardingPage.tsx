import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  FolderCog,
  HardDriveDownload,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  OnboardingApi,
  OnboardingStatus,
  PathDiagnostic,
} from "../onboarding";

type OnboardingPageProps = {
  api: OnboardingApi;
  initialStatus?: OnboardingStatus | null;
  initialError?: string | null;
  title?: string;
  onStatusChange?: (status: OnboardingStatus) => void;
};

export function OnboardingPage({
  api,
  initialStatus = null,
  initialError = null,
  title = "首次启动设置",
  onStatusChange,
}: OnboardingPageProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(initialStatus);
  const [repositoryPath, setRepositoryPath] = useState("");
  const [draftsDirectory, setDraftsDirectory] = useState("");
  const [stagingDirectory, setStagingDirectory] = useState("");
  const [loading, setLoading] = useState(!initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (initialStatus) {
      applyStatus(initialStatus);
      return;
    }
    void refresh();
    // The API is intentionally injected so desktop and component tests share one path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, initialStatus]);

  function applyStatus(next: OnboardingStatus) {
    setStatus(next);
    setRepositoryPath(next.configuration?.repositoryPath ?? "");
    setDraftsDirectory(
      next.configuration?.draftsDirectory ?? next.defaults.draftsDirectory,
    );
    setStagingDirectory(
      next.configuration?.stagingDirectory ?? next.defaults.stagingDirectory,
    );
    onStatusChange?.(next);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      applyStatus(await api.status());
    } catch (caught: unknown) {
      setError(`无法读取本地诊断：${describeError(caught)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repositoryPath.trim() || !draftsDirectory.trim() || !stagingDirectory.trim()) {
      setError("请填写本地仓库、草稿目录和图片暂存目录。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      applyStatus(
        await api.saveConfiguration({
          repositoryPath: repositoryPath.trim(),
          draftsDirectory: draftsDirectory.trim(),
          stagingDirectory: stagingDirectory.trim(),
        }),
      );
    } catch (caught: unknown) {
      setError(`无法保存本地配置：${describeError(caught)}`);
    } finally {
      setSaving(false);
    }
  }

  const diagnostics = status?.diagnostics;
  const isBusy = loading || saving;

  return (
    <section className="onboarding-page" aria-labelledby="onboarding-title">
      <header className="onboarding-heading">
        <div>
          <span className="section-kicker">本地工作台</span>
          <h2 id="onboarding-title">{title}</h2>
        </div>
        <button
          className="icon-button onboarding-refresh"
          type="button"
          aria-label="刷新本地诊断"
          title="刷新本地诊断"
          disabled={isBusy}
          onClick={() => void refresh()}
        >
          <RefreshCw
            aria-hidden="true"
            className={loading ? "onboarding-spin" : undefined}
            size={18}
          />
        </button>
      </header>

      <form className="onboarding-form" onSubmit={handleSubmit}>
        <div className="onboarding-paths">
          <label className="field-group" htmlFor="onboarding-repository">
            <span>本地仓库</span>
            <input
              id="onboarding-repository"
              type="text"
              autoComplete="off"
              placeholder="D:\\project-repository"
              value={repositoryPath}
              disabled={isBusy}
              onChange={(event) => setRepositoryPath(event.target.value)}
            />
          </label>
          <label className="field-group" htmlFor="onboarding-drafts">
            <span>草稿目录</span>
            <input
              id="onboarding-drafts"
              type="text"
              autoComplete="off"
              value={draftsDirectory}
              disabled={isBusy}
              onChange={(event) => setDraftsDirectory(event.target.value)}
            />
          </label>
          <label className="field-group" htmlFor="onboarding-staging">
            <span>图片暂存目录</span>
            <input
              id="onboarding-staging"
              type="text"
              autoComplete="off"
              value={stagingDirectory}
              disabled={isBusy}
              onChange={(event) => setStagingDirectory(event.target.value)}
            />
          </label>
          <button className="primary-button onboarding-save" type="submit" disabled={isBusy}>
            {saving ? (
              <LoaderCircle className="onboarding-spin" aria-hidden="true" size={18} />
            ) : (
              <Save aria-hidden="true" size={18} />
            )}
            保存本地配置
          </button>
        </div>
        <aside className="offline-bundle-note" aria-label="离线 Bundle 说明">
          <HardDriveDownload aria-hidden="true" size={21} />
          <div>
            <strong>离线 Bundle</strong>
            <p>使用已验证的 Bundle 在本机交接；此向导不会请求 GitHub 登录或发送网络请求。</p>
          </div>
        </aside>
      </form>

      {error ? (
        <p className="operation-error onboarding-error" role="alert">
          {error}
        </p>
      ) : null}
      {status?.restartRequired ? (
        <div className="onboarding-restart" role="status">
          <AlertTriangle aria-hidden="true" size={19} />
          <span>新草稿和暂存目录将在重新启动桌面应用后启用。</span>
        </div>
      ) : null}

      {diagnostics ? (
        <div className="onboarding-diagnostics">
          <DiagnosticSection icon={<Wrench aria-hidden="true" size={19} />} title="开发环境">
            <ul className="onboarding-tool-list" aria-label="开发环境诊断">
              {diagnostics.tools.map((tool) => (
                <li key={tool.id} data-status={tool.available ? "ready" : "blocked"}>
                  {tool.available ? (
                    <CheckCircle2 aria-hidden="true" size={17} />
                  ) : (
                    <CircleX aria-hidden="true" size={17} />
                  )}
                  <span>{tool.label}</span>
                  <code>{tool.version ?? "未检测到"}</code>
                </li>
              ))}
            </ul>
          </DiagnosticSection>
          <DiagnosticSection icon={<FolderCog aria-hidden="true" size={19} />} title="目录权限">
            <div className="onboarding-path-list" aria-label="目录权限诊断">
              {diagnostics.paths.map((path) => (
                <PathStatus key={path.id} path={path} />
              ))}
            </div>
          </DiagnosticSection>
          <div className="onboarding-diagnostic-columns">
            <DiagnosticSection icon={<ShieldCheck aria-hidden="true" size={19} />} title="本地 Git">
              <dl className="onboarding-facts">
                <Fact label="仓库" value={yesNo(diagnostics.localGit.isRepository)} />
                <Fact label="分支" value={diagnostics.localGit.branch ?? "未检测"} mono />
                <Fact label="HEAD" value={diagnostics.localGit.headSha ?? "未检测"} mono />
                <Fact
                  label="工作区"
                  value={
                    diagnostics.localGit.worktreeClean === undefined
                      ? "未检测"
                      : diagnostics.localGit.worktreeClean
                        ? "干净"
                        : `有 ${diagnostics.localGit.statusEntries} 项变更`
                  }
                />
              </dl>
            </DiagnosticSection>
            <DiagnosticSection icon={<ImageIcon aria-hidden="true" size={19} />} title="图片能力">
              <dl className="onboarding-facts">
                <Fact
                  label="输入"
                  value={diagnostics.imageCapabilities.supportedInputFormats.join(" / ")}
                />
                <Fact label="输出" value={diagnostics.imageCapabilities.outputFormat} />
                <Fact
                  label="最大源文件"
                  value={formatBytes(diagnostics.imageCapabilities.maxSourceBytes)}
                />
                <Fact
                  label="隐私元数据"
                  value={diagnostics.imageCapabilities.privacyMetadataRemoved ? "导出时移除" : "未移除"}
                />
              </dl>
            </DiagnosticSection>
          </div>
          <DiagnosticSection icon={<ShieldCheck aria-hidden="true" size={19} />} title="应用数据">
            <dl className="onboarding-facts onboarding-data-facts">
              <Fact label="草稿" value={`${diagnostics.applicationData.draftCount} 份`} />
              <Fact label="已暂存图片" value={`${diagnostics.applicationData.stagedImageCount} 张`} />
              <Fact label="数据目录" value={diagnostics.applicationData.appDataDirectory} mono />
              <Fact label="配置文件" value={diagnostics.applicationData.configurationFile} mono />
            </dl>
          </DiagnosticSection>
        </div>
      ) : (
        <div className="onboarding-loading" role="status">
          <LoaderCircle className="onboarding-spin" aria-hidden="true" size={20} />
          <span>正在读取本地诊断...</span>
        </div>
      )}
    </section>
  );
}

function DiagnosticSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="onboarding-diagnostic-section">
      <h3>
        {icon}
        <span>{title}</span>
      </h3>
      {children}
    </section>
  );
}

function PathStatus({ path }: { path: PathDiagnostic }) {
  const ready = path.exists && path.isDirectory && path.readable && path.writable;
  return (
    <article className="onboarding-path-status" data-status={ready ? "ready" : "blocked"}>
      <div>
        {ready ? (
          <CheckCircle2 aria-hidden="true" size={17} />
        ) : (
          <CircleX aria-hidden="true" size={17} />
        )}
        <strong>{path.label}</strong>
      </div>
      <code>{path.path}</code>
      <span>
        {path.note ?? `读取${path.readable ? "可用" : "不可用"}，写入${path.writable ? "可用" : "不可用"}`}
      </span>
    </article>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "onboarding-mono" : undefined}>{value}</dd>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "是" : "否";
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "操作失败。";
}
