import {
  ArrowLeftRight,
  Archive,
  FilePlus2,
  Files,
  GitBranch,
  Images,
  Inbox,
  ListTree,
  RotateCcw,
  Settings,
  Server,
  ServerCog,
  X,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_APPLICATION_MODE,
  applicationModeFeatures,
} from "./application-mode";
import type { ApplicationMode } from "./application-mode";
import { DraftsPage, NewDraftPage } from "./components/DraftPages";
import type {
  DirectServerContent,
  DirectPublishOptions,
  DirectPublishResult,
  DirectPublishSnapshot,
} from "./components/DraftPages";
import { OnboardingPage } from "./components/OnboardingPage";
import { RepositoryExportPage } from "./components/RepositoryExportPage";
import { ServerContentPage } from "./components/ServerContentPage";
import type { ServerContentSummary } from "./components/ServerContentPage";
import { ServerSettingsPage } from "./components/ServerSettingsPage";
import type { ServerConnectionState } from "./components/ServerSettingsPage";
import { ServerSynchronizationPanel } from "./components/ServerSynchronizationPanel";
import { inspectDraft, tauriDraftApi, unavailableDraftApi } from "./drafts";
import type { Draft, DraftApi } from "./drafts";
import type { GitHubPublishApi } from "./github-publish";
import { openPublicSiteUrl } from "./external-navigation";
import { tauriMediaApi, unavailableMediaApi } from "./media";
import type { MediaApi } from "./media";
import {
  createDirectPublishBranchName,
  runRepositoryExportDryRun,
  runRepositoryLocalCommit,
  tauriRepositoryApi,
  unavailableRepositoryApi,
} from "./repository";
import type { RepositoryApi } from "./repository";
import {
  createPublishTransactionId,
  isQueuePublishState,
  isQueuePublishTransaction,
  isServerPublishProgress,
  isSyncTerminalStatus,
  isSyncTransactionState,
  normalizeServerContentItem,
  normalizeServerUrl,
  serverResultError,
  serverResultIndicatesUnavailable,
  tauriServerApi,
  unavailableServerApi,
} from "./server";
import type {
  PendingStatusData,
  PublishStage,
  ServerApi,
  ServerCapabilitiesData,
  ServerCommandResult,
  ServerPublishData,
  ServerPublishProgress,
  ServerPublishTransaction,
  ServerPublishRequest,
  ServerStatusData,
  SyncTransactionData,
} from "./server";
import {
  tauriOnboardingApi,
  unavailableOnboardingApi,
} from "./onboarding";
import type { OnboardingApi, OnboardingStatus } from "./onboarding";

const APP_VERSION = "0.1.0";
const REQUIRED_PUBLISH_PROTOCOL_VERSION = 1;
const DELETE_SERVER_CONTENT_CONFIRMATION =
  "删除后该网页将从线上移除，但服务器会保留历史版本。确认删除？";
const CONTROLLER_UPGRADE_MESSAGE =
  "服务器控制器版本过旧，尚不支持可靠发布事务。请先部署与当前工作台匹配的控制器。";
const SYNC_TRANSACTION_STORAGE_KEY =
  "algae-content-workbench:sync-transaction:v1";

const RETRYABLE_CLIENT_ERROR_CODES = new Set([
  "SSH_UNAVAILABLE",
  "SSH_TIMEOUT",
  "SERVER_TIMEOUT",
  "SERVER_PROCESS_FAILED",
  "SERVER_COMMAND_FAILED",
  "TAURI_INVOKE_FAILED",
  "UPLOAD_FAILED",
  "UPLOAD_TIMEOUT",
  "UPLOAD_PROCESS_FAILED",
  "STATUS_QUERY_FAILED",
  "STATUS_QUERY_TIMEOUT",
  "STATUS_QUERY_PROCESS_FAILED",
  "STATUS_QUERY_TOOL_UNAVAILABLE",
]);

function createClientPublishProgress(
  transactionId: string,
  stage: PublishStage,
  message: string,
): ServerPublishProgress {
  const now = new Date().toISOString();
  return {
    transactionId,
    status: "running",
    stage,
    message,
    startedAt: now,
    stageStartedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    stageElapsedMs: 0,
    attempt: 1,
    retryable: false,
    isUploading: false,
    serverStarted: false,
    safeToCancel: true,
    safeToRetry: false,
  };
}

function createClientPublishFailure(
  result: ServerCommandResult,
  transactionId: string,
  stage: PublishStage,
): ServerPublishProgress {
  const retryable =
    result.retryable ??
    RETRYABLE_CLIENT_ERROR_CODES.has(result.errorCode ?? result.code ?? "");
  return {
    ...createClientPublishProgress(transactionId, stage, serverResultError(result)),
    status: "failed",
    retryable,
    safeToCancel: false,
    safeToRetry: retryable,
    errorCode: result.errorCode ?? result.code ?? "CLIENT_PUBLISH_FAILED",
    userMessage: result.userMessage ?? result.message,
    technicalSummary:
      result.technicalSummary ??
      `${result.errorCode ?? result.code ?? "CLIENT_PUBLISH_FAILED"}: ${result.message}`,
    failedStage: result.failedStage ?? stage,
  };
}

function supportsPublishTransactions(
  status: ServerCommandResult<ServerStatusData>,
) {
  return (
    status.ok &&
    Number.isInteger(status.publishProtocolVersion) &&
    (status.publishProtocolVersion ?? 0) >= REQUIRED_PUBLISH_PROTOCOL_VERSION
  );
}

function controllerUpgradeRequired(): ServerCommandResult {
  return {
    ok: false,
    action: "status",
    code: "CONTROLLER_UPGRADE_REQUIRED",
    message: CONTROLLER_UPGRADE_MESSAGE,
    retryable: false,
    userMessage: CONTROLLER_UPGRADE_MESSAGE,
    technicalSummary: `publishProtocolVersion is missing or below ${REQUIRED_PUBLISH_PROTOCOL_VERSION}`,
    failedStage: "checking_server",
  };
}

const singleUserNavigationItems = [
  {
    id: "content-list",
    label: "内容列表",
    icon: ListTree,
  },
  {
    id: "new-content",
    label: "新建内容",
    icon: FilePlus2,
  },
  {
    id: "drafts",
    label: "草稿箱",
    icon: Files,
  },
  {
    id: "server-content",
    label: "服务器内容",
    icon: Server,
  },
  {
    id: "media-library",
    label: "媒体库",
    icon: Images,
  },
  {
    id: "import-export",
    label: "导入与导出",
    icon: ArrowLeftRight,
  },
  {
    id: "server-settings",
    label: "服务器设置",
    icon: ServerCog,
  },
] as const;

const teamReviewNavigationItems = [
  {
    id: "new-content",
    label: "新建内容",
    icon: FilePlus2,
  },
  {
    id: "drafts",
    label: "草稿箱",
    icon: Files,
  },
  {
    id: "submitted",
    label: "已提交",
    icon: Archive,
  },
  {
    id: "settings",
    label: "设置",
    icon: Settings,
  },
  {
    id: "repository-export",
    label: "仓库导出",
    icon: GitBranch,
  },
] as const;

type SectionId =
  | (typeof singleUserNavigationItems)[number]["id"]
  | (typeof teamReviewNavigationItems)[number]["id"];

const staticEmptyStates: Partial<Record<SectionId, string>> = {
  submitted: "目前没有已提交内容。",
  settings: "当前没有可配置项。",
};

type AppProps = {
  draftApi?: DraftApi;
  mediaApi?: MediaApi;
  repositoryApi?: RepositoryApi;
  githubPublishApi?: GitHubPublishApi;
  onboardingApi?: OnboardingApi;
  serverApi?: ServerApi;
  applicationMode?: ApplicationMode;
};

const recoveryRequests = new WeakMap<DraftApi, Promise<Draft | null>>();

function takeRecoveryDraftOnce(draftApi: DraftApi) {
  const existing = recoveryRequests.get(draftApi);
  if (existing) {
    return existing;
  }
  const request = draftApi.takeRecoveryDraft();
  recoveryRequests.set(draftApi, request);
  return request;
}

export default function App({
  draftApi,
  mediaApi,
  repositoryApi,
  githubPublishApi,
  onboardingApi,
  serverApi,
  applicationMode = DEFAULT_APPLICATION_MODE,
}: AppProps) {
  const activeDraftApi =
    draftApi ?? (isTauri() ? tauriDraftApi : unavailableDraftApi);
  const activeMediaApi =
    mediaApi ?? (isTauri() ? tauriMediaApi : unavailableMediaApi);
  const activeRepositoryApi =
    repositoryApi ??
    (isTauri() ? tauriRepositoryApi : unavailableRepositoryApi);
  const activeServerApi =
    serverApi ?? (isTauri() ? tauriServerApi : unavailableServerApi);
  const supportsOnboarding = Boolean(onboardingApi) || isTauri();
  const supportsServer = Boolean(serverApi) || isTauri();
  const activeOnboardingApi =
    onboardingApi ?? (isTauri() ? tauriOnboardingApi : unavailableOnboardingApi);
  const features = applicationModeFeatures(applicationMode);
  const navigationItems = navigationItemsForMode(applicationMode);
  const [activeSection, setActiveSection] = useState<SectionId>(
    () => navigationItemsForMode(applicationMode)[0].id,
  );
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [exportDraftId, setExportDraftId] = useState<string>();
  const [recoveryDraft, setRecoveryDraft] = useState<Draft | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(supportsOnboarding);
  const [serverConnectionState, setServerConnectionState] =
    useState<ServerConnectionState>("unchecked");
  const [serverConnectionError, setServerConnectionError] = useState<
    string | null
  >(null);
  const [serverContentItems, setServerContentItems] = useState<
    ServerContentSummary[]
  >([]);
  const [serverContentLoading, setServerContentLoading] = useState(false);
  const [serverContentError, setServerContentError] = useState<string | null>(
    null,
  );
  const [serverCapabilities, setServerCapabilities] =
    useState<ServerCapabilitiesData | null>(null);
  const [pendingStatus, setPendingStatus] =
    useState<PendingStatusData | null>(null);
  const [syncTransaction, setSyncTransaction] =
    useState<SyncTransactionData | null>(null);
  const [serverSyncLoading, setServerSyncLoading] = useState(false);
  const [manualSyncRunning, setManualSyncRunning] = useState(false);
  const [serverSyncNotice, setServerSyncNotice] = useState<string | null>(null);
  const [serverSyncError, setServerSyncError] = useState<string | null>(null);
  const [publishRefreshToken, setPublishRefreshToken] = useState(0);
  const syncOperationRef = useRef(false);
  const syncPollGenerationRef = useRef(0);
  const serverStateChecksEnabled =
    supportsServer &&
    (!supportsOnboarding || Boolean(onboardingStatus?.configured));
  const currentSection = navigationItems.some((item) => item.id === activeSection)
    ? activeSection
    : navigationItems[0].id;
  const activeItem =
    navigationItems.find((item) => item.id === currentSection) ?? navigationItems[0];

  const loadServerContent = useCallback(async () => {
    setServerContentLoading(true);
    setServerContentError(null);
    setServerConnectionState("checking");
    try {
      const result = await activeServerApi.listContent();
      if (!result.ok) {
        throw new Error(serverResultError(result));
      }
      setServerContentItems((result.items ?? []).map(normalizeServerContentItem));
      setServerConnectionState("available");
      setServerConnectionError(null);
    } catch (caught) {
      const message = describeError(caught);
      setServerContentError(message);
      setServerConnectionState("unavailable");
      setServerConnectionError(message);
    } finally {
      setServerContentLoading(false);
    }
  }, [activeServerApi]);

  const refreshServerSynchronization = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setServerSyncLoading(true);
      }
      setServerSyncError(null);
      try {
        const result = await activeServerApi.getCapabilities();
        if (!result.ok) {
          if (result.code === "CONTROLLER_UPGRADE_REQUIRED") {
            setServerCapabilities(incompatibleCapabilities(result));
            setPendingStatus(null);
            setSyncTransaction(null);
            setServerConnectionState("available");
            setServerConnectionError(CONTROLLER_UPGRADE_MESSAGE);
            setServerSyncError(CONTROLLER_UPGRADE_MESSAGE);
            return null;
          }
          throw new Error(serverResultError(result));
        }
        const capabilities = capabilitiesFromResult(result);
        if (!capabilities) {
          throw new Error("服务器返回的能力协商结果无效。");
        }
        setServerCapabilities(capabilities);
        setServerConnectionState("available");
        setServerConnectionError(null);

        if (capabilities.protocolMode !== "queue" || !capabilities.queueModeActive) {
          setPendingStatus(null);
          setSyncTransaction(null);
          setServerSyncNotice(null);
          return capabilities;
        }

        const pendingResult = await activeServerApi.getPendingStatus();
        if (!pendingResult.ok || typeof pendingResult.schema_version !== "number") {
          throw new Error(serverResultError(pendingResult));
        }
        const pending = pendingResult as ServerCommandResult<PendingStatusData> &
          PendingStatusData;
        setPendingStatus(pending);

        const storedSyncId = loadSyncTransactionId();
        const syncId =
          pending.active_sync_transaction_id ||
          storedSyncId ||
          pending.last_sync_transaction_id;
        if (syncId) {
          let syncResult = await activeServerApi.getSyncStatus({
            transactionId: syncId,
          });
          if (
            !isSyncTransactionState(syncResult) &&
            storedSyncId === syncId &&
            pending.last_sync_transaction_id &&
            pending.last_sync_transaction_id !== syncId
          ) {
            syncResult = await activeServerApi.getSyncStatus({
              transactionId: pending.last_sync_transaction_id,
            });
          }
          if (isSyncTransactionState(syncResult)) {
            setSyncTransaction(syncResult);
            saveSyncTransactionId(syncResult.sync_transaction_id);
          } else if (pending.active_sync_transaction_id) {
            throw new Error(serverResultError(syncResult));
          } else {
            setSyncTransaction(null);
          }
        } else {
          setSyncTransaction(null);
        }
        return capabilities;
      } catch (caught) {
        const message = describeError(caught);
        setServerConnectionState("unavailable");
        setServerConnectionError(message);
        setServerSyncError(message);
        return null;
      } finally {
        if (showLoading) {
          setServerSyncLoading(false);
        }
      }
    },
    [activeServerApi],
  );

  useEffect(() => {
    let isCurrent = true;

    takeRecoveryDraftOnce(activeDraftApi)
      .then((candidate) => {
        if (isCurrent) {
          setRecoveryDraft(candidate);
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setRecoveryError(describeError(caught));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeDraftApi]);

  useEffect(() => {
    if (!supportsOnboarding) {
      return;
    }
    let isCurrent = true;
    activeOnboardingApi
      .status()
      .then((next) => {
        if (isCurrent) {
          setOnboardingStatus(next);
          setOnboardingError(null);
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setOnboardingError(describeError(caught));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setOnboardingLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeOnboardingApi, supportsOnboarding]);

  useEffect(() => {
    if (!serverStateChecksEnabled) {
      return;
    }
    void Promise.resolve().then(() => refreshServerSynchronization());
  }, [refreshServerSynchronization, serverStateChecksEnabled]);

  useEffect(() => {
    if (!serverStateChecksEnabled) {
      return;
    }
    const handleFocus = () => {
      void refreshServerSynchronization(false);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshServerSynchronization, serverStateChecksEnabled]);

  useEffect(() => () => {
    syncPollGenerationRef.current += 1;
  }, []);

  function handleDraftCreated(draft: Draft) {
    setInitialDraft(draft);
    setActiveSection("drafts");
    void loadServerContent();
  }

  function handleRecoverDraft() {
    if (!recoveryDraft) {
      return;
    }
    setInitialDraft(recoveryDraft);
    setRecoveryDraft(null);
    setActiveSection("drafts");
    void loadServerContent();
  }

  function handleOnboardingStatus(next: OnboardingStatus) {
    setOnboardingStatus(next);
    setOnboardingError(null);
    setOnboardingLoading(false);
  }

  function handleExportDraft(draftId: string) {
    setExportDraftId(draftId);
    setActiveSection(features.showLegacyNavigation ? "repository-export" : "import-export");
  }

  async function handleViewServerContent(item: DirectServerContent) {
    const url = normalizeServerUrl(item.urlZh);
    if (!url) {
      setServerContentError("服务器未返回该内容的中文 URL。");
      return;
    }
    setServerContentError(null);
    try {
      await openPublicSiteUrl(url);
    } catch (caught) {
      setServerContentError(`无法打开线上页面：${describeError(caught)}`);
    }
  }

  async function handleEditServerContent(item: ServerContentSummary) {
    setServerContentError(null);
    try {
      const drafts = await activeDraftApi.listDrafts();
      const matching = drafts.find((draft) => {
        const fields = inspectDraft(draft).fields;
        return (
          fields.stableId === item.stableId &&
          fields.contentType === item.contentType
        );
      });
      if (!matching) {
        throw new Error("未找到匹配的本地草稿。");
      }
      setInitialDraft(await activeDraftApi.openDraft(matching.draftId));
      setActiveSection("drafts");
    } catch (caught) {
      setServerContentError(describeError(caught));
    }
  }

  async function handleDeleteServerContent(item: DirectServerContent) {
    if (!window.confirm(DELETE_SERVER_CONTENT_CONFIRMATION)) {
      return;
    }
    setServerContentLoading(true);
    setServerContentError(null);
    try {
      const storedTransactionId = loadDeleteTransactionId(
        item.contentType,
        item.stableId,
      );
      const transactionId = storedTransactionId ?? createPublishTransactionId();
      const capabilities = await requirePublishController(
        transactionId,
        "checking_server",
      );
      const queueMode = capabilities?.protocolMode === "queue" &&
        capabilities.queueModeActive;
      const repositoryPath =
        onboardingStatus?.configuration?.repositoryPath.trim() ?? "";
      if (queueMode && !repositoryPath) {
        throw new Error("请先在本地设置中配置仓库路径。");
      }

      let result = queueMode
        ? await activeServerApi.queueDeleteContent({
            repositoryPath,
            contentType: item.contentType as ServerPublishRequest["contentType"],
            stableId: item.stableId,
            transactionId,
          })
        : await activeServerApi.deleteContent({
            contentType: item.contentType as ServerPublishRequest["contentType"],
            stableId: item.stableId,
          });

      if (queueMode && result.ok) {
        const status = await activeServerApi.getPublishStatus({ transactionId });
        if (isQueuePublishState(status, transactionId)) {
          result = status;
        }
        const pending = await activeServerApi.getPendingStatus();
        if (pending.ok && typeof pending.schema_version === "number") {
          setPendingStatus(
            pending as ServerCommandResult<PendingStatusData> & PendingStatusData,
          );
        }
      }
      if (!result.ok) {
        if (serverResultIndicatesUnavailable(result)) {
          setServerConnectionState("unavailable");
          setServerConnectionError(serverResultError(result));
        }
        throw new Error(serverResultError(result));
      }
      setServerConnectionState("available");
      setServerConnectionError(null);
      if (queueMode) {
        if (!isQueuePublishState(result, transactionId)) {
          throw new Error("服务器返回的删除队列事务状态无效。");
        }
        saveDeleteTransactionId(item.contentType, item.stableId, transactionId);
        setServerSyncNotice(queueDeleteMessage(result.status));
        if (result.status !== "PUBLISHED") {
          return {
            message: queueDeleteMessage(result.status),
            protocolMode: "queue" as const,
            queueStatus: result.status,
            transactionId,
            contentSha: result.contentCommit,
            sourceSha: result.sourceCommit,
            releaseId: result.publishedReleaseId || undefined,
            syncTransactionId:
              result.includedInSyncTransactionId || undefined,
          };
        }
      }
      setServerContentItems((current) =>
        current.filter(
          (candidate) =>
            candidate.stableId !== item.stableId ||
            candidate.contentType !== item.contentType,
        ),
      );
      return {
        message: queueMode ? "删除内容已同步上线" : result.message,
        protocolMode: queueMode ? ("queue" as const) : ("legacy" as const),
        queueStatus: queueMode ? ("PUBLISHED" as const) : undefined,
        transactionId: queueMode ? transactionId : result.transactionId,
        contentSha: result.contentCommit ?? result.contentSha,
      };
    } catch (caught) {
      const message = describeError(caught);
      setServerContentError(message);
      throw caught instanceof Error ? caught : new Error(message);
    } finally {
      setServerContentLoading(false);
    }
  }

  async function requirePublishController(
    transactionId: string,
    stage: PublishStage,
    onFailure?: (progress: ServerPublishProgress) => void,
  ) {
    const status = await activeServerApi.getCapabilities();
    const capabilities = status.ok ? capabilitiesFromResult(status) : null;
    const failure = !status.ok
      ? status
      : capabilities
        ? null
        : controllerUpgradeRequired();
    if (!failure) {
      setServerCapabilities(capabilities);
      return capabilities;
    }

    const failureStage =
      failure.code === "CONTROLLER_UPGRADE_REQUIRED" ? "checking_server" : stage;
    onFailure?.(
      createClientPublishFailure(failure, transactionId, failureStage),
    );
    const message = serverResultError(failure);
    setServerConnectionState("unavailable");
    setServerConnectionError(message);
    throw new Error(message);
  }

  async function handleTestServerConnection() {
    setServerConnectionState("checking");
    setServerConnectionError(null);
    try {
      const connection = await activeServerApi.testConnection();
      if (!connection.ok) {
        throw new Error(serverResultError(connection));
      }
      const status = await activeServerApi.getStatus();
      if (!status.ok) {
        throw new Error(serverResultError(status));
      }
      if (!supportsPublishTransactions(status)) {
        throw new Error(serverResultError(controllerUpgradeRequired()));
      }
      if (
        status.ready !== true ||
        status.contentRepositoryReady !== true ||
        status.serviceActive !== true ||
        status.healthy !== true
      ) {
        throw new Error("SSH 可达，但服务器发布控制器或网站健康状态尚未就绪。");
      }
      setServerConnectionState("available");
      setServerConnectionError(null);
    } catch (caught) {
      setServerConnectionState("unavailable");
      setServerConnectionError(describeError(caught));
    }
  }

  async function handleSyncPendingNow() {
    if (syncOperationRef.current) {
      return;
    }
    syncOperationRef.current = true;
    setManualSyncRunning(true);
    setServerSyncNotice(null);
    setServerSyncError(null);
    const generation = ++syncPollGenerationRef.current;
    try {
      const pendingResult = await activeServerApi.getPendingStatus();
      if (!pendingResult.ok || typeof pendingResult.schema_version !== "number") {
        throw new Error(serverResultError(pendingResult));
      }
      const pending = pendingResult as ServerCommandResult<PendingStatusData> &
        PendingStatusData;
      setPendingStatus(pending);

      if (pending.active_sync_transaction_id) {
        saveSyncTransactionId(pending.active_sync_transaction_id);
        const completed = await pollSyncTransaction(
          activeServerApi,
          pending.active_sync_transaction_id,
          generation,
          syncPollGenerationRef,
          (transaction) => {
            setSyncTransaction(transaction);
            saveSyncTransactionId(transaction.sync_transaction_id);
          },
        );
        if (completed) {
          setSyncCompletionMessage(
            completed,
            setServerSyncNotice,
            setServerSyncError,
          );
        }
      } else if (!pending.has_pending_changes || pending.pending_upload_count === 0) {
        setServerSyncNotice("当前没有等待同步的内容");
        return;
      } else {
        let commandSettled = false;
        let observedSyncTransactionId: string | null = null;
        const rememberSyncTransaction = (transaction: SyncTransactionData) => {
          observedSyncTransactionId = transaction.sync_transaction_id;
          setSyncTransaction(transaction);
          saveSyncTransactionId(transaction.sync_transaction_id);
        };
        const command = activeServerApi.syncPendingNow();
        void command.then(
          () => {
            commandSettled = true;
          },
          () => {
            commandSettled = true;
          },
        );

        while (
          !commandSettled &&
          generation === syncPollGenerationRef.current
        ) {
          const status = await activeServerApi.getSyncStatus();
          if (isSyncTransactionState(status)) {
            rememberSyncTransaction(status);
          } else if (
            status.code !== "SYNC_TRANSACTION_NOT_FOUND" &&
            status.code !== "NO_SYNC_TRANSACTION"
          ) {
            throw new Error(serverResultError(status));
          }
          await Promise.race([
            command.then(() => undefined, () => undefined),
            waitForServerPoll(2_000),
          ]);
        }

        const result = await command;
        if (isSyncTransactionState(result)) {
          rememberSyncTransaction(result);
          setSyncCompletionMessage(result, setServerSyncNotice, setServerSyncError);
        } else if (!result.ok) {
          const recoveryPendingResult = await activeServerApi.getPendingStatus();
          const recoveryPending =
            recoveryPendingResult.ok &&
            typeof recoveryPendingResult.schema_version === "number"
              ? recoveryPendingResult as ServerCommandResult<PendingStatusData> &
                  PendingStatusData
              : null;
          if (recoveryPending) {
            setPendingStatus(recoveryPending);
          }
          const recoveryTransactionId =
            observedSyncTransactionId ||
            recoveryPending?.active_sync_transaction_id ||
            (recoveryPending?.last_sync_transaction_id &&
            recoveryPending.last_sync_transaction_id !==
              pending.last_sync_transaction_id
              ? recoveryPending.last_sync_transaction_id
              : null);
          if (!recoveryTransactionId) {
            throw new Error(serverResultError(result));
          }
          const recovered = await pollSyncTransaction(
            activeServerApi,
            recoveryTransactionId,
            generation,
            syncPollGenerationRef,
            rememberSyncTransaction,
          );
          if (recovered) {
            setSyncCompletionMessage(
              recovered,
              setServerSyncNotice,
              setServerSyncError,
            );
          }
        }
      }

      await refreshServerSynchronization(false);
      setPublishRefreshToken((current) => current + 1);
      await loadServerContent();
    } catch (caught) {
      const message = describeError(caught);
      setServerSyncError(message);
      if (message.includes("SSH") || message.includes("连接")) {
        setServerConnectionState("unavailable");
        setServerConnectionError(message);
      }
    } finally {
      if (generation === syncPollGenerationRef.current) {
        setManualSyncRunning(false);
      }
      syncOperationRef.current = false;
    }
  }

  async function handlePublishToServer(
    snapshot: DirectPublishSnapshot,
    options: DirectPublishOptions,
  ): Promise<DirectPublishResult> {
    const repositoryPath =
      onboardingStatus?.configuration?.repositoryPath.trim() ?? "";
    if (!repositoryPath) {
      throw new Error("请先在本地设置中配置仓库路径。");
    }

    const fields = inspectDraft(snapshot.draft).fields;
    let published: ServerCommandResult<ServerPublishData> | null = null;
    let refreshedPending = pendingStatus;
    if (!options.resume) {
      options.onProgress?.(
        createClientPublishProgress(
          options.transactionId,
          "checking_server",
          "正在检查服务器连接",
        ),
      );
      const connection = await activeServerApi.testConnection();
      if (!connection.ok) {
        const failure = createClientPublishFailure(
          connection,
          options.transactionId,
          "checking_server",
        );
        options.onProgress?.(failure);
        const message = serverResultError(connection);
        setServerConnectionState("unavailable");
        setServerConnectionError(message);
        throw new Error(message);
      }
      setServerConnectionState("available");
      setServerConnectionError(null);
    }

    const capabilities = await requirePublishController(
      options.transactionId,
      "checking_server",
      options.onProgress,
    );
    const queueMode = capabilities?.protocolMode === "queue" &&
      capabilities.queueModeActive;

    if (options.resume) {
      const existing = await handleQueryPublishStatus(
        options.transactionId,
        options.onProgress,
      );
      if (!isQueuePublishTransaction(existing)) {
        options.onProgress?.(existing);
      }
      if (
        existing.status === "succeeded" ||
        (isQueuePublishTransaction(existing) &&
          existing.status !== "FAILED")
      ) {
        published = {
          ...existing,
          ok: true,
          action: queueMode ? "queue-upload" : "publish",
        };
      } else if (existing.status === "failed" && !existing.retryable) {
        throw new Error(existing.userMessage || existing.message);
      } else if (existing.status === "FAILED" && !existing.retryable) {
        throw new Error(existing.userMessage || existing.message);
      }
    } else {

      const plannedAt = new Date();
      const branchName = createDirectPublishBranchName(
        fields.stableId,
        options.transactionId,
      );
      const publicationOptions = { directPublish: true, branchName } as const;
      const dryRun = await runRepositoryExportDryRun(
        activeRepositoryApi,
        repositoryPath,
        snapshot.draft,
        snapshot.stagedImages,
        plannedAt,
        publicationOptions,
      );
      if (!dryRun.ready) {
        const issue =
          dryRun.schema.issues.find((candidate) => candidate.severity === "error")
            ?.message ?? dryRun.conflicts[0]?.message;
        throw new Error(issue || "本地发布校验未通过。");
      }

      await runRepositoryLocalCommit(
        activeRepositoryApi,
        repositoryPath,
        snapshot.draft,
        snapshot.stagedImages,
        dryRun,
        plannedAt,
        publicationOptions,
      );
    }

    const publishRequest = {
      repositoryPath,
      contentType: fields.contentType as ServerPublishRequest["contentType"],
      stableId: fields.stableId,
      transactionId: options.transactionId,
    };
    published ??= queueMode
      ? await activeServerApi.queueContent(publishRequest, options.onProgress)
      : await activeServerApi.publishContent(publishRequest, options.onProgress);

    if (queueMode && published.ok) {
      const transaction = await activeServerApi.getPublishStatus({
        transactionId: options.transactionId,
      });
      if (isQueuePublishState(transaction, options.transactionId)) {
        published = {
          ...published,
          ...transaction,
          bundleUploadedAt:
            transaction.bundleUploadedAt ?? published.bundleUploadedAt,
          bundleUploadDurationMs:
            transaction.bundleUploadDurationMs ?? published.bundleUploadDurationMs,
          bundleGenerationDurationMs:
            transaction.bundleGenerationDurationMs ??
            published.bundleGenerationDurationMs,
          sha256DurationMs:
            transaction.sha256DurationMs ?? published.sha256DurationMs,
          serverValidationDurationMs:
            transaction.serverValidationDurationMs ??
            published.serverValidationDurationMs,
          queueTotalDurationMs:
            transaction.queueTotalDurationMs ?? published.queueTotalDurationMs,
        };
      } else if (!transaction.ok) {
        setServerSyncError(
          `内容已上传，但暂时无法刷新上传事务：${serverResultError(transaction)}`,
        );
      }

      const pendingResult = await activeServerApi.getPendingStatus();
      if (pendingResult.ok && typeof pendingResult.schema_version === "number") {
        refreshedPending = pendingResult as ServerCommandResult<PendingStatusData> &
          PendingStatusData;
        setPendingStatus(refreshedPending);
      } else {
        setServerSyncError(
          `内容已上传，但暂时无法刷新待同步状态：${serverResultError(pendingResult)}`,
        );
      }
    }

    if (!published.ok) {
      if (isServerPublishProgress(published, options.transactionId)) {
        options.onProgress?.(published);
      } else {
        options.onProgress?.(
          createClientPublishFailure(
            published,
            options.transactionId,
            "connecting_server",
          ),
        );
      }
      if (serverResultIndicatesUnavailable(published)) {
        setServerConnectionState("unavailable");
        setServerConnectionError(serverResultError(published));
      }
      throw new Error(serverResultError(published));
    }
    setServerConnectionState("available");
    setServerConnectionError(null);

    if (queueMode) {
      if (!isQueuePublishState(published, options.transactionId)) {
        throw new Error("服务器返回的队列上传事务状态无效。");
      }
      let url = "";
      if (published.status === "PUBLISHED") {
        const listed = await activeServerApi.listContent();
        const item = (listed.items ?? [])
          .map(normalizeServerContentItem)
          .find(
            (candidate) =>
              candidate.stableId === fields.stableId &&
              candidate.contentType === fields.contentType,
          );
        url = item?.urlZh ?? "";
        if (listed.ok) {
          setServerContentItems((listed.items ?? []).map(normalizeServerContentItem));
        }
      }
      return {
        message: queuePublishMessage(published.status),
        protocolMode: "queue",
        queueStatus: published.status,
        url: published.status === "PUBLISHED" && url ? url : undefined,
        publishedAt: published.publishedAt || undefined,
        transactionId: published.transactionId,
        contentSha: published.contentCommit,
        sourceSha: published.sourceCommit,
        releaseId: published.publishedReleaseId || undefined,
        syncTransactionId: published.includedInSyncTransactionId || undefined,
        coalescedIntoCommit: published.coalescedIntoCommit || undefined,
        pendingContentSha: refreshedPending?.pending_content_commit,
        siteSha: refreshedPending?.site_commit,
        nextScheduledSyncAt: refreshedPending?.next_scheduled_sync_at,
        pendingUploadCount: refreshedPending?.pending_upload_count,
        totalDurationMs: published.queueTotalDurationMs,
        bundleGenerationDurationMs: published.bundleGenerationDurationMs,
        sha256DurationMs: published.sha256DurationMs,
        bundleUploadDurationMs: published.bundleUploadDurationMs,
        serverValidationDurationMs: published.serverValidationDurationMs,
        retryable: published.retryable,
        errorCode: published.errorCode,
        failedStage: published.failedStage,
        technicalSummary: published.technicalSummary,
      };
    }

    const publishedAt =
      published.publishedAt?.trim() ||
      published.updatedAt?.trim() ||
      new Date().toISOString();
    const url = normalizeServerUrl(published.url);
    setServerContentItems((current) => [
      {
        stableId: fields.stableId,
        titleZh: fields.titleZh,
        contentType: fields.contentType,
        urlZh: url,
        status: "published",
        updatedAt: publishedAt,
      },
      ...current.filter(
        (item) =>
          item.stableId !== fields.stableId || item.contentType !== fields.contentType,
      ),
    ]);
    return {
      message: published.message,
      url: url || undefined,
      releaseSha: published.releaseSha,
      publishedAt,
      transactionId: published.transactionId ?? options.transactionId,
      contentSha: published.contentCommit ?? published.contentSha,
      siteSha: published.siteCommit ?? published.releaseSha,
      releaseId: published.releaseId,
      totalDurationMs: published.elapsedMs,
      stageDurationsMs: published.stageDurationsMs,
      bundleUploadDurationMs: published.bundleUploadDurationMs,
    };
  }

  async function handleQueryPublishStatus(
    transactionId: string,
    onFailure?: (progress: ServerPublishProgress) => void,
  ): Promise<ServerPublishTransaction> {
    await requirePublishController(
      transactionId,
      "confirming_server_status",
      onFailure,
    );
    const result = await activeServerApi.getPublishStatus({ transactionId });
    if (isQueuePublishState(result, transactionId)) {
      let queueResult = result;
      const pendingResult = await activeServerApi.getPendingStatus();
      const pending =
        pendingResult.ok && typeof pendingResult.schema_version === "number"
          ? pendingResult as ServerCommandResult<PendingStatusData> & PendingStatusData
          : null;
      if (pending) {
        setPendingStatus(pending);
        queueResult = {
          ...queueResult,
          siteCommit: queueResult.siteCommit || pending.site_commit,
        };
      }

      const syncTransactionId =
        queueResult.includedInSyncTransactionId ||
        pending?.active_sync_transaction_id ||
        (queueResult.status === "PUBLISHED"
          ? pending?.last_sync_transaction_id
          : null);
      if (syncTransactionId) {
        const syncResult = await activeServerApi.getSyncStatus({
          transactionId: syncTransactionId,
        });
        if (isSyncTransactionState(syncResult)) {
          setSyncTransaction(syncResult);
          saveSyncTransactionId(syncResult.sync_transaction_id);
          queueResult = {
            ...queueResult,
            siteCommit: syncResult.site_commit || queueResult.siteCommit,
            publishedReleaseId:
              syncResult.release_id || queueResult.publishedReleaseId,
            publishedAt:
              syncResult.completed_at || queueResult.publishedAt,
          };
        }
      }

      if (
        queueResult.status === "PUBLISHED" &&
        queueResult.contentType &&
        queueResult.stableId
      ) {
        const listed = await activeServerApi.listContent();
        if (listed.ok) {
          const items = (listed.items ?? []).map(normalizeServerContentItem);
          setServerContentItems(items);
          const publishedItem = items.find(
            (item) =>
              item.contentType === queueResult.contentType &&
              item.stableId === queueResult.stableId,
          );
          queueResult = {
            ...queueResult,
            url: publishedItem?.urlZh || queueResult.url,
          };
        }
      }
      setServerConnectionState("available");
      setServerConnectionError(null);
      return queueResult;
    }
    if (!result.ok) {
      const message = serverResultError(result);
      onFailure?.(
        createClientPublishFailure(
          result,
          transactionId,
          "confirming_server_status",
        ),
      );
      if (serverResultIndicatesUnavailable(result)) {
        setServerConnectionState("unavailable");
        setServerConnectionError(message);
      }
      throw new Error(message);
    }
    if (!isServerPublishProgress(result, transactionId)) {
      const message = "服务器返回的发布事务状态无效。";
      onFailure?.(
        createClientPublishFailure(
          {
            ok: false,
            action: "publish-status",
            code: "SERVER_RESPONSE_INVALID",
            message,
          },
          transactionId,
          "confirming_server_status",
        ),
      );
      throw new Error(message);
    }
    setServerConnectionState("available");
    setServerConnectionError(null);
    return result;
  }

  if (
    supportsOnboarding &&
    (onboardingLoading || !onboardingStatus?.configured)
  ) {
    return (
      <div className="onboarding-shell">
        <main className="onboarding-main">
          <OnboardingPage
            api={activeOnboardingApi}
            initialStatus={onboardingStatus}
            initialError={
              onboardingError ? `无法初始化首次启动向导：${onboardingError}` : null
            }
            onStatusChange={handleOnboardingStatus}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="workbench-shell">
      <aside className="workbench-sidebar">
        <header className="workbench-brand">
          <h1>藻类团队内容发布工作台</h1>
          <p>版本 {APP_VERSION}</p>
        </header>
        <nav aria-label="工作台导航">
          <ul>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeItem.id;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setActiveSection(item.id);
                      if (item.id === "server-content" || item.id === "drafts") {
                        void loadServerContent();
                      }
                    }}
                  >
                    <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="workbench-main">
        {recoveryDraft ? (
          <section className="recovery-banner" aria-label="异常恢复" role="status">
            <div>
              <strong>检测到上次会话异常结束</strong>
              <p>
                最近草稿：
                {inspectDraft(recoveryDraft).fields.titleZh.trim() || "未命名草稿"}
              </p>
            </div>
            <div className="recovery-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleRecoverDraft}
              >
                <RotateCcw aria-hidden="true" size={18} />
                恢复草稿
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="忽略恢复提示"
                title="忽略恢复提示"
                onClick={() => setRecoveryDraft(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </section>
        ) : null}
        {recoveryError ? (
          <p className="operation-error recovery-error" role="alert">
            无法检查异常恢复：{recoveryError}
          </p>
        ) : null}
        <ServerSynchronizationPanel
          connectionState={serverConnectionState}
          capabilities={serverCapabilities}
          pending={pendingStatus}
          sync={syncTransaction}
          loading={serverSyncLoading}
          synchronizing={manualSyncRunning}
          notice={serverSyncNotice}
          error={serverSyncError}
          onRefresh={() => void refreshServerSynchronization()}
          onSyncNow={() => void handleSyncPendingNow()}
        />
        <section className="workspace-page" aria-labelledby="workspace-title">
          <h2 id="workspace-title">{activeItem.label}</h2>
          {currentSection === "new-content" ? (
            <NewDraftPage api={activeDraftApi} onCreated={handleDraftCreated} />
          ) : currentSection === "content-list" ? (
            <ContentListPage
              onCreate={() => setActiveSection("new-content")}
              onImportExport={() => setActiveSection("import-export")}
            />
          ) : currentSection === "drafts" ? (
            <DraftsPage
              api={activeDraftApi}
              mediaApi={activeMediaApi}
              initialDraft={initialDraft}
              applicationMode={applicationMode}
              onExportDraft={handleExportDraft}
              onPublishToServer={handlePublishToServer}
              serverConnectionState={serverConnectionState}
              serverConnectionError={serverConnectionError}
              serverContentItems={serverContentItems}
              onViewServerContent={handleViewServerContent}
              onDeleteServerContent={handleDeleteServerContent}
              onOpenPublishedUrl={openPublicSiteUrl}
              onQueryPublishStatus={handleQueryPublishStatus}
              serverProtocolMode={serverCapabilities?.protocolMode}
              serverQueueModeActive={serverCapabilities?.queueModeActive === true}
              pendingStatus={pendingStatus}
              publishRefreshToken={publishRefreshToken}
            />
          ) : currentSection === "server-content" ? (
            <ServerContentPage
              items={serverContentItems}
              loading={serverContentLoading}
              error={serverContentError}
              connectionState={serverConnectionState}
              onRefresh={() => void loadServerContent()}
              onView={handleViewServerContent}
              onEdit={(item) => void handleEditServerContent(item)}
              onDelete={(item) => {
                void handleDeleteServerContent(item).catch(() => undefined);
              }}
            />
          ) : currentSection === "media-library" ? (
            <MediaLibraryPage />
          ) : currentSection === "import-export" || currentSection === "repository-export" ? (
            <RepositoryExportPage
              draftApi={activeDraftApi}
              mediaApi={activeMediaApi}
              repositoryApi={activeRepositoryApi}
              githubPublishApi={githubPublishApi}
              initialRepositoryPath={onboardingStatus?.configuration?.repositoryPath}
              initialDraftId={exportDraftId}
              showGitHubDraftPr={features.showGitHubDraftPr}
            />
          ) : currentSection === "server-settings" ? (
            <ServerSettingsPage
              connectionState={serverConnectionState}
              error={serverConnectionError}
              onTestConnection={() => void handleTestServerConnection()}
            />
          ) : currentSection === "settings" && supportsOnboarding ? (
            <OnboardingPage
              api={activeOnboardingApi}
              initialStatus={onboardingStatus}
              initialError={onboardingError}
              title="本地设置与诊断"
              onStatusChange={handleOnboardingStatus}
            />
          ) : (
            <div className="empty-state" role="status">
              <Inbox aria-hidden="true" size={28} strokeWidth={1.6} />
              <p>{staticEmptyStates[currentSection]}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function navigationItemsForMode(mode: ApplicationMode) {
  return applicationModeFeatures(mode).showLegacyNavigation
    ? teamReviewNavigationItems
    : singleUserNavigationItems;
}

function ContentListPage({
  onCreate,
  onImportExport,
}: {
  onCreate: () => void;
  onImportExport: () => void;
}) {
  return (
    <div className="workspace-empty-page" role="status">
      <ListTree aria-hidden="true" size={28} strokeWidth={1.6} />
      <p>目前没有可显示的内容。</p>
      <div className="workspace-empty-actions">
        <button className="primary-button" type="button" onClick={onCreate}>
          <FilePlus2 aria-hidden="true" size={18} />
          新建内容
        </button>
        <button className="secondary-button" type="button" onClick={onImportExport}>
          <ArrowLeftRight aria-hidden="true" size={18} />
          导入与导出
        </button>
      </div>
    </div>
  );
}

function MediaLibraryPage() {
  return (
    <div className="workspace-empty-page" role="status">
      <Images aria-hidden="true" size={28} strokeWidth={1.6} />
      <p>目前没有可显示的媒体。</p>
    </div>
  );
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "恢复检查失败。";
}

function capabilitiesFromResult(
  result: ServerCommandResult<ServerCapabilitiesData>,
): ServerCapabilitiesData | null {
  if (
    !result.ok ||
    !["incompatible", "legacy", "queue"].includes(result.protocolMode ?? "") ||
    typeof result.queueModeActive !== "boolean" ||
    typeof result.ready !== "boolean" ||
    typeof result.contentRepositoryReady !== "boolean" ||
    typeof result.serviceActive !== "boolean" ||
    typeof result.healthy !== "boolean"
  ) {
    return null;
  }
  return result as ServerCommandResult<ServerCapabilitiesData> &
    ServerCapabilitiesData;
}

function incompatibleCapabilities(
  result: ServerCommandResult<ServerCapabilitiesData>,
): ServerCapabilitiesData {
  return {
    protocolMode: "incompatible",
    queueModeActive: false,
    ready: false,
    contentRepositoryReady: false,
    serviceActive: false,
    healthy: false,
    publishProtocolVersion: result.publishProtocolVersion ?? 0,
    queueProtocolVersion: result.queueProtocolVersion ?? 0,
  };
}

async function pollSyncTransaction(
  api: ServerApi,
  transactionId: string,
  generation: number,
  generationRef: { current: number },
  onProgress: (transaction: SyncTransactionData) => void,
) {
  while (generation === generationRef.current) {
    const result = await api.getSyncStatus({ transactionId });
    if (!isSyncTransactionState(result)) {
      throw new Error(serverResultError(result));
    }
    onProgress(result);
    if (isSyncTerminalStatus(result.status)) {
      return result;
    }
    await waitForServerPoll(2_000);
  }
  return null;
}

function setSyncCompletionMessage(
  transaction: SyncTransactionData,
  setNotice: (message: string | null) => void,
  setError: (message: string | null) => void,
) {
  if (transaction.status === "PUBLISHED") {
    setNotice("同步完成，待同步内容已上线。");
    setError(null);
  } else if (transaction.status === "SKIPPED_NO_PENDING") {
    setNotice("当前没有等待同步的内容");
    setError(null);
  } else if (transaction.status === "FAILED_BLOCKED") {
    setNotice(null);
    setError("服务器无法自动同步此内容。请上传修正后的新版本。");
  } else if (transaction.status === "FAILED_RETRYABLE") {
    setNotice("服务器遇到临时错误，将在下一同步窗口重试。");
    setError(null);
  }
}

function waitForServerPoll(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function loadSyncTransactionId() {
  try {
    const value = localStorage.getItem(SYNC_TRANSACTION_STORAGE_KEY);
    return value && /^[0-9a-f]{32}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function saveSyncTransactionId(transactionId: string) {
  try {
    localStorage.setItem(SYNC_TRANSACTION_STORAGE_KEY, transactionId);
  } catch {
    // The server remains authoritative when local browser storage is unavailable.
  }
}

function deleteTransactionStorageKey(contentType: string, stableId: string) {
  return `algae-content-workbench:delete:${contentType}:${stableId}`;
}

function loadDeleteTransactionId(contentType: string, stableId: string) {
  try {
    const value = localStorage.getItem(
      deleteTransactionStorageKey(contentType, stableId),
    );
    return value && /^[0-9a-f]{32}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function saveDeleteTransactionId(
  contentType: string,
  stableId: string,
  transactionId: string,
) {
  try {
    localStorage.setItem(
      deleteTransactionStorageKey(contentType, stableId),
      transactionId,
    );
  } catch {
    // A repeated deletion still queries the deterministic server transaction first.
  }
}

function queuePublishMessage(status: ServerPublishData["status"]) {
  return {
    QUEUED: "内容已安全上传到服务器，正在等待同步",
    COALESCED: "此版本已包含在后续上传内容中，将随最新版本一同同步。",
    SYNCING: "服务器正在同步此内容",
    PUBLISHED: "内容已上线",
    FAILED: "服务器未能接收此内容",
  }[status as "QUEUED" | "COALESCED" | "SYNCING" | "PUBLISHED" | "FAILED"];
}

function queueDeleteMessage(status: ServerPublishData["status"]) {
  return {
    QUEUED: "删除内容已进入待同步队列，网站尚未更新。",
    COALESCED: "删除事务已包含在后续上传内容中，将随最新版本一同同步。",
    SYNCING: "服务器正在同步内容删除。",
    PUBLISHED: "删除内容已同步上线。",
    FAILED: "服务器未能接收删除事务。",
  }[status as "QUEUED" | "COALESCED" | "SYNCING" | "PUBLISHED" | "FAILED"];
}
