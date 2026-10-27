use std::time::Duration;
use tauri_plugin_http::reqwest::{self, header};
#[derive(serde::Serialize)]
pub struct PreferenceResponse {
    status: u16,
    etag: Option<String>,
    body: String,
}

fn validated_url(endpoint: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "同步地址无效")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("同步地址必须为不含账号密码的 HTTPS 文件地址".into());
    }
    Ok(url)
}
fn conditional_write(
    request: reqwest::RequestBuilder,
    etag: Option<String>,
) -> Result<reqwest::RequestBuilder, String> {
    let condition = etag.ok_or("请先读取远端设置再上传")?;
    if condition == "*new*" {
        Ok(request.header(header::IF_NONE_MATCH, "*"))
    } else if condition.starts_with('"') && condition.ends_with('"') {
        Ok(request.header(header::IF_MATCH, condition))
    } else {
        Err("同步服务不支持安全覆盖设置".into())
    }
}

/// Only explicit, bounded WebDAV reads/writes. Credentials never enter files or error strings.
#[tauri::command]
pub async fn preferences_request(
    window: tauri::WebviewWindow,
    endpoint: String,
    username: String,
    password: String,
    payload: Option<String>,
    etag: Option<String>,
) -> Result<PreferenceResponse, String> {
    if window.label() != "main" {
        return Err("Preferences are only available in the main window".into());
    }
    let url = validated_url(&endpoint)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "无法创建同步连接")?;
    let request = if let Some(body) = payload {
        if body.len() > 256 * 1024 {
            return Err("设置文件超过大小限制".into());
        }
        let doc: serde_json::Value = serde_json::from_str(&body).map_err(|_| "设置文件无效")?;
        if doc["app"] != "bangumi-timetable-preferences" || doc["version"] != 1 {
            return Err("设置文件无效".into());
        }
        let request = client
            .put(url)
            .header(header::CONTENT_TYPE, "application/json")
            .body(body);
        conditional_write(request, etag)?
    } else {
        client
            .get(url)
            .header(header::CACHE_CONTROL, "no-cache, no-store")
    };
    let mut response = request
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|_| "同步连接失败，请检查地址和网络")?;
    let status = response.status().as_u16();
    let etag = response
        .headers()
        .get(header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    if response.content_length().unwrap_or(0) > 256 * 1024 {
        return Err("远端设置超过大小限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取同步响应失败")? {
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err("远端设置超过大小限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| "远端设置不是有效文本")?;
    Ok(PreferenceResponse { status, etag, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn webdav_rejects_cleartext_and_embedded_credentials() {
        for value in [
            "http://example.test/file",
            "https://user:secret@example.test/file",
            "https://example.test/file#fragment",
        ] {
            assert!(validated_url(value).is_err());
        }
        assert!(validated_url("https://example.test:8443/folder/preferences.json").is_ok());
    }
    #[test]
    fn writes_cannot_silently_overwrite_an_unknown_remote_version() {
        let client = reqwest::Client::new();
        let request = || client.put("https://example.test/preferences.json");
        assert!(conditional_write(request(), None).is_err());
        assert!(conditional_write(request(), Some("W/\"weak\"".into())).is_err());
        let create = conditional_write(request(), Some("*new*".into()))
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(create.headers().get(header::IF_NONE_MATCH).unwrap(), "*");
        let update = conditional_write(request(), Some("\"v2\"".into()))
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(update.headers().get(header::IF_MATCH).unwrap(), "\"v2\"");
    }
}
