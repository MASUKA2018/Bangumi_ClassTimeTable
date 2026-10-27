use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager,
};
struct MobileTools(PluginHandle<tauri::Wry>);
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("mobile-tools")
        .setup(|app, api| {
            app.manage(MobileTools(api.register_android_plugin(
                "com.bangumi.classtimetable",
                "MobileToolsPlugin",
            )?));
            Ok(())
        })
        .build()
}
#[tauri::command]
pub async fn android_export_text(
    window: tauri::WebviewWindow,
    name: String,
    text: String,
    mime: String,
) -> Result<(), String> {
    if window.label() != "main"
        || name.len() > 120
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        || text.len() > 5 * 1024 * 1024
        || !["application/json", "text/calendar"].contains(&mime.as_str())
    {
        return Err("导出文件无效".into());
    }
    window
        .state::<MobileTools>()
        .0
        .run_mobile_plugin::<()>(
            "exportText",
            serde_json::json!({"name":name,"text":text,"mime":mime}),
        )
        .map_err(|_| "无法打开系统文件分享，请稍后重试".into())
}
#[tauri::command]
pub async fn android_reminder_settings(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只能从主窗口打开设置".into());
    }
    window
        .state::<MobileTools>()
        .0
        .run_mobile_plugin::<()>("reminderSettings", ())
        .map_err(|_| "无法打开系统提醒设置".into())
}

#[tauri::command]
pub async fn android_launch_subject(window: tauri::WebviewWindow) -> Result<Option<u32>, String> {
    if window.label() != "main" {
        return Err("只能从主窗口读取通知".into());
    }
    window
        .state::<MobileTools>()
        .0
        .run_mobile_plugin("consumeLaunch", ())
        .map_err(|_| "无法读取启动通知".into())
}
