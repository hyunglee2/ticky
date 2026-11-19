import { useMemo, useState } from "react";
import { tickySvg } from "../ticky/art";
import { moodName, moodTone, type MoodKey } from "../ticky/moods";
import { formatPrice, type Quote, type WatchItem } from "../market/types";
import { Sparkline } from "./Sparkline";

interface Props {
  item: WatchItem;
  quote?: Quote;
  mood: MoodKey;
  line: string;
  onRemove: () => void;
}

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

export function Pet({ item, quote, mood, line, onRemove }: Props) {
  const [hover, setHover] = useState(false);
  const pct = quote?.changePct ?? 0;
  const tone = moodTone(mood, pct);
  // markup only changes with the mood, so animations aren't restarted on every price tick
  const svg = useMemo(() => tickySvg(mood, tone, `${item.name} ${moodName(mood)}`), [mood, tone, item.name]);

  return (
    <div className="pet" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {hover && quote && (
        <div className="card">
          <div className="card-top">
            <span className="card-name">{item.name}</span>
            <span className="card-mood">{moodName(mood)}</span>
          </div>
          <div className="card-price">{formatPrice(item.symbol, quote.price)}</div>
          <div className={`card-change ${tone}`}>
            {signed(quote.price - quote.prevClose, quote.prevClose > 1000 ? 0 : 2)} ({signed(pct)}%)
          </div>
          <Sparkline values={quote.history} base={quote.prevClose} tone={tone} />
        </div>
      )}
      <div className="bubble">{line}</div>
      <div className="art" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="tag">
        {item.name} <b className={tone}>{signed(pct)}%</b>
      </div>
      {hover && (
        <button className="remove" type="button" onClick={onRemove} aria-label={`${item.name} 빼기`}>×</button>
      )}
    </div>
  );
}
