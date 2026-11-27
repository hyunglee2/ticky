import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { headTop, tickySvg, type Face } from "../ticky/art";
import type { Outfit } from "../ticky/outfit";
import { useDrawnTop } from "../ticky/measure";
import { moodName, moodTone, pickFrom, REACT_LINES, SECTOR_EXTRA, sectorLine, TEASE_LINES, type MoodKey, type Tone } from "../ticky/moods";
import { SECTOR_NAME } from "../ticky/sectors";
import type { TickyEvent } from "../roam";
import { displayName, fullName, type Quote, type Session, type WatchItem } from "../market/types";
import { QuoteCard } from "./QuoteCard";

interface Props {
  item: WatchItem;
  quote?: Quote;
  mood: MoodKey;
  line: string;   // said right away whenever it changes (new mood, alarm reason, chart flow)
  pool: string[]; // what it says after that, now and then
  hint?: string[]; // situational lines (chart flow) that come up more often than the pool
  onDelete?: () => void; // remove from the list
  onHide?: () => void;   // 숨기기: off the screen, still on the list
  /** fixed x position (preview lineup): the roaming engine leaves pinned Tickies alone */
  pinX?: number;
  /** 출근 / 퇴근 while the layout switches (roam.ts walks it in or out) */
  commute?: "in" | "out";
  /** 괴롭히기: open it big in the middle of the screen */
  onTease?: () => void;
  /** off being teased right now (hidden here) */
  away?: boolean;
  /** was teased a while ago: wears a plaster */
  bandage?: boolean;
  /** the guide shown while the list is empty: no stock, so no price on its tag */
  guide?: boolean;
  /** US stock in Korean daytime: the price on its tag is last night's; it takes it easy */
  night?: boolean;
  /** US market holiday: badge "휴장" instead of "어젯밤" */
  holiday?: boolean;
  /** 꾸미기: open the dress-up screen */
  onDress?: () => void;
  /** what it's wearing */
  outfit?: Outfit;
}

// short badge next to the % on the name tag, only outside regular hours
const SESSION_BADGE: Partial<Record<Session, string>> = { pre: "장전", post: "장후", day: "주간" };

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// speech bubbles pop up now and then instead of staying up
const SAY_MS = [3200, 4800];   // how long a bubble stays
const QUIET_MS = [4000, 11000]; // pause between bubbles
const ALARM_QUIET_MS = [400, 800]; // 비상 is short: its follow-up line comes right after
const HINT_CHANCE = 0.4;        // situational lines beat mood lines
const SECTOR_TALK_CHANCE = 0.7; // two Tickies of the same industry meeting: how often they talk about it
const UP_TALK_CHANCE = 0.5;     // two rising Tickies meeting: how often they have a set exchange
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
    case "leave": return e.talk ? say(R.leave, "relief") : { text: null, face: "relief" };
    case "arrive": return e.talk ? say(R.arrive, "happy") : { text: null, face: "relief" };
    case "meet": {
      if (mood === "sleep" || mood === "offline") return { text: null };
      const theirs = moodTone(e.other, 0);
      if (e.sector && e.roll < SECTOR_TALK_CHANCE) {
        // same industry: both pick the same exchange from the shared roll; turn says which line is mine
        const S = R.meet.sector, x = SECTOR_EXTRA[e.sector];
        const first = e.turn === 0 ? tone : theirs;
        const pool = tone === "flat" || theirs === "flat" ? S.flat
          : tone === theirs ? (tone === "up" ? [...S.upUp, ...(x?.upUp ?? [])] : [...S.downDown, ...(x?.downDown ?? [])])
          : first === "up" ? S.upFirst : S.downFirst;
        const talk = pool[Math.floor((e.roll / SECTOR_TALK_CHANCE) * pool.length)];
        return { text: sectorLine(talk[e.turn], SECTOR_NAME[e.sector]), face: tone === "up" ? "happy" : tone === "flat" ? "relief" : undefined };
      }
      if (tone === "flat" || theirs === "flat") return say(R.meet.hi, "relief");
      if (tone === "up" && theirs === "up" && e.roll < UP_TALK_CHANCE) {
        const talk = R.meet.upUpTalk[Math.floor((e.roll / UP_TALK_CHANCE) * R.meet.upUpTalk.length)];
        return { text: talk[e.turn], face: "happy" };
      }
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

export function Pet({ item, quote, mood, line, pool, hint, onDelete, onHide, pinX, commute, onTease, away, bandage, guide, night, holiday, onDress, outfit }: Props) {
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
  const name = displayName(item, quote);
  const tone = moodTone(mood, pct);
  // markup only changes with the mood, so animations aren't restarted on every price tick
  const svg = useMemo(() => tickySvg(mood, tone, `${name} ${moodName(mood)}`, face, undefined, bandage, outfit), [mood, tone, name, face, bandage, outfit]);
  const { said, interrupt } = useChatter(line, pool, hint, mood === "alarm", hover || menu !== null);
  const artRef = useRef<HTMLDivElement>(null);
  const drawn = useDrawnTop(artRef, svg);

  // back from being teased: says something about it
  const wasAway = useRef(false);
  useEffect(() => {
    if (wasAway.current && !away && bandage) interrupt(pickFrom(TEASE_LINES.back));
    wasAway.current = !!away;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away]);

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
    const lostFocus = () => setMenu(null); // clicked out on the desktop or another app
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", lostFocus);
    };
  }, [menu]);
  const showCard = hover && !!quote && !menu && !said?.react;

  const tag = (
    <div className="tag">
      {name}{!guide && <> <b className={tone}>{quote && mood !== "offline" ? `${signed(pct)}%` : "—"}</b></>}
      {night && mood !== "offline" ? <span className="session">{holiday ? "휴장" : "어젯밤"}</span>
        : quote?.session && SESSION_BADGE[quote.session] && mood !== "offline" && (
          <span className="session">{SESSION_BADGE[quote.session]}</span>
        )}
    </div>
  );
  // distance from the bottom of the drawing up to the top of the head, in SVG units
  // (measured from the drawing, so it clears any hat or costume; the estimate covers the first paint)
  const head = { "--head": 140 - Math.min(headTop(mood, outfit), drawn ?? Infinity) } as CSSProperties;

  return (
    <div
      ref={root}
      className="pet"
      data-symbol={item.symbol}
      data-mood={mood}
      data-pinned={pinX !== undefined ? "1" : undefined}
      data-stay={stay ? "1" : undefined}
      data-commute={commute}
      data-angry={angry ? "1" : undefined}
      data-poke={poke}
      data-away={away ? "1" : undefined}
      data-night={night ? "1" : undefined}
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
          {onDress && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onDress(); }}>꾸미기</button>
          )}
          {onTease && mood !== "offline" && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onTease(); }}>괴롭히기</button>
          )}
          {onHide && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onHide(); }}>숨기기</button>
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
      {showCard && quote && <QuoteCard name={name} fullName={fullName(item, quote)} moodLabel={moodName(mood)} quote={quote} tone={tone} />}
      {/* the speech bubble pops up right above the head now and then */}
      <div className="above">
        {said && <div key={said.id} className="bubble">{said.text}</div>}
      </div>
      <div ref={artRef} className="art" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {/* the name tag sits right under the feet, like the ground the Ticky stands on */}
      {tag}
    </div>
  );
}
