#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Desktop shortcuts may be clicked more than once. Keep one process and bring the
    // existing timetable back to the foreground instead of opening duplicate windows.
    #[cfg(desktop)]
    {
        builder = builder
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
        .run(tauri::generate_context!())
        .expect("启动番组课表失败");
}
