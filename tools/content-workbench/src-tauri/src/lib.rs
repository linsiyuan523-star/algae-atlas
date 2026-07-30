mod drafts;
mod external_navigation;
mod media;
mod onboarding;
mod repository;
mod server;
mod session;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let app_data_root = app.path().app_data_dir()?;
            let onboarding_root = app_data_root.join("onboarding").join("v1");
            let default_storage = onboarding::default_storage_paths(&app_data_root);
            onboarding::prepare_storage_paths(&default_storage)?;
            let active_storage =
                onboarding::configured_storage_paths(&onboarding_root, &default_storage);
            let repository_staging_root = app_data_root.join("repository-staging").join("v1");
            let session_root = app_data_root.join("session");
            app.manage(drafts::DraftStore::new(active_storage.drafts.clone()));
            app.manage(media::MediaStore::new(active_storage.staging.clone()));
            app.manage(onboarding::OnboardingStore::new(
                onboarding_root,
                app_data_root,
                default_storage,
                active_storage,
            )?);
            app.manage(repository::RepositoryPublisher::new(
                repository_staging_root,
            ));
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
            repository::repository_local_commit,
            repository::repository_bundle_preflight,
            repository::repository_export_bundle,
            external_navigation::open_public_site_url,
            server::test_server_connection,
            server::get_server_status,
            server::negotiate_server_capabilities,
            server::get_pending_status,
            server::list_server_content,
            server::get_publish_status,
            server::get_sync_status,
            server::sync_pending_now,
            server::publish_content_to_server,
            server::queue_content_to_server,
            server::queue_delete_content_from_server,
            server::delete_server_content,
            onboarding::onboarding_status,
            onboarding::save_onboarding_configuration,
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
