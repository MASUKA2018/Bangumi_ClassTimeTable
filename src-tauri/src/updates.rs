use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
pub struct UpdateInfo {
    version: String,
    body: String,
    date: Option<String>,
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Updates are only available to the main window".into())
    }
}
#[tauri::command]
pub async fn check_app_update(window: tauri::WebviewWindow) -> Result<Option<UpdateInfo>, String> {
    main_only(&window)?;
    let update = window
        .app_handle()
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        body: u.body.unwrap_or_default(),
        date: u.date.map(|d| d.to_string()),
    }))
}
#[tauri::command]
pub async fn install_app_update(
    window: tauri::WebviewWindow,
    expected_version: String,
) -> Result<(), String> {
    main_only(&window)?;
    // Re-check the trusted HTTPS endpoint and validate the embedded public-key signature;
    // the frontend cannot supply a download URL or substitute its own signing key.
    let update = window
        .app_handle()
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;
    if update.version != expected_version {
        return Err("更新版本已变化，请重新检查".into());
    }
    let mut downloaded = 0u64;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = window.emit(
                    "btt-update-progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    window.app_handle().restart();
}
