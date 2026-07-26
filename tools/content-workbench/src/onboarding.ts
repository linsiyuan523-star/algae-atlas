import { invoke } from "@tauri-apps/api/core";

export type OnboardingConfiguration = {
  formatVersion: number;
  repositoryPath: string;
  draftsDirectory: string;
  stagingDirectory: string;
};

export type OnboardingConfigurationInput = {
  repositoryPath: string;
  draftsDirectory: string;
  stagingDirectory: string;
};

export type StoragePaths = {
  draftsDirectory: string;
  stagingDirectory: string;
};

export type ToolDiagnostic = {
  id: string;
  label: string;
  available: boolean;
  version?: string;
};

export type PathDiagnostic = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  writable: boolean;
  note?: string;
};

export type LocalGitDiagnostic = {
  inspected: boolean;
  isRepository: boolean;
  branch?: string;
  headSha?: string;
  worktreeClean?: boolean;
  statusEntries: number;
};

export type ImageCapabilityDiagnostic = {
  supportedInputFormats: string[];
  outputFormat: string;
  maxSourceBytes: number;
  privacyMetadataRemoved: boolean;
};

export type ApplicationDataDiagnostic = {
  appDataDirectory: string;
  configurationFile: string;
  draftCount: number;
  stagedImageCount: number;
};

export type StartupDiagnostics = {
  tools: ToolDiagnostic[];
  paths: PathDiagnostic[];
  localGit: LocalGitDiagnostic;
  imageCapabilities: ImageCapabilityDiagnostic;
  applicationData: ApplicationDataDiagnostic;
};

export type OnboardingStatus = {
  configured: boolean;
  configuration?: OnboardingConfiguration;
  defaults: StoragePaths;
  activeStorage: StoragePaths;
  restartRequired: boolean;
  diagnostics: StartupDiagnostics;
};

export type OnboardingApi = {
  status: () => Promise<OnboardingStatus>;
  saveConfiguration: (
    request: OnboardingConfigurationInput,
  ) => Promise<OnboardingStatus>;
};

export const tauriOnboardingApi: OnboardingApi = {
  status: () => invoke<OnboardingStatus>("onboarding_status"),
  saveConfiguration: (request) =>
    invoke<OnboardingStatus>("save_onboarding_configuration", { request }),
};

export const unavailableOnboardingApi: OnboardingApi = {
  status: async () => {
    throw new Error("首次启动配置仅在桌面应用中可用。");
  },
  saveConfiguration: async () => {
    throw new Error("首次启动配置仅在桌面应用中可用。");
  },
};
