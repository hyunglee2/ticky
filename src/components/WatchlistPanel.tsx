import { Fragment, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../clickThrough";
import { isKrx } from "../market/types";
import { MAX_LIST, MAX_SHOWN, STARTERS, type AddResult, type Watchlist } from "../watchlist";

interface Hit { symbol: string; name: string; market: "KR" | "US"; exchange: string }

// outside the desktop app (browser preview) there is no Rust search: match a tiny local list instead
const PREVIEW_HITS: Hit[] = [
  ...STARTERS.kr.map((s) => ({ ...s, market: "KR" as const, exchange: "KOSPI" })),
  ...STARTERS.us.map((s) => ({ ...s, market: "US" as const, exchange: "NASDAQ" })),
  { symbol: "035420", name: "NAVER", market: "KR", exchange: "KOSPI" },
  { symbol: "SOXL", name: "SOXL", market: "US", exchange: "AMEX" },
];

async function search(query: string): Promise<Hit[]> {
  if (inTauri()) return invoke<Hit[]>("search_stocks", { query });
  const q = query.toLowerCase();
  return PREVIEW_HITS.filter((h) => h.name.toLowerCase().includes(q) || h.symbol.toLowerCase().includes(q));
}

const NOTICE: Record<AddResult, string> = {
  shown: "",
  listed: `화면이 꽉 찼어요. 목록에만 넣었어요 (화면은 최대 ${MAX_SHOWN}개)`,
  duplicate: "이미 목록에 있어요",
  full: `목록이 꽉 찼어요 (최대 ${MAX_LIST}개)`,
};

export function WatchlistPanel({ watch }: { watch: Watchlist }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
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

  const toggle = (symbol: string, shown: boolean) => {
    if (!watch.setShown(symbol, shown)) say(`화면에는 최대 ${MAX_SHOWN}개까지 띄울 수 있어요. 하나를 먼저 내려 주세요`);
  };

  // target / stop price editor, one stock at a time
  const [editing, setEditing] = useState<string | null>(null);
  const [targetText, setTargetText] = useState("");
  const [stopText, setStopText] = useState("");
  const openAlerts = (symbol: string, target?: number, stop?: number) => {
    if (editing === symbol) { setEditing(null); return; }
    setEditing(symbol);
    setTargetText(target ? String(target) : "");
    setStopText(stop ? String(stop) : "");
  };
  const parsePrice = (text: string) => {
    const n = Number(text.replace(/[,\s원$]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const saveAlerts = (symbol: string) => {
    const target = parsePrice(targetText), stop = parsePrice(stopText);
    watch.setAlerts(symbol, target, stop);
    setEditing(null);
    say(target || stop ? "알림을 설정했어요. 가격에 닿으면 티키가 비상을 울려요" : "알림을 지웠어요");
  };

  const listed = new Set(watch.entries.map((e) => e.symbol));

  return (
    <div className="panel watchlist">
      <div className="search">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목명·코드·티커 검색"
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

      <div className="list-head">
        <span>관심 종목 {watch.entries.length}/{MAX_LIST}</span>
        <span>화면 {watch.shownCount}/{MAX_SHOWN}</span>
      </div>
      <ul className="list">
        {watch.entries.map((e, i) => (
          <Fragment key={e.symbol}>
            <li
              className={dragFrom === i ? "dragging" : ""}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => { if (dragFrom !== null) watch.move(dragFrom, i); setDragFrom(null); }}
              onDragEnd={() => setDragFrom(null)}
            >
              <span className="handle" title="끌어서 순서 바꾸기">⋮⋮</span>
              <label className="row-main">
                <input type="checkbox" checked={e.shown} onChange={(ev) => toggle(e.symbol, ev.target.checked)} />
                <span className="row-name">{e.name}</span>
                <span className="row-symbol">{e.symbol}</span>
              </label>
              <button
                type="button"
                className={`row-alert ${e.target || e.stop ? "set" : ""}`}
                title="목표가·손절가 알림"
                aria-expanded={editing === e.symbol}
                onClick={() => openAlerts(e.symbol, e.target, e.stop)}
              >알림</button>
              <button type="button" className="row-delete" title="목록에서 삭제" aria-label={`${e.name} 삭제`} onClick={() => watch.remove(e.symbol)}>×</button>
            </li>
            {editing === e.symbol && (
              <li className="alert-edit">
                <form onSubmit={(ev) => { ev.preventDefault(); saveAlerts(e.symbol); }}>
                  <label>목표가<input inputMode="decimal" value={targetText} onChange={(ev) => setTargetText(ev.target.value)} placeholder={isKrx(e.symbol) ? "원" : "$"} /></label>
                  <label>손절가<input inputMode="decimal" value={stopText} onChange={(ev) => setStopText(ev.target.value)} placeholder={isKrx(e.symbol) ? "원" : "$"} /></label>
                  <button type="submit">저장</button>
                </form>
              </li>
            )}
          </Fragment>
        ))}
        {watch.entries.length === 0 && <li className="hits-empty">위에서 종목을 검색해 추가해 보세요</li>}
      </ul>
    </div>
  );
}
