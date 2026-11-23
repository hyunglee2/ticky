//! US 주간거래 (day market) quotes from Korea Investment & Securities' Open API (KIS).
//!
//! Yahoo has no prices while US stocks trade overnight in New York time (daytime in Korea),
//! so for those hours the user can connect their own KIS app key. The key and secret are kept
//! in Windows Credential Manager (never in files or the app's storage), and so is the access
//! token: KIS issues tokens for 24 hours and frowns on asking for new ones often.
//!
//! API used:
//!   POST /oauth2/tokenP                               access token (client_credentials)
//!   GET  /uapi/overseas-price/v1/quotations/price     current price, tr_id HHDFS00000300
//!        EXCD: BAQ / BAY / BAA = NASDAQ / NYSE / AMEX day market
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};

const BASE: &str = "https://openapi.koreainvestment.com:9443";
const CRED_KEYS: &str = "ticky/kis-app";     // {"appkey","appsecret"}
const CRED_TOKEN: &str = "ticky/kis-token";  // {"token","expires_at"}
const DAY_EXCHANGES: [&str; 3] = ["BAQ", "BAY", "BAA"];

#[derive(Serialize, Deserialize, Clone)]
struct AppKeys {
    appkey: String,
    appsecret: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Token {
    token: String,
    /// unix seconds
    expires_at: i64,
}

/// In-memory copies, plus which day-market exchange each ticker was found on.
#[derive(Default)]
pub struct KisState {
    keys: Mutex<Option<AppKeys>>,
    token: Mutex<Option<Token>>,
    exchange: Mutex<HashMap<String, &'static str>>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---- Windows Credential Manager ------------------------------------------------------------

#[cfg(windows)]
mod vault {
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn write(target: &str, secret: &str) -> bool {
        let mut name = wide(target);
        let mut user = wide("ticky");
        let mut blob = secret.as_bytes().to_vec();
        let cred = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: name.as_mut_ptr(),
            Comment: std::ptr::null_mut(),
            LastWritten: FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: user.as_mut_ptr(),
        };
        // SAFETY: every pointer refers to a buffer that lives until the call returns
        unsafe { CredWriteW(&cred, 0) != 0 }
    }

    pub fn read(target: &str) -> Option<String> {
        let name = wide(target);
        let mut out: *mut CREDENTIALW = std::ptr::null_mut();
        // SAFETY: CredReadW fills `out` on success; the blob is copied before CredFree
        unsafe {
            if CredReadW(name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut out) == 0 || out.is_null() {
                return None;
            }
            let c = &*out;
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec();
            CredFree(out as *const _);
            String::from_utf8(bytes).ok()
        }
    }

    pub fn delete(target: &str) {
        let name = wide(target);
        // SAFETY: plain call with a NUL-terminated name
        unsafe {
            CredDeleteW(name.as_ptr(), CRED_TYPE_GENERIC, 0);
        }
    }
}

#[cfg(not(windows))]
mod vault {
    pub fn write(_: &str, _: &str) -> bool { false }
    pub fn read(_: &str) -> Option<String> { None }
    pub fn delete(_: &str) {}
}

fn load_keys(state: &KisState) -> Option<AppKeys> {
    let mut keys = state.keys.lock().ok()?;
    if keys.is_none() {
        *keys = vault::read(CRED_KEYS).and_then(|s| serde_json::from_str(&s).ok());
    }
    keys.clone()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("network: {e}"))
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    expires_in: Option<i64>,
    error_description: Option<String>,
    error_code: Option<String>,
}

/// A fresh token from KIS (and remembered for next time).
async fn issue_token(state: &KisState, keys: &AppKeys) -> Result<String, String> {
    let res = client()?
        .post(format!("{BASE}/oauth2/tokenP"))
        .json(&serde_json::json!({
            "grant_type": "client_credentials",
            "appkey": keys.appkey,
            "appsecret": keys.appsecret,
        }))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    let body: TokenResponse = res.json().await.map_err(|e| format!("network: {e}"))?;
    let Some(token) = body.access_token else {
        // EGW00133: asked for a token within a minute of the last one
        if body.error_code.as_deref() == Some("EGW00133") {
            return Err("rate-limit".into());
        }
        return Err(format!("auth: {}", body.error_description.unwrap_or_else(|| "앱키를 확인해 주세요".into())));
    };
    // a little early, so a token never runs out mid-request
    let t = Token { token: token.clone(), expires_at: now_secs() + body.expires_in.unwrap_or(86_400) - 600 };
    vault::write(CRED_TOKEN, &serde_json::to_string(&t).unwrap_or_default());
    if let Ok(mut slot) = state.token.lock() {
        *slot = Some(t);
    }
    Ok(token)
}

/// The cached token if it's still good, else a new one.
async fn token(state: &KisState, keys: &AppKeys) -> Result<String, String> {
    let cached = {
        let mut slot = state.token.lock().map_err(|_| "network: lock".to_string())?;
        if slot.is_none() {
            *slot = vault::read(CRED_TOKEN).and_then(|s| serde_json::from_str(&s).ok());
        }
        slot.clone()
    };
    match cached {
        Some(t) if t.expires_at > now_secs() => Ok(t.token),
        _ => issue_token(state, keys).await,
    }
}

#[derive(Deserialize)]
struct PriceResponse {
    rt_cd: String,
    msg_cd: Option<String>,
    output: Option<PriceOutput>,
}
#[derive(Deserialize)]
struct PriceOutput {
    last: String,
    base: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveQuote {
    symbol: String,
    price: f64,
    prev_close: f64,
    time: i64,
    session: &'static str,
}

#[derive(Serialize)]
pub struct QuoteBatch {
    quotes: Vec<LiveQuote>,
    missing: Vec<String>,
}

enum Lookup {
    Found(f64, f64),
    NotHere,
    TokenExpired,
}

async fn price_on(c: &reqwest::Client, keys: &AppKeys, token: &str, excd: &str, symbol: &str) -> Result<Lookup, String> {
    let res = c
        .get(format!("{BASE}/uapi/overseas-price/v1/quotations/price"))
        .query(&[("AUTH", ""), ("EXCD", excd), ("SYMB", symbol)])
        .header("authorization", format!("Bearer {token}"))
        .header("appkey", &keys.appkey)
        .header("appsecret", &keys.appsecret)
        .header("tr_id", "HHDFS00000300")
        .header("custtype", "P")
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    if res.status().as_u16() == 429 {
        return Err("rate-limit".into());
    }
    let body: PriceResponse = res.json().await.map_err(|e| format!("network: {e}"))?;
    if body.rt_cd != "0" {
        return match body.msg_cd.as_deref() {
            Some("EGW00123") | Some("EGW00121") => Ok(Lookup::TokenExpired),
            Some("EGW00201") => Err("rate-limit".into()),
            _ => Ok(Lookup::NotHere),
        };
    }
    let Some(o) = body.output else { return Ok(Lookup::NotHere) };
    match (o.last.trim().parse::<f64>(), o.base.trim().parse::<f64>()) {
        (Ok(last), Ok(base)) if last > 0.0 && base > 0.0 => Ok(Lookup::Found(last, base)),
        _ => Ok(Lookup::NotHere),
    }
}

/// Is a KIS app key saved?
#[tauri::command]
pub fn kis_status(state: tauri::State<KisState>) -> bool {
    load_keys(&state).is_some()
}

/// Check the app key by asking KIS for a token; keep it only if that works.
#[tauri::command]
pub async fn kis_connect(state: tauri::State<'_, KisState>, appkey: String, appsecret: String) -> Result<(), String> {
    let keys = AppKeys { appkey: appkey.trim().to_string(), appsecret: appsecret.trim().to_string() };
    if keys.appkey.is_empty() || keys.appsecret.is_empty() {
        return Err("auth: 앱키와 앱시크릿을 모두 넣어 주세요".into());
    }
    issue_token(&state, &keys).await?;
    if !vault::write(CRED_KEYS, &serde_json::to_string(&keys).unwrap_or_default()) {
        return Err("store: 키를 저장하지 못했어요".into());
    }
    if let Ok(mut slot) = state.keys.lock() {
        *slot = Some(keys);
    }
    Ok(())
}

/// Forget the app key and token.
#[tauri::command]
pub fn kis_disconnect(state: tauri::State<KisState>) {
    vault::delete(CRED_KEYS);
    vault::delete(CRED_TOKEN);
    if let Ok(mut k) = state.keys.lock() { *k = None; }
    if let Ok(mut t) = state.token.lock() { *t = None; }
}

/// 주간거래 prices for US tickers. Errors: `rate-limit`, `auth: …`, `network: …`, `off` (no key).
#[tauri::command]
pub async fn fetch_kis_quotes(state: tauri::State<'_, KisState>, symbols: Vec<String>) -> Result<QuoteBatch, String> {
    let Some(keys) = load_keys(&state) else { return Err("off".into()) };
    let c = client()?;
    let mut tok = token(&state, &keys).await?;
    let mut batch = QuoteBatch { quotes: Vec::new(), missing: Vec::new() };
    for symbol in symbols {
        let known = state.exchange.lock().ok().and_then(|m| m.get(&symbol).copied());
        // try the exchange it was found on before, else each day-market exchange in turn
        let order: Vec<&'static str> = match known {
            Some(x) => vec![x],
            None => DAY_EXCHANGES.to_vec(),
        };
        let mut found = None;
        for excd in order {
            let mut lookup = price_on(&c, &keys, &tok, excd, &symbol).await?;
            if matches!(lookup, Lookup::TokenExpired) {
                tok = issue_token(&state, &keys).await?;
                lookup = price_on(&c, &keys, &tok, excd, &symbol).await?;
            }
            // KIS allows about 20 calls a second; stay well under it
            tokio_sleep(60).await;
            if let Lookup::Found(price, base) = lookup {
                if let Ok(mut m) = state.exchange.lock() {
                    m.insert(symbol.clone(), excd);
                }
                found = Some((price, base));
                break;
            }
        }
        match found {
            Some((price, prev_close)) => {
                if cfg!(debug_assertions) {
                    eprintln!("[kis] {symbol} day price={price} base={prev_close}");
                }
                batch.quotes.push(LiveQuote { symbol, price, prev_close, time: now_secs(), session: "day" });
            }
            None => batch.missing.push(symbol),
        }
    }
    Ok(batch)
}

async fn tokio_sleep(ms: u64) {
    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(Duration::from_millis(ms)))
        .await
        .ok();
}
