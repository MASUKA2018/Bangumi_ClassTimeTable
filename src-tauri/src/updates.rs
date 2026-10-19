use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
static INSTALLING: AtomicBool = AtomicBool::new(false);
struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

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
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
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
    INSTALLING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "更新已经在进行")?;
    let _guard = InstallGuard;
    let _ = window.emit("btt-update-stage", "checking");
    // Re-check the trusted HTTPS endpoint and validate the embedded public-key signature;
    // the frontend cannot supply a download URL or substitute its own signing key.
    let update = window
        .app_handle()
        .updater_builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;
    if update.version != expected_version {
        return Err("更新版本已变化，请重新检查".into());
    }
    let mut downloaded = 0u64;
    let _ = window.emit("btt-update-stage", "downloading");
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = window.emit(
                    "btt-update-progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            },
            || {
                let _ = window.emit("btt-update-stage", "verifying");
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    let _ = window.emit("btt-update-stage", "installing");
    update.install(bytes).map_err(|e| e.to_string())?;
    let _ = window.emit("btt-update-stage", "restarting");
    window.app_handle().restart();
}
