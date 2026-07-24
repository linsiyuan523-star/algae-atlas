mod drafts;
mod media;
mod repository;
mod session;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let app_data_root = app.path().app_data_dir()?;
            let drafts_root = app_data_root.join("drafts").join("v1");
            let media_root = app_data_root.join("media-staging").join("v1");
            let session_root = app_data_root.join("session");
            app.manage(drafts::DraftStore::new(drafts_root));
            app.manage(media::MediaStore::new(media_root));
            app.manage(session::SessionState::begin(session_root)?);
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
            media::stage_image,
            media::list_staged_images,
            media::save_image_metadata,
            repository::repository_export_dry_run,
            session::take_recovery_draft,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Algae Atlas Content Workbench");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let session = app_handle.state::<session::SessionState>();
            if let Err(error) = session.finish() {
                eprintln!("failed to clear normal session marker: {error}");
            }
        }
    });
}
