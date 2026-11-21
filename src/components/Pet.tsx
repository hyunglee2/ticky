import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { headTop, tickySvg, type Face } from "../ticky/art";
import { moodName, moodTone, pickFrom, REACT_LINES, type MoodKey, type Tone } from "../ticky/moods";
import type { TickyEvent } from "../roam";
import { formatPrice, isKrx, type Quote, type Session, type WatchItem } from "../market/types";
import { Sparkline } from "./Sparkline";

interface Props {
  item: WatchItem;
  quote?: Quote;
  mood: MoodKey;
  line: string;   // said right away whenever it changes (new mood, alarm reason, chart flow)
  pool: string[]; // what it says after that, now and then
  hint?: string[]; // situational lines (chart flow) that come up more often than the pool
  onRemove?: () => void; // hide from the screen (stays in the list)
  onDelete?: () => void; // remove from the list
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
const ALARM_QUIET_MS = [400, 800]; // 비상 is short: its follow-up line comes right after
const HINT_CHANCE = 0.4;        // situational lines beat mood lines
const REACT_MS = 2200;          // a reaction (poke, throw, meeting) bubble
const ANGRY_POKES = 4, ANGRY_WINDOW = 3000, ANGRY_MS = 1600; // poked this often → cross for a bit
const FLY_SPEED = 600;          // px/s: thrown rather than just dropped
const FLY_FACES: Face[] = ["fly", "flyJoy", "flyPanic"]; // a different face for each throw
// how long each reaction face stays (grab / fly last until the next event)
const FACE_MS: Partial<Record<Face, number>> = {
  relief: 1200, shy: 1800, dizzy: 2600, wince: 900, sulk: 1400, angry: ANGRY_MS, happy: 1600,
};

/**
 * What it says and the face it pulls when something happens to it. The two are picked together
 * so the words always match the face. text: null = keep quiet, "" = stop talking for now.
 * face: undefined = keep the face it has (its mood, or one still showing).
 */
function reaction(e: TickyEvent, mood: MoodKey, tone: Tone, angry: boolean): { text: string | null; face?: Face } {
  const R = REACT_LINES;
  const say = (pool: string[], face?: Face) => ({ text: pickFrom(pool), face });
  switch (e.kind) {
    case "grab": return Math.random() < 0.3 ? say(R.grabHappy, "happy") : say(R.grab, "grab");
    // bubbles stay hidden in flight; the landing says something
    case "throw": return { text: "", face: e.speed > FLY_SPEED ? FLY_FACES[Math.floor(Math.random() * FLY_FACES.length)] : "grab" };
    case "land": return Math.random() < 0.5 ? say(R.land, "relief") : { text: null, face: "relief" };
    case "crash": return say(R.crash, "dizzy");
    case "huff": return say(R.huff, "angry");
    case "shy": return say(R.shy, "shy");
    case "fun": return say(R.fun, "happy");
    case "poke":
      if (angry) return say(R.angry, "angry");
      if (mood === "sleep") return say(R.pokeSleep);     // stays asleep
      if (mood === "offline") return say(R.pokeOffline);
      return tone === "up" ? say(R.poke.up, "happy")     // 히히 간지러워
        : tone === "down" ? say(R.poke.down, "sulk")     // 건드리지 마...
        : say(R.poke.flat, "wince");                     // 응? 왜?
    case "meet": {
      if (mood === "sleep" || mood === "offline") return { text: null };
      const theirs = moodTone(e.other, 0);
      if (tone === "flat" || theirs === "flat") return say(R.meet.hi, "relief");
      if (tone === "up") return theirs === "up" ? say(R.meet.upUp, "happy") : say(R.meet.upDown, "relief");
      return say(theirs === "up" ? R.meet.downUp : R.meet.downDown); // keeps its glum mood face
    }
  }
}

/**
 * Decide when this Ticky talks: right away when its mood changes, otherwise every few seconds
 * at random (staggered so the Tickies don't all talk at once). Hovering hushes it (the card shows).
 */
function useChatter(moodLine: string, pool: string[], hint: string[] | undefined, quick: boolean, hushed: boolean) {
  const [said, setSaid] = useState<{ text: string; id: number; react?: boolean } | null>(null);
  const interruptRef = useRef<(text: string) => void>(() => {});
  const latest = useRef({ pool, hint, quick });
  latest.current = { pool, hint, quick };
  const last = useRef("");
  const seq = useRef(0);
  const mounted = useRef(false);

  // restarts whenever the mood line changes: a new mood speaks up at once
  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    const nextLine = () => {
      const { pool: p, hint: h } = latest.current;
      return h?.length && Math.random() < HINT_CHANCE ? pickFrom(h, last.current) : pickFrom(p, last.current);
    };
    const say = (text: string, react = false) => {
      if (cancelled) return;
      last.current = text;
      setSaid({ text, id: ++seq.current, react });
      timer = window.setTimeout(() => {
        setSaid(null);
        const [lo, hi] = latest.current.quick ? ALARM_QUIET_MS : QUIET_MS;
        timer = window.setTimeout(() => say(nextLine()), rand(lo, hi));
      }, react ? REACT_MS : rand(SAY_MS[0], SAY_MS[1]));
    };
    // something happened to it: answer at once, then carry on chatting as usual
    // empty text: just stop talking for now (a thrown Ticky goes quiet until it lands)
    interruptRef.current = (text) => {
      window.clearTimeout(timer);
      if (text) return say(text, true);
      setSaid(null);
      timer = window.setTimeout(() => say(nextLine()), rand(QUIET_MS[0], QUIET_MS[1]));
    };
    // first appearance: a staggered start so the Tickies don't all talk at once
    const delay = mounted.current ? 0 : rand(400, 6000);
    mounted.current = true;
    timer = window.setTimeout(() => say(moodLine), delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [moodLine]);

  // reactions show even while hovered (the mouse is usually right there when it's poked)
  return { said: hushed && !said?.react ? null : said, interrupt: (text: string) => interruptRef.current(text) };
}

export function Pet({ item, quote, mood, line, pool, hint, onRemove, onDelete, pinX }: Props) {
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState<null | "open" | "confirm">(null);
  const [stay, setStay] = useState(false);     // 가만히 있기: doesn't wander (can still be carried)
  const [angry, setAngry] = useState(false);
  const [poke, setPoke] = useState<"a" | "b" | undefined>(); // flips to restart the squish animation
  const [face, setFace] = useState<Face | undefined>();       // reaction face over the mood's
  const root = useRef<HTMLDivElement>(null);
  const pokes = useRef<number[]>([]);
  const pct = quote?.changePct ?? 0;
  // a stock added by its code shows the source's official name instead of the bare code
  const name = item.name === item.symbol && quote?.name ? quote.name : item.name;
  const tone = moodTone(mood, pct);
  // markup only changes with the mood, so animations aren't restarted on every price tick
  const svg = useMemo(() => tickySvg(mood, tone, `${name} ${moodName(mood)}`, face), [mood, tone, name, face]);
  const { said, interrupt } = useChatter(line, pool, hint, mood === "alarm", hover || menu !== null);

  // reactions to being handled (events come from roam.ts)
  const react = useRef({ mood, tone, angry, interrupt });
  react.current = { mood, tone, angry, interrupt };
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let angryTimer = 0, faceTimer = 0;
    const show = (f: Face | undefined) => {
      window.clearTimeout(faceTimer);
      setFace(f);
      const ms = f && FACE_MS[f];
      if (ms) faceTimer = window.setTimeout(() => setFace(undefined), ms);
    };
    const onTicky = (ev: Event) => {
      const e = (ev as CustomEvent<TickyEvent>).detail;
      const r = react.current;
      let cross = r.angry;
      if (e.kind === "huff") {
        // cross + shaking, like being poked too often
        setAngry(true);
        window.clearTimeout(angryTimer);
        angryTimer = window.setTimeout(() => setAngry(false), ANGRY_MS);
      }
      if (e.kind === "poke") {
        setPoke((p) => (p === "a" ? "b" : "a"));
        const now = Date.now();
        pokes.current = [...pokes.current.filter((t) => now - t < ANGRY_WINDOW), now];
        if (pokes.current.length >= ANGRY_POKES) {
          cross = true;
          pokes.current = [];
          setAngry(true);
          window.clearTimeout(angryTimer);
          angryTimer = window.setTimeout(() => setAngry(false), ANGRY_MS);
        }
      }
      const { text, face: f } = reaction(e, r.mood, r.tone, cross);
      if (f) show(f);
      if (text !== null) r.interrupt(text);
    };
    el.addEventListener("ticky", onTicky);
    return () => { el.removeEventListener("ticky", onTicky); window.clearTimeout(angryTimer); window.clearTimeout(faceTimer); };
  }, []);

  // the right-click menu closes on any click elsewhere or Esc
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".menu")) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", close); };
  }, [menu]);
  const showCard = hover && !!quote && !menu && !said?.react;

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
      ref={root}
      className="pet"
      data-symbol={item.symbol}
      data-pinned={pinX !== undefined ? "1" : undefined}
      data-stay={stay ? "1" : undefined}
      data-angry={angry ? "1" : undefined}
      data-poke={poke}
      onContextMenu={(e) => { e.preventDefault(); setMenu("open"); }}
      style={pinX !== undefined ? { transform: `translateX(${pinX}px)` } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="figure" style={head}>
      {menu && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setStay((s) => !s); setMenu(null); }}>
            {stay ? "다시 돌아다니기" : "가만히 있기"}
          </button>
          {onRemove && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onRemove(); }}>
              화면에서 내리기
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => (menu === "confirm" ? (setMenu(null), onDelete()) : setMenu("confirm"))}
            >
              {menu === "confirm" ? "한 번 더 누르면 삭제" : "목록에서 삭제"}
            </button>
          )}
        </div>
      )}
      {showCard && quote && (
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
      {menu && onRemove && (
        <button className="remove" type="button" onClick={onRemove} title="화면에서 내리기 (목록에는 남아요)" aria-label={`${name} 화면에서 내리기`}>×</button>
      )}
      </div>
      {/* the name tag sits right under the feet, like the ground the Ticky stands on */}
      {tag}
    </div>
  );
}
