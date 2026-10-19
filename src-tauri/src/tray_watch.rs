use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    Manager,
};
#[derive(serde::Deserialize)]
pub struct WatchRow {
    id: u32,
    title: String,
    watched: u32,
    aired: Option<u32>,
    air_time: String,
}
#[derive(serde::Deserialize)]
pub struct Labels {
    today: String,
    show: String,
    quit: String,
    empty: String,
    next: String,
    detail: String,
}
#[tauri::command]
pub fn set_tray_watch_list(
    window: tauri::WebviewWindow,
    rows: Vec<WatchRow>,
    labels: Labels,
) -> Result<(), String> {
    if window.label() != "main" || rows.len() > 10 {
        return Err("Invalid tray request".into());
    }
    let app = window.app_handle();
    let menu = MenuBuilder::new(app).build().map_err(|e| e.to_string())?;
    let header = MenuItemBuilder::with_id("today-header", labels.today)
        .enabled(false)
        .build(app)
        .map_err(|e| e.to_string())?;
    menu.append(&header).map_err(|e| e.to_string())?;
    if rows.is_empty() {
        menu.append(
            &MenuItemBuilder::with_id("today-empty", labels.empty)
                .enabled(false)
                .build(app)
                .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }
    for row in rows {
        if row.id == 0
            || row.watched > 100000
            || row.aired.is_some_and(|x| x > 100000)
            || row.title.len() > 600
            || row.air_time.len() > 100
        {
            return Err("Invalid tray row".into());
        }
        let text = format!(
            "{} · {} · {}/{}",
            row.title.replace(['\n', '\r'], " "),
            row.air_time,
            row.watched,
            row.aired.map_or("?".into(), |n| n.to_string())
        );
        let detail = MenuItemBuilder::with_id(
            format!("watch-detail:{}:{}", row.id, row.watched),
            &labels.detail,
        )
        .build(app)
        .map_err(|e| e.to_string())?;
        let next = MenuItemBuilder::with_id(
            format!("watch-next:{}:{}", row.id, row.watched),
            &labels.next,
        )
        .enabled(row.aired.is_some_and(|n| n > row.watched))
        .build(app)
        .map_err(|e| e.to_string())?;
        let sub = SubmenuBuilder::new(app, text)
            .items(&[&detail, &next])
            .build()
            .map_err(|e| e.to_string())?;
        menu.append(&sub).map_err(|e| e.to_string())?;
    }
    menu.append(
        &MenuItemBuilder::with_id("show", labels.show)
            .build(app)
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    menu.append(
        &MenuItemBuilder::with_id("quit", labels.quit)
            .build(app)
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    app.tray_by_id("main-tray")
        .ok_or("Tray unavailable")?
        .set_menu(Some(menu))
        .map_err(|e| e.to_string())
}
