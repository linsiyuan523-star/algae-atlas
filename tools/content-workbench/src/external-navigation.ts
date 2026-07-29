import { invoke, isTauri } from "@tauri-apps/api/core";

export async function openPublicSiteUrl(url: string): Promise<void> {
  if (isTauri()) {
    await invoke("open_public_site_url", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
