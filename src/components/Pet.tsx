import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { headTop, tickySvg } from "../ticky/art";
import { moodName, moodTone, pickLine, type MoodKey } from "../ticky/moods";
import { formatPrice, isKrx, type Quote, type Session, type WatchItem } from "../market/types";
import { Sparkline } from "./Sparkline";

interface Props {
  item: WatchItem;
  quote?: Quote;
  mood: MoodKey;
  line: string; // a fresh line picked when the mood changes
  onRemove?: () => void;
  /** fixed x position (preview lineup): the roaming engine leaves pinned Tickies alone */
  pinX?: number;
}

// a live price older than this is the last trade before a quiet stretch (night, weekend)
const STALE_MS = 15 * 60 * 1000;

const SESSION_NAME: Record<Session, string> = {
  pre: "프리마켓", regular: "정규장", post: "애프터마켓", closed: "장 마감",
};
// short badge next to the % on the name tag, only outside regular hours
const SESSION_BADGE: Partial<Record<Session, string>> = { pre: "장전", post: "장후" };

/** Two short lines: where the price is from, and how fresh it is. */
function sourceText(q: Quote): [string, string] {
  if (q.source === "fake") return ["가짜 시세", ""];
  const krx = isKrx(q.symbol);
  const head = `${krx ? "네이버" : "Yahoo"} · ${q.session ? SESSION_NAME[q.session] : ""}`;
  if (q.quotedAt && Date.now() - q.quotedAt > STALE_MS) {
    const d = new Date(q.quotedAt);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return [head, `${d.getMonth() + 1}/${d.getDate()} ${hm} 기준`];
  }
  return [head, `${krx ? "7초" : "15초"}마다 갱신`];
}

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// speech bubbles pop up now and then instead of staying up
const SAY_MS = [3200, 4800];   // how long a bubble stays
const QUIET_MS = [5000, 15000]; // pause between bubbles
const INFO_CHANCE = 0.2;       // how often the bubble reads out the stock's name and % instead of a mood line

/**
 * Decide when this Ticky talks: right away when its mood changes, otherwise every few seconds
 * at random (staggered so the Tickies don't all talk at once). Hovering hushes it (the card shows).
 */
function useChatter(moodLine: string, mood: MoodKey, infoLine: string | null, hushed: boolean) {
  const [said, setSaid] = useState<{ text: string; id: number } | null>(null);
  const latest = useRef({ mood, infoLine });
  latest.current = { mood, infoLine };
  const seq = useRef(0);
  const mounted = useRef(false);

  // restarts whenever the mood line changes: a new mood speaks up at once
  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    const nextLine = () => {
      const { mood: m, infoLine: info } = latest.current;
      return info && Math.random() < INFO_CHANCE ? info : pickLine(m);
    };
    const say = (text: string) => {
      if (cancelled) return;
      setSaid({ text, id: ++seq.current });
      timer = window.setTimeout(() => {
        setSaid(null);
        timer = window.setTimeout(() => say(nextLine()), rand(QUIET_MS[0], QUIET_MS[1]));
      }, rand(SAY_MS[0], SAY_MS[1]));
    };
    // first appearance: a staggered start so the Tickies don't all talk at once
    const delay = mounted.current ? 0 : rand(400, 6000);
    mounted.current = true;
    timer = window.setTimeout(() => say(moodLine), delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [moodLine]);

  return hushed ? null : said;
}

export function Pet({ item, quote, mood, line, onRemove, pinX }: Props) {
  const [hover, setHover] = useState(false);
  const pct = quote?.changePct ?? 0;
  // a stock added by its code shows the source's official name instead of the bare code
  const name = item.name === item.symbol && quote?.name ? quote.name : item.name;
  const tone = moodTone(mood, pct);
  // markup only changes with the mood, so animations aren't restarted on every price tick
  const svg = useMemo(() => tickySvg(mood, tone, `${name} ${moodName(mood)}`), [mood, tone, name]);
  const infoLine = quote && mood !== "offline" ? `${name} ${signed(pct)}%` : null;
  const said = useChatter(line, mood, infoLine, hover);

  const tag = (
    <div className="tag">
      {name} <b className={tone}>{quote && mood !== "offline" ? `${signed(pct)}%` : "—"}</b>
      {quote?.session && SESSION_BADGE[quote.session] && mood !== "offline" && (
        <span className="session">{SESSION_BADGE[quote.session]}</span>
      )}
    </div>
  );
  // distance from the bottom of the drawing up to the top of the head, in SVG units
  const head = { "--head": 140 - headTop(mood) } as CSSProperties;

  return (
    <div
      className="pet"
      data-symbol={item.symbol}
      data-pinned={pinX !== undefined ? "1" : undefined}
      style={pinX !== undefined ? { transform: `translateX(${pinX}px)` } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="figure" style={head}>
      {hover && quote && (
        <div className="card">
          <div className="card-top">
            <span className="card-name">{name}</span>
            <span className="card-mood">{moodName(mood)}</span>
          </div>
          <div className="card-price">{formatPrice(item.symbol, quote.price)}</div>
          <div className={`card-change ${tone}`}>
            {signed(quote.price - quote.prevClose, quote.prevClose > 1000 ? 0 : 2)} ({signed(pct)}%)
          </div>
          <Sparkline values={quote.history} base={quote.prevClose} tone={tone} />
          {sourceText(quote).filter(Boolean).map((l) => (
            <div key={l} className="card-source">{l}</div>
          ))}
        </div>
      )}
      {/* the speech bubble pops up right above the head now and then */}
      <div className="above">
        {said && <div key={said.id} className="bubble">{said.text}</div>}
      </div>
      <div className="art" dangerouslySetInnerHTML={{ __html: svg }} />
      {hover && onRemove && (
        <button className="remove" type="button" onClick={onRemove} title="화면에서 내리기 (목록에는 남아요)" aria-label={`${name} 화면에서 내리기`}>×</button>
      )}
      </div>
      {/* the name tag sits right under the feet, like the ground the Ticky stands on */}
      {tag}
    </div>
  );
}
