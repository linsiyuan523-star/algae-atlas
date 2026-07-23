pub mod clock;
pub mod drafts;
pub mod error;
pub mod paths;
pub mod storage;

use tauri::Manager;

pub const DESKTOP_COMMAND_API_VERSION: u32 = 1;
pub const DRAFT_STORAGE_VERSION: u32 = 1;
pub const SETTINGS_STORAGE_VERSION: u32 = 1;
pub const MAX_DRAFT_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_LOCAL_LABEL_CHARS: usize = 200;
pub const MAX_LOCAL_NOTES_BYTES: usize = 64 * 1024;
pub const MAX_SAFE_REVISION: u64 = 9_007_199_254_740_991;
pub const MAX_SETTINGS_BYTES: usize = 16 * 1024;
pub const MAX_SESSION_BYTES: usize = 16 * 1024;
pub const MIN_AUTOSAVE_DELAY_MS: u32 = 250;
pub const MAX_AUTOSAVE_DELAY_MS: u32 = 5_000;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_focus() {
                    eprintln!("failed to focus existing main window: {error}");
                }
            }
        }))
        .run(tauri::generate_context!())
        .expect("error while running Algae Atlas Content Workbench");
}
