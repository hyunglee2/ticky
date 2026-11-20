//! US quotes from Yahoo Finance's chart endpoint, including pre-market and after-hours.
//! This is an unofficial, undocumented API: it can change or start refusing requests at any
//! time, and it isn't meant for commercial use. Fine for a personal prototype; a shipped
//! version should move to a licensed data provider.
use serde::{Deserialize, Serialize};

const CHART_URL: &str = "https://query1.finance.yahoo.com/v8/finance/chart";
// Yahoo rejects requests without a browser-like user agent
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ticky";

#[derive(Deserialize)]
struct ChartResponse {
    chart: Chart,
}
#[derive(Deserialize)]
struct Chart {
    result: Option<Vec<ChartResult>>,
}
#[derive(Deserialize)]
struct ChartResult {
    meta: Meta,
    timestamp: Option<Vec<i64>>,
    indicators: Indicators,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    regular_market_price: f64,
    regular_market_time: i64,
    previous_close: Option<f64>,
    chart_previous_close: Option<f64>,
    current_trading_period: Option<TradingPeriods>,
}
#[derive(Deserialize)]
struct TradingPeriods {
    pre: Period,
    regular: Period,
    post: Period,
}
#[derive(Deserialize)]
struct Period {
    start: i64,
    end: i64,
}
#[derive(Deserialize)]
struct Indicators {
    quote: Vec<Bars>,
}
#[derive(Deserialize)]
struct Bars {
    close: Vec<Option<f64>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveQuote {
    symbol: String,
    price: f64,
    prev_close: f64,
    /// unix seconds of the trade this price comes from
    time: i64,
    /// "pre" | "regular" | "post" | "closed"
    session: &'static str,
}

#[derive(Serialize)]
pub struct QuoteBatch {
    quotes: Vec<LiveQuote>,
    /// symbols Yahoo doesn't know
    missing: Vec<String>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn to_quote(symbol: String, r: ChartResult) -> LiveQuote {
    let m = r.meta;
    let now = now_secs();
    let session = match &m.current_trading_period {
        Some(p) if now >= p.pre.start && now < p.pre.end => "pre",
        Some(p) if now >= p.regular.start && now < p.regular.end => "regular",
        Some(p) if now >= p.post.start && now < p.post.end => "post",
        _ => "closed",
    };
    // latest 1-minute bar, which covers pre-market and after-hours trades
    let ts = r.timestamp.unwrap_or_default();
    let closes = r.indicators.quote.into_iter().next().map(|b| b.close).unwrap_or_default();
    let last_bar = ts.iter().zip(closes.iter()).rev().find_map(|(t, c)| c.map(|c| (*t, c)));

    // Before today's regular session has traded, the regular price IS yesterday's close,
    // so that is the base for today's change; after the open, the base is the previous close.
    let regular_started = m
        .current_trading_period
        .as_ref()
        .map_or(true, |p| m.regular_market_time >= p.regular.start);
    let prev_close = if regular_started {
        m.previous_close.or(m.chart_previous_close).unwrap_or(m.regular_market_price)
    } else {
        m.regular_market_price
    };
    let (time, price) = match (session, last_bar) {
        ("regular", _) | (_, None) => (m.regular_market_time, m.regular_market_price),
        (_, Some(bar)) => bar,
    };
    LiveQuote { symbol, price, prev_close, time, session }
}

/// Errors come back as short codes the UI maps to messages: `rate-limit` or `network: …`.
#[tauri::command]
pub async fn fetch_yahoo_quotes(symbols: Vec<String>) -> Result<QuoteBatch, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("network: {e}"))?;
    let mut batch = QuoteBatch { quotes: Vec::new(), missing: Vec::new() };
    for symbol in symbols {
        let res = client
            // class shares are BRK.B elsewhere but BRK-B on Yahoo
            .get(format!("{CHART_URL}/{}", symbol.replace('.', "-")))
            .query(&[("interval", "1m"), ("range", "1d"), ("includePrePost", "true")])
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        match res.status().as_u16() {
            404 => {
                batch.missing.push(symbol);
                continue;
            }
            429 => return Err("rate-limit".into()),
            s if s >= 400 => return Err(format!("network: HTTP {s}")),
            _ => {}
        }
        let chart: ChartResponse = res.json().await.map_err(|e| format!("network: {e}"))?;
        match chart.chart.result.and_then(|r| r.into_iter().next()) {
            Some(result) => {
                let q = to_quote(symbol, result);
                if cfg!(debug_assertions) {
                    eprintln!("[yahoo] {} {} price={} base={} t={}", q.symbol, q.session, q.price, q.prev_close, q.time);
                }
                batch.quotes.push(q);
            }
            None => batch.missing.push(symbol),
        }
    }
    Ok(batch)
}
