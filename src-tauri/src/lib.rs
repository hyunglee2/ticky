use std::{sync::Mutex, thread, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, PhysicalPosition,
};

/// Areas of the window (in logical px, `[left, top, width, height]`) that should catch the mouse:
/// the Tickies, toolbar and any open card or panel. Everywhere else clicks pass through.
#[derive(Default)]
struct HitRegions(Mutex<Vec<[f64; 4]>>);

#[tauri::command]
fn set_hit_regions(state: tauri::State<HitRegions>, rects: Vec<[f64; 4]>) {
    if let Ok(mut regions) = state.0.lock() {
        *regions = rects;
    }
}

/// Watch the cursor and let the window ignore mouse events unless it is over a hit region.
fn start_click_through(app: AppHandle) {
    thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        loop {
            thread::sleep(Duration::from_millis(40));
            let Some(window) = app.get_webview_window("main") else { continue };
            let (Ok(cursor), Ok(origin), Ok(scale)) =
                (app.cursor_position(), window.inner_position(), window.scale_factor())
            else {
                continue;
            };
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            let over = app
                .state::<HitRegions>()
                .0
                .lock()
                .map(|r| r.iter().any(|[l, t, w, h]| x >= *l && x <= l + w && y >= *t && y <= t + h))
                .unwrap_or(true);
            let ignore = !over;
            if ignoring != Some(ignore) && window.set_ignore_cursor_events(ignore).is_ok() {
                ignoring = Some(ignore);
            }
        }
    });
}

/// Show the window if hidden, hide it if shown.
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Park the window at the bottom-right of the screen, just above the taskbar.
fn place_bottom_right(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else { return Ok(()) };
    let Some(monitor) = window.current_monitor()? else { return Ok(()) };
    let work = monitor.work_area();
    let size = window.outer_size()?;
    let x = work.position.x + work.size.width as i32 - size.width as i32 - 16;
    let y = work.position.y + work.size.height as i32 - size.height as i32;
    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HitRegions::default())
        .invoke_handler(tauri::generate_handler![set_hit_regions])
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "보이기 / 숨기기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;

            let mut tray = TrayIconBuilder::with_id("ticky-tray")
                .tooltip("ticky")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            place_bottom_right(app.handle())?;
            start_click_through(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
