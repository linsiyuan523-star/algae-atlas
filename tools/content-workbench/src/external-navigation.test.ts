import { beforeEach, expect, test, vi } from "vitest";
import { openPublicSiteUrl } from "./external-navigation";

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriCore);

beforeEach(() => {
  tauriCore.invoke.mockReset();
  tauriCore.isTauri.mockReset();
});

test("uses the restricted native command in the desktop app", async () => {
  tauriCore.isTauri.mockReturnValue(true);
  tauriCore.invoke.mockResolvedValue(undefined);

  await openPublicSiteUrl("https://sycszy.icu/zh/news/fixture-content");

  expect(tauriCore.invoke).toHaveBeenCalledWith("open_public_site_url", {
    url: "https://sycszy.icu/zh/news/fixture-content",
  });
});
