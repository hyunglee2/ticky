mod naver;
mod search;
mod yahoo;

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

/// Is the window's centre on any monitor? Windows can park windows far off-screen
/// (e.g. at -16384,-16256) around sleep, lock or display changes.
fn is_on_screen(window: &tauri::WebviewWindow) -> bool {
    let (Ok(pos), Ok(size), Ok(monitors)) =
        (window.outer_position(), window.outer_size(), window.available_monitors())
    else {
        return true; // can't tell: leave it alone
    };
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    monitors.iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
    })
}

/// Watch the cursor and let the window ignore mouse events unless it is over a hit region.
/// Every ~2 s also bring the window back if it has ended up off-screen.
fn start_click_through(app: AppHandle) {
    thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut tick: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(40));
            let Some(window) = app.get_webview_window("main") else { continue };
            tick = tick.wrapping_add(1);
            if tick % 50 == 0 && window.is_visible().unwrap_or(false) && !is_on_screen(&window) {
                let _ = place_bottom_right(&app);
            }
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

/// Windows' "Text size" accessibility setting as a factor (1.0 = 100% … 2.25 = 225%).
/// WebView2 doesn't apply it to page text, so the UI reads it and scales its text itself.
#[tauri::command]
fn text_scale() -> f64 {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Microsoft\\Accessibility") {
            if let Ok(percent) = key.get_value::<u32, _>("TextScaleFactor") {
                return (percent as f64 / 100.0).clamp(1.0, 2.25);
            }
        }
    }
    1.0 // not set = Windows default 100%
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
    // an off-screen window may have no current monitor; fall back to the primary one
    let monitor = if is_on_screen(&window) { window.current_monitor()? } else { None };
    let Some(monitor) = monitor.or(window.primary_monitor()?) else { return Ok(()) };
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
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            text_scale,
            yahoo::fetch_yahoo_quotes,
            naver::fetch_naver_quotes,
            search::search_stocks
        ])
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "보이기 / 숨기기", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "위치 초기화", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &reset, &quit])?;

            let mut tray = TrayIconBuilder::with_id("ticky-tray")
                .tooltip("ticky")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app),
                    "reset" => {
                        let _ = place_bottom_right(app);
                    }
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
