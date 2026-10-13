use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

static SAVE_LOCK: Mutex<()> = Mutex::new(());

fn directory(window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
    if window.label() != "main" {
        return Err("Backups are only available to the main window".into());
    }
    let root = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let dir = root.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dir = dir.canonicalize().map_err(|e| e.to_string())?;
    if !dir.starts_with(root) {
        return Err("Invalid backup directory".into());
    }
    Ok(dir)
}
fn valid_name(name: &str) -> bool {
    let daily = name
        .strip_prefix("daily-")
        .and_then(|s| s.strip_suffix(".json"));
    let restore = name
        .strip_prefix("restore-")
        .and_then(|s| s.strip_suffix(".json"));
    daily.is_some_and(|s| {
        s.len() == 10
            && s.chars().enumerate().all(|(i, c)| {
                if i == 4 || i == 7 {
                    c == '-'
                } else {
                    c.is_ascii_digit()
                }
            })
    }) || restore
        .is_some_and(|s| s.len() >= 10 && s.len() <= 16 && s.chars().all(|c| c.is_ascii_digit()))
}
#[derive(serde::Serialize)]
pub struct BackupFile {
    name: String,
    at: String,
    reason: String,
}
#[tauri::command]
pub fn list_local_backups(window: tauri::WebviewWindow) -> Result<Vec<BackupFile>, String> {
    let dir = directory(&window)?;
    let mut items = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !valid_name(&name) {
            continue;
        }
        if entry.metadata().map_err(|e| e.to_string())?.len() > 5 * 1024 * 1024 {
            continue;
        }
        // A damaged snapshot must not prevent saving or accessing other backups.
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(doc) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if doc["app"] != "bangumi-timetable" || !doc["data"]["tracking"].is_object() {
            continue;
        }
        let at = doc["exportedAt"].as_str().unwrap_or("").to_owned();
        let reason = if name.starts_with("daily-") {
            "daily"
        } else {
            "restore"
        }
        .to_owned();
        items.push(BackupFile { name, at, reason });
    }
    items.sort_by(|a, b| b.at.cmp(&a.at));
    Ok(items)
}
#[tauri::command]
pub fn read_local_backup(window: tauri::WebviewWindow, name: String) -> Result<String, String> {
    if !valid_name(&name) {
        return Err("Invalid backup name".into());
    }
    let dir = directory(&window)?;
    let path = dir.join(name).canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(&dir) {
        return Err("Invalid backup path".into());
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 5 * 1024 * 1024 {
        return Err("Backup exceeds 5 MB".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn save_local_backup(
    window: tauri::WebviewWindow,
    name: String,
    payload: String,
) -> Result<(), String> {
    if !valid_name(&name) || payload.len() > 5 * 1024 * 1024 {
        return Err("Invalid backup".into());
    }
    let doc: serde_json::Value = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    if doc["app"] != "bangumi-timetable"
        || !doc["data"]["tracking"].is_object()
        || !doc["data"]["settings"].is_object()
    {
        return Err("Invalid backup data".into());
    }
    let _guard = SAVE_LOCK
        .lock()
        .map_err(|_| "Backup save lock unavailable")?;
    let dir = directory(&window)?;
    let target = dir.join(&name);
    if target.is_symlink() {
        return Err("Invalid backup target".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temporary = dir.join(format!("{}.{}.{}.tmp", name, std::process::id(), stamp));
    let result = (|| -> Result<(), std::io::Error> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(payload.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &target)
    })();
    if let Err(error) = result {
        // This unique generated temporary path is always within the validated backup directory.
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    // Only rotate generated, validated regular files inside this exact backup directory.
    let files = list_local_backups(window)?;
    for (prefix, keep) in [("daily-", 7), ("restore-", 3)] {
        for file in files
            .iter()
            .filter(|f| f.name.starts_with(prefix))
            .skip(keep)
        {
            let path = dir.join(&file.name);
            if !path.is_symlink() && path.is_file() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_names_cannot_escape_directory() {
        assert!(valid_name("daily-2026-10-12.json"));
        assert!(valid_name("restore-1791760000000.json"));
        for name in [
            "../daily-2026-10-12.json",
            "daily-2026-10-12.json/../../file",
            "token.json",
            "restore-anything.json",
        ] {
            assert!(!valid_name(name));
        }
    }
}
