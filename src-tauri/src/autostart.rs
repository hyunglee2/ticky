//! 컴퓨터를 켜면 티키도 출근: start with Windows through the user's own Run key
//! (HKCU\…\Run, no admin rights). The installer's uninstaller removes the same value.
//!
//! Only an installed (release) build registers itself; a dev build would point Windows at
//! `target\debug`, so there the switch is shown but can't be turned on.

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE: &str = "ticky";

#[derive(serde::Serialize)]
pub struct AutostartState {
    on: bool,
    /// false in a dev build
    available: bool,
}

#[tauri::command]
pub fn get_autostart() -> AutostartState {
    AutostartState { on: is_on(), available: !cfg!(debug_assertions) }
}

#[tauri::command]
pub fn set_autostart(on: bool) -> Result<AutostartState, String> {
    if !cfg!(debug_assertions) {
        write(on)?;
    }
    Ok(get_autostart())
}

/// the command line Windows runs at sign-in
fn command() -> Option<String> {
    std::env::current_exe().ok().map(|p| format!("\"{}\"", p.display()))
}

#[cfg(windows)]
fn is_on() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(RUN_KEY) else { return false };
    // only if it starts this copy (not one left from an older install somewhere else)
    match (key.get_value::<String, _>(VALUE), command()) {
        (Ok(v), Some(c)) => v.eq_ignore_ascii_case(&c),
        _ => false,
    }
}

#[cfg(windows)]
fn write(on: bool) -> Result<(), String> {
    use winreg::{enums::{HKEY_CURRENT_USER, KEY_SET_VALUE}, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
        .map_err(|e| e.to_string())?;
    if on {
        let cmd = command().ok_or("no exe path")?;
        key.set_value(VALUE, &cmd).map_err(|e| e.to_string())
    } else {
        match key.delete_value(VALUE) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(not(windows))]
fn is_on() -> bool {
    false
}

#[cfg(not(windows))]
fn write(_on: bool) -> Result<(), String> {
    Err("Windows only".into())
}
