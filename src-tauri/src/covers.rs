use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use std::{fs, time::Duration};
use tauri::Manager;
use tauri_plugin_http::reqwest;

fn mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"GIF8") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::mime;
    #[test]
    fn cache_accepts_raster_headers_and_rejects_active_content() {
        assert_eq!(mime(b"\xff\xd8\xffdata"), Some("image/jpeg"));
        assert_eq!(mime(b"RIFF1234WEBPdata"), Some("image/webp"));
        assert_eq!(mime(b"<svg onload='alert(1)'>"), None);
        assert_eq!(mime(b"<!doctype html>"), None);
    }
}
#[tauri::command]
pub async fn cached_cover(
    window: tauri::WebviewWindow,
    url: String,
    refresh: bool,
) -> Result<String, String> {
    let url = reqwest::Url::parse(&url).map_err(|_| "Invalid cover URL")?;
    if url.scheme() != "https"
        || url.host_str() != Some("lain.bgm.tv")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Cover host is not allowed".into());
    }
    let dir = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|_| "Cache unavailable")?
        .join("covers");
    fs::create_dir_all(&dir).map_err(|_| "Cache unavailable")?;
    let key = format!("{:x}", Sha256::digest(url.as_str().as_bytes()));
    let file = dir.join(&key);
    let old = fs::read(&file)
        .ok()
        .filter(|b| b.len() <= 2 * 1024 * 1024 && mime(b).is_some());
    let bytes = if !refresh && old.is_some() {
        old.unwrap()
    } else {
        let fetch = async {
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(15))
                .build()
                .map_err(|_| "Cover client unavailable")?;
            let mut res = client
                .get(url)
                .send()
                .await
                .map_err(|_| "Cover download failed")?
                .error_for_status()
                .map_err(|_| "Cover HTTP error")?;
            if res.content_length().unwrap_or(0) > 2 * 1024 * 1024 {
                return Err("Cover is too large");
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = res.chunk().await.map_err(|_| "Cover download failed")? {
                if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                    return Err("Cover is too large");
                }
                bytes.extend_from_slice(&chunk);
            }
            if mime(&bytes).is_none() {
                return Err("Unsupported cover image");
            }
            Ok(bytes)
        }
        .await;
        match fetch {
            Ok(bytes) => {
                let tmp = dir.join(format!("{key}.tmp"));
                if fs::write(&tmp, &bytes).is_ok() {
                    let _ = fs::rename(tmp, &file);
                }
                let mut entries: Vec<_> = fs::read_dir(&dir)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|e| e.file_name().to_string_lossy().len() == 64)
                    .collect();
                entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
                let mut total: u64 = entries
                    .iter()
                    .filter_map(|e| e.metadata().ok())
                    .map(|m| m.len())
                    .sum();
                let mut count = entries.len();
                for entry in entries {
                    if total <= 80 * 1024 * 1024 && count <= 400 {
                        break;
                    }
                    if entry.path() == file {
                        continue;
                    }
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    if fs::remove_file(entry.path()).is_ok() {
                        total = total.saturating_sub(size);
                        count -= 1;
                    }
                }
                bytes
            }
            Err(error) => old.ok_or_else(|| error.to_string())?,
        }
    };
    Ok(format!(
        "data:{};base64,{}",
        mime(&bytes).ok_or("Invalid image")?,
        STANDARD.encode(bytes)
    ))
}
