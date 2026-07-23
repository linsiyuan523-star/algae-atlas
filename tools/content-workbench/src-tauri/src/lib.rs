mod drafts;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let drafts_root = app.path().app_data_dir()?.join("drafts").join("v1");
            app.manage(drafts::DraftStore::new(drafts_root));
            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.set_focus() {
                    eprintln!("failed to focus existing main window: {error}");
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![
            drafts::create_draft,
            drafts::list_drafts,
            drafts::open_draft,
            drafts::save_draft,
            drafts::delete_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Algae Atlas Content Workbench");
}
