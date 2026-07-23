use tauri::Manager;

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
