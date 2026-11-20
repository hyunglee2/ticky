//! Korean quotes from Naver Finance's polling endpoint (near real-time, no key needed).
//! Unofficial and undocumented, like Yahoo: fine for a personal prototype, must be replaced
//! with a licensed source (or the user's own KIS key) before ticky is distributed.
use serde::{Deserialize, Serialize};

const POLL_URL: &str = "https://polling.finance.naver.com/api/realtime/domestic/stock";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ticky";

#[derive(Deserialize)]
struct PollResponse {
    datas: Vec<Item>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    item_code: String,
    stock_name: String,
    close_price: String,
    compare_to_previous_close_price: String,
    market_status: String,
    local_traded_at: Option<String>,
    over_market_price_info: Option<OverMarket>,
}

/// Extended sessions (NXT pre-market / after-market) when they are trading.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverMarket {
    trading_session_type: Option<String>,
    over_price: Option<String>,
    over_market_status: Option<String>,
    local_traded_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KrQuote {
    symbol: String,
    name: String,
    price: f64,
    prev_close: f64,
    /// ISO time of the trade, as Naver reports it
    traded_at: Option<String>,
    /// "pre" | "regular" | "post" | "closed"
    session: &'static str,
}

#[derive(Serialize)]
pub struct KrBatch {
    quotes: Vec<KrQuote>,
    /// codes Naver returned nothing for
    missing: Vec<String>,
}

/// "183,000" / "-13,900" → number
fn num(s: &str) -> Option<f64> {
    s.replace(',', "").trim().parse().ok()
}

fn to_quote(it: Item) -> Option<KrQuote> {
    let close = num(&it.close_price)?;
    let change = num(&it.compare_to_previous_close_price).unwrap_or(0.0);
    let prev_close = close - change;
    let mut quote = KrQuote {
        symbol: it.item_code,
        name: it.stock_name,
        price: close,
        prev_close,
        traded_at: it.local_traded_at,
        session: if it.market_status == "OPEN" { "regular" } else { "closed" },
    };
    // outside regular hours, an open NXT pre/after session carries the live price
    if let Some(over) = it.over_market_price_info {
        let open = over.over_market_status.as_deref() == Some("OPEN");
        let session = match over.trading_session_type.as_deref() {
            Some("PRE_MARKET") => Some("pre"),
            Some("AFTER_MARKET") => Some("post"),
            _ => None,
        };
        if let (true, Some(session), Some(price)) = (open, session, over.over_price.as_deref().and_then(num)) {
            quote.price = price;
            quote.session = session;
            quote.traded_at = over.local_traded_at.or(quote.traded_at);
        }
    }
    Some(quote)
}

/// One request for all codes. Errors come back as `rate-limit` or `network: …`.
#[tauri::command]
pub async fn fetch_naver_quotes(codes: Vec<String>) -> Result<KrBatch, String> {
    if codes.is_empty() {
        return Ok(KrBatch { quotes: Vec::new(), missing: Vec::new() });
    }
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("network: {e}"))?;
    let res = client
        .get(format!("{POLL_URL}/{}", codes.join(",")))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    match res.status().as_u16() {
        429 => return Err("rate-limit".into()),
        s if s >= 400 => return Err(format!("network: HTTP {s}")),
        _ => {}
    }
    let body: PollResponse = res.json().await.map_err(|e| format!("network: {e}"))?;
    let quotes: Vec<KrQuote> = body.datas.into_iter().filter_map(to_quote).collect();
    if cfg!(debug_assertions) {
        for q in &quotes {
            eprintln!("[naver] {} {} {} price={} base={}", q.symbol, q.name, q.session, q.price, q.prev_close);
        }
    }
    let missing = codes.into_iter().filter(|c| !quotes.iter().any(|q| &q.symbol == c)).collect();
    Ok(KrBatch { quotes, missing })
}
