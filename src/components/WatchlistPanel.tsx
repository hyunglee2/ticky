import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../clickThrough";
import type { Quote } from "../market/types";
import type { MoodKey } from "../ticky/moods";
import { MAX_LIST, STARTERS, type AddResult, type Watchlist } from "../watchlist";
import { TickerStack } from "./TickerStack";

interface Hit { symbol: string; name: string; market: "KR" | "US"; exchange: string }

// outside the desktop app (browser preview) there is no Rust search: match a tiny local list instead
const PREVIEW_HITS: Hit[] = [
  ...STARTERS.kr.map((s) => ({ ...s, market: "KR" as const, exchange: "KOSPI" })),
  ...STARTERS.us.map((s) => ({ ...s, market: "US" as const, exchange: "NASDAQ" })),
  { symbol: "035420", name: "NAVER", market: "KR", exchange: "KOSPI" },
  { symbol: "SOXL", name: "SOXL", market: "US", exchange: "AMEX" },
];

/** US tickers in capitals; a name that's just the ticker in other casing ("Soxl") becomes the ticker */
const tidy = (h: Hit): Hit => {
  if (h.market !== "US") return h;
  const symbol = h.symbol.toUpperCase();
  return { ...h, symbol, name: h.name.toUpperCase() === symbol ? symbol : h.name };
};

async function search(query: string): Promise<Hit[]> {
  if (inTauri()) return (await invoke<Hit[]>("search_stocks", { query })).map(tidy);
  const q = query.toLowerCase();
  return PREVIEW_HITS.filter((h) => h.name.toLowerCase().includes(q) || h.symbol.toLowerCase().includes(q));
}

const NOTICE: Record<AddResult, string> = {
  added: "",
  duplicate: "이미 있는 종목이에요",
  full: `${MAX_LIST}개까지 담을 수 있어요. 하나를 지우고 추가해 주세요`,
};

interface Props {
  watch: Watchlist;
  quotes: Record<string, Quote>;
  moods: Record<string, MoodKey>;
}

export function WatchlistPanel({ watch, quotes, moods }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const seq = useRef(0);

  // debounced autocomplete; a newer query wins over a slower older response
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); setSearching(false); return; }
    const id = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await search(q);
        if (id === seq.current) setHits(res);
      } catch {
        if (id === seq.current) setHits([]);
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const say = (text: string) => {
    setNotice(text);
    if (text) setTimeout(() => setNotice((n) => (n === text ? "" : n)), 3000);
  };

  const pick = (h: Hit) => {
    say(NOTICE[watch.add({ symbol: h.symbol, name: h.name })]);
    setQuery("");
    setHits([]);
  };

  const listed = new Set(watch.entries.map((e) => e.symbol));
  const full = watch.entries.length >= MAX_LIST;

  return (
    <div className="panel watchlist">
      <div className="wl-head">
        <b>관심 종목</b>
        <span className={full ? "wl-count full" : "wl-count"}>{watch.entries.length}/{MAX_LIST}</span>
      </div>

      <div className="search">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={full ? `${MAX_LIST}개를 다 채웠어요` : "종목 추가 · 이름, 코드, 티커"}
          maxLength={30}
          spellCheck={false}
        />
        {query.trim() && (
          <ul className="hits" role="listbox">
            {hits.map((h) => (
              <li key={h.symbol}>
                <button type="button" disabled={listed.has(h.symbol)} onClick={() => pick(h)}>
                  <span className="hit-name">{h.name}</span>
                  <span className="hit-meta">{h.symbol} · {h.exchange}</span>
                  {listed.has(h.symbol) && <span className="hit-added">추가됨</span>}
                </button>
              </li>
            ))}
            {!searching && hits.length === 0 && <li className="hits-empty">찾는 종목이 없어요</li>}
          </ul>
        )}
      </div>

      {notice && <p className="notice">{notice}</p>}

      {/* the same rows as 티키 퇴근's price stack: drag to reorder, swipe right to delete */}
      <div className="list">
        <TickerStack
          inPanel
          items={watch.entries}
          quotes={quotes}
          moods={moods}
          onMove={(from, to) => watch.move(
            watch.entries.findIndex((e) => e.symbol === from),
            watch.entries.findIndex((e) => e.symbol === to),
          )}
          onDelete={watch.remove}
        />
        {watch.entries.length === 0 && <p className="hits-empty">위에서 종목을 검색해 추가해 보세요</p>}
      </div>
      {watch.entries.length > 0 && <p className="wl-foot">끌어서 순서 바꾸기 · 오른쪽 끝까지 밀어서 삭제</p>}
    </div>
  );
}
