import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  LoaderCircle,
  PlugZap,
  ServerCog,
} from "lucide-react";

export type ServerConnectionState =
  | "unchecked"
  | "checking"
  | "available"
  | "unavailable";

type ServerSettingsPageProps = {
  connectionState?: ServerConnectionState;
  error?: string | null;
  onTestConnection?: () => void;
};

const connectionLabels: Record<ServerConnectionState, string> = {
  unchecked: "尚未检测",
  checking: "正在检测",
  available: "连接可用",
  unavailable: "服务器不可用",
};

export function ServerSettingsPage({
  connectionState = "unchecked",
  error = null,
  onTestConnection,
}: ServerSettingsPageProps) {
  const checking = connectionState === "checking";

  return (
    <div className="server-settings-page">
      <section className="server-settings-summary" aria-labelledby="server-target-title">
        <header>
          <ServerCog aria-hidden="true" size={22} />
          <h3 id="server-target-title">发布服务器</h3>
        </header>
        <dl>
          <div>
            <dt>SSH 别名</dt>
            <dd>
              <code>algae-server</code>
            </dd>
          </div>
          <div>
            <dt>连接方式</dt>
            <dd>Windows OpenSSH</dd>
          </div>
          <div>
            <dt>身份验证</dt>
            <dd>使用系统现有 SSH 配置</dd>
          </div>
        </dl>
      </section>

      <section className="server-connection-panel" aria-labelledby="server-connection-title">
        <div
          className="server-connection-status"
          data-status={connectionState}
          role="status"
        >
          <ConnectionStatusIcon
            state={connectionState}
            className={checking ? "server-spinner" : undefined}
            aria-hidden="true"
            size={22}
          />
          <div>
            <h3 id="server-connection-title">连接状态</h3>
            <p>{connectionLabels[connectionState]}</p>
          </div>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={!onTestConnection || checking}
          onClick={onTestConnection}
        >
          {checking ? (
            <LoaderCircle className="server-spinner" aria-hidden="true" size={18} />
          ) : (
            <PlugZap aria-hidden="true" size={18} />
          )}
          {checking ? "正在检测" : "测试连接"}
        </button>
      </section>

      {connectionState === "unavailable" || error ? (
        <div className="server-connection-help" role="alert">
          <CircleAlert aria-hidden="true" size={19} />
          <p>
            {error ??
              "请检查网络或 VPN、SSH 配置以及密钥是否可用。本地草稿、预览和导出不受影响。"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionStatusIcon({
  state,
  className,
  ...props
}: {
  state: ServerConnectionState;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  size: number;
}) {
  if (state === "available") {
    return <CircleCheck className={className} {...props} />;
  }
  if (state === "unavailable") {
    return <CircleAlert className={className} {...props} />;
  }
  return <CircleHelp className={className} {...props} />;
}
