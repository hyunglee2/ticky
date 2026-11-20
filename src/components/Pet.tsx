import { useMemo, useState } from "react";
import { tickySvg } from "../ticky/art";
import { moodName, moodTone, type MoodKey } from "../ticky/moods";
import { formatPrice, isKrx, type Quote, type Session, type WatchItem } from "../market/types";
import { Sparkline } from "./Sparkline";

interface Props {
  item: WatchItem;
  quote?: Quote;
  mood: MoodKey;
  line: string;
  onRemove: () => void;
}

// a live price older than this is the last trade before a quiet stretch (night, weekend)
const STALE_MS = 15 * 60 * 1000;

const SESSION_NAME: Record<Session, string> = {
  pre: "프리마켓", regular: "정규장", post: "애프터마켓", closed: "장 마감",
};
// short badge next to the % on the name tag, only outside regular hours
const SESSION_BADGE: Partial<Record<Session, string>> = { pre: "장전", post: "장후" };

function sourceText(q: Quote) {
  if (q.source === "fake") return "가짜 시세";
  const krx = isKrx(q.symbol);
  const from = krx ? "네이버" : "Yahoo";
  const session = q.session ? SESSION_NAME[q.session] : "";
  if (q.quotedAt && Date.now() - q.quotedAt > STALE_MS) {
    const at = new Date(q.quotedAt).toLocaleString("ko-KR", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return `${from} · ${session} · ${at} 마지막 가격`;
  }
  return `${from} · ${session} · ${krx ? "7초" : "15초"}마다`;
}

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

export function Pet({ item, quote, mood, line, onRemove }: Props) {
  const [hover, setHover] = useState(false);
  const pct = quote?.changePct ?? 0;
  // a stock added by its code shows the source's official name instead of the bare code
  const name = item.name === item.symbol && quote?.name ? quote.name : item.name;
  const tone = moodTone(mood, pct);
  // markup only changes with the mood, so animations aren't restarted on every price tick
  const svg = useMemo(() => tickySvg(mood, tone, `${name} ${moodName(mood)}`), [mood, tone, name]);

  return (
    <div className="pet" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
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
          <div className="card-source">{sourceText(quote)}</div>
        </div>
      )}
      <div className="bubble">{line}</div>
      <div className="art" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="tag">
        {name} <b className={tone}>{quote && mood !== "offline" ? `${signed(pct)}%` : "—"}</b>
        {quote?.session && SESSION_BADGE[quote.session] && mood !== "offline" && (
          <span className="session">{SESSION_BADGE[quote.session]}</span>
        )}
      </div>
      {hover && (
        <button className="remove" type="button" onClick={onRemove} aria-label={`${name} 빼기`}>×</button>
      )}
    </div>
  );
}
