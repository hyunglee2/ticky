//! Stock search for the watchlist's autocomplete, via Naver Finance's autocomplete endpoint.
//! It covers Korean and US listings (with Korean names for US stocks). Unofficial, like the
//! quote sources: to be replaced before ticky is distributed.
use serde::{Deserialize, Serialize};

const AC_URL: &str = "https://ac.stock.naver.com/ac";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ticky";
const MAX_HITS: usize = 8;

#[derive(Deserialize)]
struct AcResponse {
    #[serde(default)]
    items: Vec<AcItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcItem {
    code: String,
    name: String,
    type_code: Option<String>,   // KOSPI, KOSDAQ, NASDAQ, NYSE, AMEX, …
    nation_code: Option<String>, // KOR, USA, JPN, …
}

#[derive(Serialize)]
pub struct SearchHit {
    symbol: String,
    name: String,
    /// "KR" | "US"
    market: &'static str,
    exchange: String,
}

#[tauri::command]
pub async fn search_stocks(query: String) -> Result<Vec<SearchHit>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("network: {e}"))?;
    let res = client
        .get(AC_URL)
        .query(&[("q", query), ("target", "stock")])
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("network: HTTP {}", res.status().as_u16()));
    }
    let body: AcResponse = res.json().await.map_err(|e| format!("network: {e}"))?;
    // only the markets ticky has quotes for
    Ok(body
        .items
        .into_iter()
        .filter_map(|it| {
            let market = match it.nation_code.as_deref() {
                Some("KOR") => "KR",
                Some("USA") => "US",
                _ => return None,
            };
            Some(SearchHit {
                symbol: it.code,
                name: it.name,
                market,
                exchange: it.type_code.unwrap_or_default(),
            })
        })
        .take(MAX_HITS)
        .collect())
}
