#[cfg(desktop)]
mod backups;
#[cfg(desktop)]
mod tray_watch;
#[cfg(desktop)]
mod updates;

#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn started_by_autostart() -> bool {
    std::env::args().any(|arg| arg == "--autostart")
}

#[cfg(desktop)]
#[tauri::command]
fn sync_window_theme(
    window: tauri::WebviewWindow,
    dark: bool,
    background: [u8; 3],
    foreground: [u8; 3],
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the main window can change native window appearance".into());
    }
    window
        .set_theme(Some(if dark {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }))
        .map_err(|error| error.to_string())?;
    window
        .set_background_color(Some(tauri::window::Color(
            background[0],
            background[1],
            background[2],
            255,
        )))
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    window
        .set_title_bar_style(tauri::TitleBarStyle::Transparent)
        .map_err(|error| error.to_string())?;

    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        };
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
        // COLORREF is 0x00BBGGRR. These two attributes are available on Windows 11;
        // earlier Windows versions retain the light/dark native appearance above.
        for (attribute, rgb) in [
            (DWMWA_CAPTION_COLOR, background),
            (DWMWA_TEXT_COLOR, foreground),
        ] {
            let color = u32::from(rgb[0]) | (u32::from(rgb[1]) << 8) | (u32::from(rgb[2]) << 16);
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    attribute as u32,
                    (&color as *const u32).cast(),
                    std::mem::size_of::<u32>() as u32,
                );
            }
        }
    }
    #[cfg(not(windows))]
    let _ = foreground;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Desktop shortcuts may be clicked more than once. Keep one process and bring the
    // existing timetable back to the foreground instead of opening duplicate windows.
    #[cfg(desktop)]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![
                sync_window_theme,
                backups::list_local_backups,
                backups::read_local_backup,
                backups::save_local_backup,
                updates::check_app_update,
                updates::install_app_update,
                tray_watch::set_tray_watch_list
            ])
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                show_main_window(app);
            }))
            // Reminder cards calculate their position from the monitor work area every time.
            // Persisting their state can race with that calculation on Windows and move them
            // back to a stale/default position near the center of the screen.
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_filter(|label| label == "main")
                    .build(),
            )
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ))
            .setup(|app| {
                let show = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

                let mut tray = TrayIconBuilder::with_id("main-tray")
                    .tooltip("番组课表")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main_window(app),
                        "quit" => app.exit(0),
                        value if value.starts_with("watch-") => {
                            let parts: Vec<_> = value.split(':').collect();
                            if parts.len() == 3 {
                                if let (Ok(id), Ok(expected)) = (parts[1].parse::<u32>(), parts[2].parse::<u32>()) {
                                    let _ = app.emit_to("main", "btt-tray-watch", serde_json::json!({ "id": id, "expected": expected, "action": parts[0] }));
                                    if parts[0] == "watch-detail" { show_main_window(app); }
                                }
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main_window(tray.app_handle());
                        }
                    });

                if let Some(icon) = app.default_window_icon().cloned() {
                    tray = tray.icon(icon);
                }

                tray.build(app)?;
                if started_by_autostart() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                Ok(())
            })
            .on_window_event(|window, event| {
                if window.label() != "main" {
                    return;
                }

                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    tauri::WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                        let _ = window.hide();
                    }
                    _ => {}
                }
            });
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("启动番组课表失败");
}
