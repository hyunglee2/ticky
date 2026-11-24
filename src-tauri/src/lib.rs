mod kis;
mod naver;
mod search;
mod yahoo;

use std::{sync::Mutex, thread, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent,
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

/// Let clicks pass through the window, or not.
///
/// On Windows this flips only `WS_EX_TRANSPARENT` and keeps `WS_EX_LAYERED` on for good.
/// tao's `set_ignore_cursor_events` adds and removes both flags and forces a frame change,
/// which makes Windows re-render the transparent window: a visible flash every time the
/// cursor enters or leaves a Ticky. Windows reads `WS_EX_TRANSPARENT` on each hit test, so
/// flipping it alone takes effect at once with no repaint.
#[cfg(windows)]
fn set_click_through(window: &tauri::WebviewWindow, through: bool) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    };
    let Ok(hwnd) = window.hwnd() else { return false };
    let hwnd = hwnd.0 as _;
    // SAFETY: plain style read/write on our own top-level window handle
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let mut next = ex | WS_EX_LAYERED as isize;
        if through {
            next |= WS_EX_TRANSPARENT as isize;
        } else {
            next &= !(WS_EX_TRANSPARENT as isize);
        }
        if next != ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        }
    }
    true
}

#[cfg(not(windows))]
fn set_click_through(window: &tauri::WebviewWindow, through: bool) -> bool {
    window.set_ignore_cursor_events(through).is_ok()
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
/// Every ~2 s also re-dock the window if it has ended up off-screen.
fn start_click_through(app: AppHandle) {
    thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        let mut tick: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(40));
            let Some(window) = app.get_webview_window("main") else { continue };
            tick = tick.wrapping_add(1);
            if tick % 50 == 0 && window.is_visible().unwrap_or(false) && !is_on_screen(&window) {
                let _ = dock_to_bottom(&app, None);
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
            if ignoring != Some(ignore) && set_click_through(&window, ignore) {
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

/// Dock the window along the bottom of the screen, full width, just above the taskbar, so the
/// Tickies can wander the whole bottom edge. `height` is in logical px; `None` keeps the current one.
fn dock_to_bottom(app: &AppHandle, height: Option<f64>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else { return Ok(()) };
    // an off-screen window may have no current monitor; fall back to the primary one
    let monitor = if is_on_screen(&window) { window.current_monitor()? } else { None };
    let Some(monitor) = monitor.or(window.primary_monitor()?) else { return Ok(()) };
    let work = monitor.work_area();
    let h = match height {
        Some(h) => (h * monitor.scale_factor()).round().max(1.0) as u32,
        None => window.outer_size()?.height,
    };
    let h = h.min(work.size.height);
    window.set_size(PhysicalSize::new(work.size.width, h))?;
    window.set_position(PhysicalPosition::new(
        work.position.x,
        work.position.y + work.size.height as i32 - h as i32,
    ))?;
    Ok(())
}

/// Open the settings window in the middle of the screen (or bring it to the front if it's open).
/// A plain, framed window of its own: the Tickies' window is a transparent click-through strip,
/// which is no place for forms. Async so creating the window can't deadlock on Windows.
#[tauri::command]
async fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("index.html?view=settings".into()))
        .title("ticky 설정")
        .inner_size(600.0, 460.0)
        .min_inner_size(520.0, 400.0)
        .center()
        .focused(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 괴롭히기: a transparent window over the whole screen (work area) the Tickies are on, where
/// one Ticky shows up big in the middle. Replaces any one already open. When it's gone,
/// "ticky:tease-closed" tells the Tickies' window to bring that Ticky back.
#[tauri::command]
async fn open_tease(app: AppHandle, symbol: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("tease") {
        let _ = w.destroy();
    }
    let main = app.get_webview_window("main").ok_or("no main window")?;
    let monitor = main.current_monitor().ok().flatten()
        .or(main.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let work = monitor.work_area();
    let scale = monitor.scale_factor();
    // symbols are plain tickers / codes; keep it that way in the URL
    let symbol: String = symbol.chars().filter(|c| c.is_ascii_alphanumeric() || ".-^=".contains(*c)).collect();
    let url = format!("index.html?view=tease&s={symbol}");
    let w = tauri::WebviewWindowBuilder::new(&app, "tease", tauri::WebviewUrl::App(url.into()))
        .title("ticky")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(work.size.width as f64 / scale, work.size.height as f64 / scale)
        .position(work.position.x as f64 / scale, work.position.y as f64 / scale)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            let _ = handle.emit("ticky:tease-closed", ());
        }
    });
    Ok(())
}

/// First run: the market picker, in a small transparent window in the middle of the screen
/// (the Tickies' window is only a strip along the bottom).
#[tauri::command]
async fn open_welcome(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("welcome") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "welcome", tauri::WebviewUrl::App("index.html?view=welcome".into()))
        .title("ticky")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .resizable(false)
        .inner_size(820.0, 320.0) // room for the largest text size
        .center()
        .focused(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn close_welcome(app: AppHandle) {
    if let Some(w) = app.get_webview_window("welcome") {
        let _ = w.destroy();
    }
}

#[tauri::command]
fn close_tease(app: AppHandle) {
    if let Some(w) = app.get_webview_window("tease") {
        let _ = w.destroy();
    }
}

/// Open the KIS Developers portal (where the app key is issued) in the default browser.
#[tauri::command]
fn open_kis_portal() {
    #[cfg(windows)]
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", "https://apiportal.koreainvestment.com"])
        .spawn();
}

/// Called by the UI whenever what's on screen needs a different height (cards, panels, size setting).
#[tauri::command]
fn dock_bottom(app: AppHandle, height: f64) {
    let _ = dock_to_bottom(&app, Some(height));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HitRegions::default())
        .manage(kis::KisState::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            text_scale,
            dock_bottom,
            open_settings,
            open_tease,
            close_tease,
            open_welcome,
            open_kis_portal,
            close_welcome,
            yahoo::fetch_yahoo_quotes,
            kis::fetch_kis_quotes,
            kis::kis_status,
            kis::kis_connect,
            kis::kis_disconnect,
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
                        let _ = dock_to_bottom(app, None);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            dock_to_bottom(app.handle(), None)?;
            start_click_through(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
