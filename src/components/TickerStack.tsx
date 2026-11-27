import { useEffect, useRef, useState } from "react";
import { displayName, formatPrice, fullName, type Quote, type Session, type WatchItem } from "../market/types";
import { moodName, toneFor, type MoodKey } from "../ticky/moods";
import { QuoteCard } from "./QuoteCard";

interface Props {
  items: (WatchItem & { hidden?: boolean })[];
  quotes: Record<string, Quote>;
  moods: Record<string, MoodKey>;
  /** drag a row up or down to reorder: move `from` to where `to` is */
  onMove: (from: string, to: string) => void;
  /** swipe a row all the way to the right: remove it from the list */
  onDelete: (symbol: string) => void;
  /** inside the watchlist panel: same rows and gestures, laid out in the panel, no details card */
  inPanel?: boolean;
  /** in the panel: the eye button at the row's end hides the stock from the screen or brings it back */
  onToggleHide?: (symbol: string) => void;
}

// quiet grey text after the %, outside regular hours
const SESSION_BADGE: Partial<Record<Session, string>> = { pre: "장전", post: "장후", day: "주간", closed: "마감" };
const SLOP = 5;            // px before a press on a row becomes a drag (up/down) or a swipe (sideways)
const DELETE_AT = 0.55;    // swiped this share of the row's width or more: let go and it's deleted
const SLIDE_OUT_MS = 180;

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

type Gesture =
  | { kind: "press"; symbol: string; from: number; x: number; y: number }
  | { kind: "reorder"; symbol: string; from: number; y: number; mids: number[]; h: number; dy: number; to: number }
  | { kind: "swipe"; symbol: string; x: number; dx: number; width: number };

/**
 * 티키 퇴근 (prices only): the Tickies go home and the shown stocks stack up as small price rows
 * in the bottom-right corner, next to the toolbar.
 *   - drag a row up or down to reorder
 *   - swipe it all the way to the right to delete it (like iPhone lists)
 *   - right-click it for the same details card a Ticky shows on hover
 * A small red dot blinks while that stock's 비상 is on.
 */
export function TickerStack({ items, quotes, moods, onMove, onDelete, inPanel, onToggleHide }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null); // swiped away, sliding out
  const g = useRef<Gesture | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const set = (next: Gesture | null) => { g.current = next; setGesture(next); };

  // the card closes on Esc or a click anywhere else: in this window, or out on the desktop or
  // another app (the click goes straight through to them, so this window just loses focus)
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".ticker-card")) setOpen(null);
    };
    const lostFocus = () => setOpen(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", lostFocus);
    };
  }, [open]);

  const onPointerDown = (e: React.PointerEvent, symbol: string, from: number) => {
    if (e.button !== 0 || leaving) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    set({ kind: "press", symbol, from, x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cur = g.current;
    if (!cur) return;
    if (cur.kind === "press") {
      const dx = e.clientX - cur.x, dy = e.clientY - cur.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        const width = rows.current.get(cur.symbol)!.getBoundingClientRect().width;
        set({ kind: "swipe", symbol: cur.symbol, x: cur.x, dx, width });
      } else {
        const els = items.map((it) => rows.current.get(it.symbol)!);
        const mids = els.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
        const h = els[0].getBoundingClientRect().height + 3;
        set({ kind: "reorder", symbol: cur.symbol, from: cur.from, y: cur.y, mids, h, dy, to: cur.from });
      }
      return;
    }
    if (cur.kind === "swipe") {
      set({ ...cur, dx: e.clientX - cur.x });
      return;
    }
    // reorder: the row lands in front of the first row whose middle is below the pointer
    const dy = e.clientY - cur.y;
    const y = cur.mids[cur.from] + dy;
    const to = Math.max(0, Math.min(items.length - 1, cur.mids.filter((m, i) => i !== cur.from && m < y).length));
    set({ ...cur, dy, to });
  };

  const onPointerUp = () => {
    const cur = g.current;
    set(null);
    if (!cur) return;
    if (cur.kind === "reorder" && cur.to !== cur.from) onMove(cur.symbol, items[cur.to].symbol);
    if (cur.kind === "swipe" && cur.dx >= cur.width * DELETE_AT) {
      // far enough: it slides the rest of the way out, then it's gone
      setLeaving(cur.symbol);
      window.setTimeout(() => { setLeaving(null); onDelete(cur.symbol); }, SLIDE_OUT_MS);
    }
  };

  return (
    <div className={inPanel ? "ticker in-panel" : "ticker"} role="list" aria-label="시세" data-dragging={gesture && gesture.kind !== "press" ? "1" : undefined}>
      {items.map((item, i) => {
        const q = quotes[item.symbol];
        const mood = moods[item.symbol];
        const offline = mood === "offline";
        const pct = q?.changePct ?? 0;
        const tone = !q || offline ? "flat" : toneFor(pct); // same colours as the Tickies' name tags
        // a stock added by its code shows the source's official name instead of the bare code
        const name = displayName(item, q);
        const badge = q?.session && !offline ? SESSION_BADGE[q.session] : undefined;

        // where the row sits: following the pointer, swiped right, or making way in a reorder
        let x = 0, y = 0;
        let armed = false; // swiped far enough that letting go deletes it
        if (leaving === item.symbol) {
          x = 400;
          armed = true;
        } else if (gesture?.kind === "swipe" && gesture.symbol === item.symbol) {
          x = Math.max(0, gesture.dx); // only to the right
          armed = x >= gesture.width * DELETE_AT;
        } else if (gesture?.kind === "reorder") {
          const { from, to, h } = gesture;
          y = gesture.symbol === item.symbol ? gesture.dy
            : from < to && i > from && i <= to ? -h
            : from > to && i >= to && i < from ? h
            : 0;
        }
        const moving = !!gesture && gesture.kind !== "press" && gesture.symbol === item.symbol;

        return (
          <div key={item.symbol} className="ticker-item" role="listitem">
            {!inPanel && open === item.symbol && q && (
              <QuoteCard className="ticker-card" name={name} fullName={fullName(item, q)} moodLabel={mood ? moodName(mood) : ""} quote={q} tone={tone} />
            )}
            {x > 0 && (
              <div className="ticker-delete" data-armed={armed ? "1" : undefined} style={{ width: Math.min(x, 400) }}>
                삭제
              </div>
            )}
            <div
              ref={(el) => { if (el) rows.current.set(item.symbol, el); else rows.current.delete(item.symbol); }}
              className="ticker-row"
              title="끌어서 순서 바꾸기 · 오른쪽 끝까지 밀어서 삭제 · 우클릭: 자세히 보기"
              style={x || y ? { transform: `translate(${x}px, ${y}px)` } : undefined}
              data-held={moving ? "1" : undefined}
              data-slid={x ? "1" : undefined}
              data-leaving={leaving === item.symbol ? "1" : undefined}
              data-open={open === item.symbol ? "1" : undefined}
              data-alarm={mood === "alarm" ? "1" : undefined}
              data-asleep={mood === "sleep" ? "1" : undefined}
              data-hidden={item.hidden ? "1" : undefined}
              onPointerDown={(e) => onPointerDown(e, item.symbol, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!inPanel) setOpen(open === item.symbol ? null : item.symbol);
              }}
            >
              <span className="ticker-name">{name}</span>
              <span className="ticker-price">{q && !offline ? formatPrice(item.symbol, q.price) : "—"}</span>
              <b className={`ticker-pct ${tone}`}>{q && !offline ? `${signed(pct)}%` : "—"}</b>
              <span className="ticker-session">{badge ?? ""}</span>{/* always there: keeps the columns lined up */}
              {onToggleHide && (
                <button
                  type="button"
                  className="ticker-eye"
                  aria-pressed={!item.hidden}
                  title={item.hidden ? "화면에 다시 보이기" : "화면에서 숨기기 (목록엔 남아요)"}
                  aria-label={item.hidden ? `${name} 보이기` : `${name} 숨기기`}
                  onPointerDown={(e) => e.stopPropagation()} // a click here isn't a drag or a swipe
                  onClick={() => onToggleHide(item.symbol)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
                    <circle cx="10" cy="10" r="2.4" />
                    {item.hidden && <line x1="3.5" y1="16.5" x2="16.5" y2="3.5" />}
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
