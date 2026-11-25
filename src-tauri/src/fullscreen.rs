//! Step aside for full-screen apps: while a game, a video or a slideshow fills the screen the
//! Tickies are on, their window is hidden; it comes back when that app leaves full screen (or
//! another window comes to the front). A maximised window doesn't count — it leaves the taskbar.
//!
//! Only a window this watcher hid is shown again, so hiding the Tickies from the tray stays put.

use std::{sync::Mutex, thread, time::Duration};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct FullscreenHide {
    /// the setting ("전체 화면일 때 숨기기"); on unless the UI says otherwise
    off: Mutex<bool>,
    /// the Tickies are hidden because of a full-screen app (so they're ours to bring back)
    hidden: Mutex<bool>,
}

impl FullscreenHide {
    /// the user showed or hid the window themselves: it's theirs now, not the watcher's
    pub fn forget(&self) {
        if let Ok(mut h) = self.hidden.lock() {
            *h = false;
        }
    }
}

#[tauri::command]
pub fn set_fullscreen_hide(app: AppHandle, on: bool) {
    let state = app.state::<FullscreenHide>();
    if let Ok(mut off) = state.off.lock() {
        *off = !on;
    }
}

pub fn start(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(700));
        let Some(window) = app.get_webview_window("main") else { continue };
        let state = app.state::<FullscreenHide>();
        let off = state.off.lock().map(|o| *o).unwrap_or(false);
        let Ok(mut hidden) = state.hidden.lock() else { continue };
        let full = !off && foreground_is_fullscreen(&window);
        if full && !*hidden && window.is_visible().unwrap_or(false) {
            show(&window, false);
            *hidden = true;
        } else if !full && *hidden {
            show(&window, true);
            *hidden = false;
        }
    });
}

/// Show or hide without taking the focus away from whatever the user is in.
#[cfg(windows)]
fn show(window: &tauri::WebviewWindow, visible: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};
    let Ok(hwnd) = window.hwnd() else { return };
    // SAFETY: showing / hiding our own top-level window
    unsafe {
        ShowWindow(hwnd.0 as _, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
    }
}

#[cfg(not(windows))]
fn show(window: &tauri::WebviewWindow, visible: bool) {
    let _ = if visible { window.show() } else { window.hide() };
}

/// Is the window in front another app's, covering the whole monitor the Tickies are on?
#[cfg(windows)]
fn foreground_is_fullscreen(main: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        System::Threading::GetCurrentProcessId,
        UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId},
    };
    let Ok(ours) = main.hwnd() else { return false };
    // SAFETY: read-only queries about window handles Windows just gave us
    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_null() {
            return false;
        }
        // our own windows (settings, 괴롭히기, 꾸미기) never count
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, &mut pid);
        if pid == GetCurrentProcessId() {
            return false;
        }
        // the desktop and the taskbar cover the screen too, but they're not "an app in full screen"
        let mut buf = [0u16; 64];
        let n = GetClassNameW(fg, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
        let class = String::from_utf16_lossy(&buf[..n]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        // only a full-screen app on the Tickies' own monitor
        let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        if monitor != MonitorFromWindow(ours.0 as _, MONITOR_DEFAULTTONEAREST) {
            return false;
        }
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return false;
        }
        let mut r: RECT = std::mem::zeroed();
        if GetWindowRect(fg, &mut r) == 0 {
            return false;
        }
        let m = info.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

#[cfg(not(windows))]
fn foreground_is_fullscreen(_main: &tauri::WebviewWindow) -> bool {
    false
}
