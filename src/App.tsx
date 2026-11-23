import { useEffect, useMemo, useRef, useState } from "react";
import { Pet } from "./components/Pet";
import { Toolbar } from "./components/Toolbar";
import { Onboarding } from "./components/Onboarding";
import { StatePreview } from "./components/StatePreview";
import { TickerStack } from "./components/TickerStack";
import { createHybridFeed } from "./market/hybridFeed";
import { isMarketOpen } from "./market/hours";
import { isKrx, type FeedStatus, type Quote } from "./market/types";
import { ALARM_LINES, bandMood, moodLines, pickFrom, pickLine, type AlarmReason, type MoodKey } from "./ticky/moods";
import { detectTrend, TREND_LINES, type Trend } from "./ticky/trend";
import { nearestScale, useDockHeight, useTextScale, useTickyScale } from "./scale";
import { useRoaming } from "./roam";
import { invoke } from "@tauri-apps/api/core";
import { EV, on, send, type Layout, type SetMessage, type Snapshot } from "./sync";
import { Settings, type Bridge } from "./components/Settings";
import { Tease } from "./components/Tease";
import { inTauri, useClickThroughRegions } from "./clickThrough";
import { useWatchlist } from "./watchlist";
import "./App.css";

// 놀람: a move of 2% or more within the last ~5 minutes, shown for 3 s
const SHOCK_PCT = 2, SHOCK_MS = 3000;
// a teased Ticky wears its plaster this long
const PLASTER_MS = 10 * 60_000;
// 비상: siren + megaphone for 8 s, on any of
//   - a move of 3% or more within ~5 minutes (not again for 5 minutes)
//   - first crossing of ±10% for the day (entering 폭등 / 폭락)
const ALARM_PCT = 3, ALARM_MS = 8000, JUMP_ALARM_GAP = 5 * 60_000;

/** how many history points cover ~5 minutes: live KRX every 7 s, live US every 15 s, fake every 1.5 s */
/** the middle of three prices around index i: one odd print can't fake a sudden move */
const steady = (h: number[], i: number) => {
  const a = h.slice(Math.max(0, i - 1), i + 2).sort((x, y) => x - y);
  return a[Math.floor((a.length - 1) / 2)];
};
const fiveMinTicks = (q: Quote) => (q.source === "live" ? (isKrx(q.symbol) ? 43 : 20) : 20);
// a new chart-flow line (반등, 반납 …) speaks up at most this often; otherwise it joins the chatter
const TREND_GAP = 2 * 60_000;

// per-viewer conveniences; the app works the same if storage is unavailable
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

interface PetState {
  band: MoodKey;
  mood: MoodKey;
  line: string;
  shockUntil: number;
  alarmUntil: number;
  alarmReason?: AlarmReason;
  trend: Trend | null; // chart flow over the last ~10 minutes, for situational lines
  trendAt: number;     // when a chart-flow line last spoke up on its own
  jumpAlarmAt: number; // when the last 급변 alarm fired
}

const sameState = (a: PetState | undefined, b: PetState) =>
  !!a && a.band === b.band && a.mood === b.mood && a.line === b.line && a.shockUntil === b.shockUntil &&
  a.alarmUntil === b.alarmUntil &&
  a.alarmReason === b.alarmReason && a.trend === b.trend && a.trendAt === b.trendAt;

export type { Layout };

export default function App() {
  const watch = useWatchlist();
  const [followHours, setFollowHours] = useState<boolean>(() => load("ticky.followHours", false));
  // 레이아웃: Tickies roam the bottom of the screen (출근), or go home and leave just the prices (퇴근)
  const [layout, setLayout] = useState<Layout>(() => load("ticky.layout", "roam"));
  useEffect(() => save("ticky.layout", layout), [layout]);
  // what's on screen lags the setting while the Tickies walk out (퇴근) or in (출근)
  const [onScreen, setOnScreen] = useState<Layout>(layout);
  const [commute, setCommute] = useState<"in" | "out" | null>(null);
  const switchLayout = (next: Layout) => {
    if (next === layout) return;
    setLayout(next);
    if (preview || shown.length === 0) { // nobody on screen to walk: switch at once
      setOnScreen(next);
      setCommute(null);
      return;
    }
    if (next === "prices") {
      setCommute("out"); // they bow and walk off one by one; the price rows come once all are gone
    } else {
      setOnScreen("roam");
      setCommute("in"); // the price rows go and the Tickies walk in one by one
    }
  };
  // roam.ts says when everyone has gone (or arrived); a fallback in case it never does
  useEffect(() => {
    if (!commute) return;
    const finish = () => {
      if (commute === "out") setOnScreen("prices");
      setCommute(null);
    };
    window.addEventListener("ticky:commute-done", finish);
    const fallback = window.setTimeout(finish, 20_000);
    return () => { window.removeEventListener("ticky:commute-done", finish); window.clearTimeout(fallback); };
  }, [commute]);
  // US pre-market and after-hours: awake (default) or asleep like the overnight close
  const [wakeExtended, setWakeExtended] = useState<boolean>(() => load("ticky.wakeExtended", true));
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [pets, setPets] = useState<Record<string, PetState>>({});
  const petsRef = useRef(pets);
  petsRef.current = pets;
  // live quotes need the Rust side, so only in the desktop app (not the browser preview)
  const liveEnabled = useMemo(() => inTauri(), []);
  const [status, setStatus] = useState<FeedStatus>({ us: "off", kr: "off", day: "off", missing: [] });
  const feed = useMemo(() => createHybridFeed(liveEnabled), [liveEnabled]);

  // size setting scales only Tickies + bubbles; text follows Windows' text size
  const [scale, setScale] = useState<number>(() => nearestScale(load("ticky.scale", 1)));
  useEffect(() => save("ticky.scale", scale), [scale]);
  useTickyScale(scale);
  useTextScale();
  useDockHeight();
  useClickThroughRegions();

  useEffect(() => save("ticky.followHours", followHours), [followHours]);
  useEffect(() => save("ticky.wakeExtended", wakeExtended), [wakeExtended]);
  // preview mode: show every state side by side (not saved; off on each launch)
  const [preview, setPreview] = useState(false);
  // only the stocks shown on screen are polled; keyed by symbols so a re-render doesn't resubscribe
  const shownKey = watch.shown.map((e) => e.symbol).join(",");
  const shown = useMemo(() => watch.shown, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    return feed.subscribe(shown, (q) => setQuotes((prev) => ({ ...prev, [q.symbol]: q })), setStatus);
  }, [feed, shown]);

  // a 1-second clock so timed states (놀람, 비상) end on time even between price updates
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // derive each Ticky's mood from its quote; pick a new line only when the mood changes
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, PetState> = {};
    let changed = false;
    for (const { symbol } of shown) {
      const q = quotes[symbol];
      const old = petsRef.current[symbol];
      // 연결 끊김: the live source doesn't know this symbol, or that market's connection is failing
      const market = isKrx(symbol) ? status.kr : status.us;
      const liveDown = market === "rate-limit" || market === "error";
      if (liveEnabled && (status.missing.includes(symbol) || (liveDown && (!q || q.source === "live")))) {
        const line = old?.mood === "offline" ? old.line : pickLine("offline");
        next[symbol] = {
          band: old?.band ?? "calm", mood: "offline", line, shockUntil: 0, alarmUntil: 0,
          trend: null, trendAt: old?.trendAt ?? 0,
          jumpAlarmAt: old?.jumpAlarmAt ?? 0,
        };
        if (!sameState(old, next[symbol])) changed = true;
        continue;
      }
      if (!q) continue;
      const band = bandMood(q.changePct, old?.band);

      // movement over the last ~5 minutes
      const h = q.history;
      const n = fiveMinTicks(q);
      // since trading last resumed only (a market opening's jump isn't a sudden move),
      // the last few prices against those ~5 minutes earlier
      const r = q.recent ?? h;
      const last = r.length - 1;
      const move = last < 2 ? 0 : (steady(r, last - 1) / steady(r, Math.max(1, last - n)) - 1) * 100;

      let shockUntil = old?.shockUntil ?? 0;
      if (Math.abs(move) >= SHOCK_PCT && now >= shockUntil + SHOCK_MS) shockUntil = now + SHOCK_MS;

      // 비상 triggers
      let alarmUntil = old?.alarmUntil ?? 0;
      let fired: AlarmReason | undefined;
      let jumpAlarmAt = old?.jumpAlarmAt ?? 0;
      const fire = (reason: AlarmReason) => { alarmUntil = now + ALARM_MS; fired = reason; };
      if (Math.abs(move) >= ALARM_PCT && now - jumpAlarmAt >= JUMP_ALARM_GAP) {
        jumpAlarmAt = now;
        fire(move > 0 ? "jumpUp" : "jumpDown");
      }
      if (old && old.band !== band && (band === "boom" || band === "blast")) fire(band);
      // live quotes know their session (pre-market and after-hours count as awake);
      // fake ones fall back to the exchange's regular hours
      const closed = q.session
        ? q.session === "closed" || (!wakeExtended && q.session !== "regular")
        : !isMarketOpen(symbol);
      const mood: MoodKey =
        now < alarmUntil ? "alarm"
        : followHours && closed ? "sleep"
        : now < shockUntil ? "shock"
        : band;
      const alarmReason = fired ?? (mood === "alarm" ? old?.alarmReason : undefined);

      // chart flow (only for the plain % moods): compares with earlier prices, not just today's %
      const trend = mood === band ? detectTrend(h, q.prevClose, n * 2) : null;
      let trendAt = old?.trendAt ?? 0;

      // what to say first: a fresh alarm says why; a new mood picks a new line;
      // a new chart flow speaks up (not too often); otherwise keep the current line
      let line: string;
      if (fired) line = ALARM_LINES[fired][0];
      else if (!old || old.mood !== mood) line = pickLine(mood, old?.line);
      else if (trend && trend !== old.trend && now - trendAt >= TREND_GAP) {
        line = pickFrom(TREND_LINES[trend], old.line);
        trendAt = now;
      } else line = old.line;
      next[symbol] = {
        band, mood, line, shockUntil, alarmUntil, alarmReason, trend, trendAt, jumpAlarmAt,
      };
      if (!sameState(old, next[symbol])) changed = true;
    }
    if (Object.keys(next).length !== Object.keys(petsRef.current).length) changed = true;
    if (changed) setPets(next);
  }, [quotes, shown, followHours, wakeExtended, status, liveEnabled, watch.entries, clock]);

  // Tickies wander along the bottom of the screen at a pace set by their mood
  const moods = useMemo(
    () => Object.fromEntries(Object.entries(pets).map(([symbol, p]) => [symbol, p.mood])),
    [pets],
  );
  useRoaming(moods);

  // ---- the settings window ----------------------------------------------------------------
  // it lives in its own window: send it what it shows (now and then, and when it says hello),
  // and apply what it changes. In the browser preview there's no 2nd window: it opens in-page.
  const snapshot: Snapshot = { quotes, moods, status, layout, scale, followHours, wakeExtended, preview };
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  useEffect(() => {
    if (!inTauri()) return;
    const id = setInterval(() => send(EV.snapshot, snapRef.current), 1000);
    const off = on(EV.hello, () => send(EV.snapshot, snapRef.current));
    return () => { clearInterval(id); off(); };
  }, []);
  const apply = (m: SetMessage) => {
    switch (m.key) {
      case "layout": switchLayout(m.value); break;
      case "scale": setScale(m.value); break;
      case "followHours": setFollowHours(m.value); break;
      case "wakeExtended": setWakeExtended(m.value); break;
      case "preview": setPreview(m.value); break;
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => on<SetMessage>(EV.set, (m) => applyRef.current(m)), []);
  const [inlineSettings, setInlineSettings] = useState(false);
  const openSettings = () => {
    if (inTauri()) invoke("open_settings").catch(() => {});
    else setInlineSettings(true);
  };
  const bridge: Bridge = { snapshot, set: apply };

  // ---- 괴롭히기 ------------------------------------------------------------------------------
  // the Ticky goes off to a window of its own in the middle of the screen; meanwhile it's hidden
  // here. Teased at all → it comes back wearing a plaster for a while.
  const [teasing, setTeasing] = useState<string | null>(null);
  const [plasters, setPlasters] = useState<Record<string, number>>({});
  const teasingRef = useRef(teasing);
  teasingRef.current = teasing;
  const teaseDone = (symbol: string, hits: number) => {
    if (hits > 0) setPlasters((p) => ({ ...p, [symbol]: Date.now() + PLASTER_MS }));
    setTeasing(null);
  };
  useEffect(() => {
    const offDone = on<{ symbol: string; hits: number }>(EV.teaseDone, (m) => teaseDone(m.symbol, m.hits));
    const offClosed = on(EV.teaseClosed, () => setTeasing(null)); // closed some other way
    return () => { offDone(); offClosed(); };
  }, []);
  // plasters come off after a while
  useEffect(() => {
    const ids = Object.entries(plasters).map(([s, until]) => window.setTimeout(() => {
      setPlasters((p) => { const n = { ...p }; delete n[s]; return n; });
    }, Math.max(0, until - Date.now())));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [plasters]);
  const tease = (symbol: string) => {
    setTeasing(symbol);
    if (inTauri()) invoke("open_tease", { symbol }).catch(() => setTeasing(null));
  };

  return (
    <main className="desk">
      {!watch.ready && <Onboarding onPick={watch.start} />}
      {watch.ready && (
        <>
          <Toolbar layout={layout} onLayout={switchLayout} onSettings={openSettings} />
          {teasing && !inTauri() && (
            <div className="tease-inline">
              <Tease symbol={teasing} bridge={snapshot} onDone={(hits) => teaseDone(teasing, hits)} />
            </div>
          )}
          {inlineSettings && (
            <div className="settings-inline"><Settings bridge={bridge} onClose={() => setInlineSettings(false)} /></div>
          )}
          <div className="pets">
            {preview && <StatePreview />}
            {!preview && onScreen === "prices" && shown.length > 0 && (
              <TickerStack
                items={shown}
                quotes={quotes}
                moods={moods}
                onMove={(from, to) => watch.move(
                  watch.entries.findIndex((e) => e.symbol === from),
                  watch.entries.findIndex((e) => e.symbol === to),
                )}
                onDelete={(symbol) => watch.remove(symbol)}
              />
            )}
            {!preview && onScreen === "roam" && shown.map((item) => {
              const p = pets[item.symbol];
              return p ? (
                <Pet
                  key={item.symbol}
                  item={item}
                  quote={quotes[item.symbol]}
                  mood={p.mood}
                  line={p.line}
                  pool={p.mood === "alarm" && p.alarmReason ? [ALARM_LINES[p.alarmReason][1]] : moodLines(p.mood)}
                  hint={p.trend ? TREND_LINES[p.trend] : undefined}
                  onDelete={() => watch.remove(item.symbol)}
                  commute={commute ?? undefined}
                  onTease={() => tease(item.symbol)}
                  away={teasing === item.symbol}
                  bandage={item.symbol in plasters}
                />
              ) : null;
            })}
            {!preview && shown.length === 0 && (
              <p className="empty">＋ 를 눌러 목록에서 띄울 종목을 골라 보세요</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
