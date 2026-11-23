import { useEffect, useState } from "react";
import { inTauri } from "../clickThrough";
import type { FeedStatus, LiveStatus, Quote } from "../market/types";
import { SCALES, useTextScale } from "../scale";
import { EV, on, send, type Layout, type SetMessage, type Settings as Values, type Snapshot } from "../sync";
import type { MoodKey } from "../ticky/moods";
import logo from "../../design/ticky-logo.svg";
import { MAX_LIST, useWatchlist } from "../watchlist";
import { KisBox } from "./KisBox";
import { WatchlistPanel } from "./WatchlistPanel";

type Page = "stocks" | "screen" | "sources";
const PAGES: { id: Page; label: string }[] = [
  { id: "stocks", label: "관심 종목" },
  { id: "screen", label: "화면" },
  { id: "sources", label: "시세 연결" },
];

const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: "roam", label: "티키 출근", hint: "티키들이 화면 아래를 돌아다녀요" },
  { value: "prices", label: "티키 퇴근", hint: "티키는 쉬고, 시세만 오른쪽 아래에 쌓여요" },
];

const LIVE_TEXT: Record<LiveStatus, string> = {
  off: "꺼짐",
  connecting: "연결 중…",
  ok: "",
  "rate-limit": "잠시 쉬는 중",
  error: "연결 안 됨",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * How the settings reach the Tickies: across windows by events (the settings window), or by
 * direct calls when shown inside the same page (the browser preview, where there's no 2nd window).
 */
export interface Bridge {
  snapshot: Snapshot;
  set: (msg: SetMessage) => void;
}

/** The settings window: menu on the left, the chosen page on the right. */
export function Settings({ bridge, onClose }: { bridge?: Bridge; onClose?: () => void }) {
  useTextScale();
  const watch = useWatchlist();
  const [page, setPage] = useState<Page>("stocks");

  // values shown here: the Tickies' window's latest snapshot, or what's saved until one arrives
  const [snap, setSnap] = useState<Snapshot>(() => bridge?.snapshot ?? {
    layout: load<Layout>("ticky.layout", "roam"),
    scale: load("ticky.scale", 1),
    followHours: load("ticky.followHours", false),
    wakeExtended: load("ticky.wakeExtended", true),
    preview: false,
    quotes: {},
    moods: {},
    status: { us: "off", kr: "off", day: "off", missing: [] },
  });
  useEffect(() => { if (bridge) setSnap(bridge.snapshot); }, [bridge]);
  useEffect(() => {
    if (bridge) return;
    const off = on<Snapshot>(EV.snapshot, setSnap);
    send(EV.hello);
    return off;
  }, [bridge]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setSnap((s) => ({ ...s, [key]: value })); // show it at once
    const msg = { key, value } as SetMessage;
    if (bridge) bridge.set(msg);
    else send(EV.set, msg);
  };

  return (
    <div className="settings-win panel">
      <nav className="side">
        <div className="side-brand">
          <img className="side-logo" src={logo} alt="" draggable={false} />
          <b>ticky</b>
        </div>
        {PAGES.map((p) => (
          <button key={p.id} type="button" className={page === p.id ? "on" : ""} onClick={() => setPage(p.id)}>{p.label}</button>
        ))}
        {onClose && <button type="button" className="side-close" onClick={onClose}>닫기</button>}
      </nav>

      <section className="content">
        {page === "stocks" && (
          <>
            <h2>관심 종목 <span className="h2-count">{watch.entries.length}/{MAX_LIST}</span></h2>
            <WatchlistPanel bare watch={watch} quotes={snap.quotes} moods={snap.moods} />
          </>
        )}

        {page === "screen" && (
          <>
            <h2>화면</h2>
            <div className="set-sec">
              <div className="set-label">티키</div>
              <div className="seg" role="group" aria-label="레이아웃">
                {LAYOUTS.map((l) => (
                  <button key={l.value} type="button" className={l.value === snap.layout ? "on" : ""} aria-pressed={l.value === snap.layout} onClick={() => set("layout", l.value)}>
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="set-hint">{LAYOUTS.find((l) => l.value === snap.layout)?.hint}</p>
            </div>
            <div className="set-sec">
              <div className="set-label">크기</div>
              <div className="seg" role="group" aria-label="크기">
                {SCALES.map((s) => (
                  <button key={s.value} type="button" className={s.value === snap.scale ? "on" : ""} aria-pressed={s.value === snap.scale} onClick={() => set("scale", s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-sec">
              <Switch on={snap.followHours} onChange={(v) => set("followHours", v)} label="장이 닫히면 재우기" />
              <Switch on={snap.wakeExtended} onChange={(v) => set("wakeExtended", v)} disabled={!snap.followHours} label="미국 장전·장후엔 깨어 있기" sub />
              <Switch on={snap.preview} onChange={(v) => set("preview", v)} label="모든 상태 미리보기" />
            </div>
          </>
        )}

        {page === "sources" && (
          <>
            <h2>시세 연결</h2>
            {inTauri() ? (
              <div className="set-sec">
                <Source name="한국 · 네이버" every="7초" status={snap.status.kr} />
                <Source name="미국 · Yahoo" every="15초" status={snap.status.us} />
                <KisBox status={snap.status.day} />
                <p className="set-hint">Yahoo는 한국 낮 시간(뉴욕 밤 8시~새벽 4시)에 미국 시세가 없어요. 이 시간엔 한국투자증권 앱키를 연결하면 주간거래 시세를 받아요.</p>
              </div>
            ) : (
              <p className="set-hint">실제 시세는 데스크톱 앱에서만 받아요.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** A setting that is on or off: label on the left, a small switch on the right. */
function Switch({ on, onChange, label, disabled, sub }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; sub?: boolean }) {
  return (
    <label className={`switch-row${sub ? " sub" : ""}${disabled ? " off" : ""}`}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

/** One price source: name, how often, and a coloured dot for its connection. */
function Source({ name, every, status }: { name: string; every: string; status: LiveStatus }) {
  return (
    <div className="src-row">
      <span className={`dot dot-${status}`} aria-hidden="true" />
      <span className="src-name">{name}</span>
      <span className="src-meta">{status === "ok" ? `${every}마다` : LIVE_TEXT[status]}</span>
    </div>
  );
}

export type { FeedStatus, Quote, MoodKey };
