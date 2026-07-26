import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { OnboardingPage } from "./OnboardingPage";
import type { OnboardingApi, OnboardingStatus } from "../onboarding";

function diagnosticStatus(configured = false): OnboardingStatus {
  return {
    configured,
    ...(configured
      ? {
          configuration: {
            formatVersion: 1,
            repositoryPath: "D:\\algae-repository",
            draftsDirectory: "D:\\algae-data\\drafts",
            stagingDirectory: "D:\\algae-data\\staging",
          },
        }
      : {}),
    defaults: {
      draftsDirectory: "D:\\algae-data\\drafts",
      stagingDirectory: "D:\\algae-data\\staging",
    },
    activeStorage: {
      draftsDirectory: "D:\\algae-data\\drafts",
      stagingDirectory: "D:\\algae-data\\staging",
    },
    restartRequired: false,
    diagnostics: {
      tools: [
        { id: "git", label: "Git", available: true, version: "git version 2.49.0" },
        { id: "node", label: "Node.js", available: true, version: "v22.13.0" },
        { id: "rustc", label: "Rust", available: true, version: "rustc 1.97.1" },
        {
          id: "msvc",
          label: "MSVC C++ Build Tools",
          available: false,
        },
        {
          id: "webview2",
          label: "Microsoft Edge WebView2 Runtime",
          available: true,
          version: "120.0.2210.91",
        },
      ],
      paths: [
        {
          id: "repository",
          label: "本地仓库",
          path: "D:\\algae-repository",
          exists: true,
          isDirectory: true,
          readable: true,
          writable: true,
        },
        {
          id: "drafts",
          label: "草稿目录",
          path: "D:\\algae-data\\drafts",
          exists: true,
          isDirectory: true,
          readable: true,
          writable: true,
        },
        {
          id: "staging",
          label: "图片暂存目录",
          path: "D:\\algae-data\\staging",
          exists: true,
          isDirectory: true,
          readable: true,
          writable: false,
          note: "当前账户没有写入权限。",
        },
      ],
      localGit: {
        inspected: true,
        isRepository: true,
        branch: "local/stage-08a-onboarding",
        headSha: "12ea637bdc2e00ce2bb8dbdf930b681543f9b5f1",
        worktreeClean: true,
        statusEntries: 0,
      },
      imageCapabilities: {
        supportedInputFormats: ["JPEG", "PNG", "WebP"],
        outputFormat: "WebP",
        maxSourceBytes: 20 * 1024 * 1024,
        privacyMetadataRemoved: true,
      },
      applicationData: {
        appDataDirectory: "D:\\algae-data",
        configurationFile: "D:\\algae-data\\configuration.json",
        draftCount: 3,
        stagedImageCount: 7,
      },
    },
  };
}

function createApi(status = diagnosticStatus()): OnboardingApi {
  return {
    status: vi.fn(async () => status),
    saveConfiguration: vi.fn(async () => diagnosticStatus(true)),
  };
}

test("renders simulated local diagnostics without exposing credentials", async () => {
  const api = createApi();
  render(<OnboardingPage api={api} />);

  expect(await screen.findByText("MSVC C++ Build Tools")).toBeVisible();
  expect(screen.getByText("未检测到")).toBeVisible();
  expect(screen.getByText("Microsoft Edge WebView2 Runtime")).toBeVisible();
  expect(screen.getByText("当前账户没有写入权限。")).toBeVisible();
  expect(screen.getByText("local/stage-08a-onboarding")).toBeVisible();
  expect(screen.getByText("3 份")).toBeVisible();
  expect(screen.getByText("7 张")).toBeVisible();
  expect(screen.getByText(/不会请求 GitHub 登录/)).toBeVisible();
});

test("saves selected local paths", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<OnboardingPage api={api} initialStatus={diagnosticStatus()} />);

  await user.type(screen.getByLabelText("本地仓库"), "D:\\algae-repository");
  await user.click(screen.getByRole("button", { name: "保存本地配置" }));

  expect(api.saveConfiguration).toHaveBeenCalledWith({
    repositoryPath: "D:\\algae-repository",
    draftsDirectory: "D:\\algae-data\\drafts",
    stagingDirectory: "D:\\algae-data\\staging",
  });
});

test("shows a permission failure returned by the native configuration command", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.saveConfiguration = vi.fn(async () => {
    throw new Error("draft directory cannot be written");
  });
  render(<OnboardingPage api={api} initialStatus={diagnosticStatus()} />);

  await user.type(screen.getByLabelText("本地仓库"), "D:\\algae-repository");
  await user.click(screen.getByRole("button", { name: "保存本地配置" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法保存本地配置：draft directory cannot be written",
  );
});
