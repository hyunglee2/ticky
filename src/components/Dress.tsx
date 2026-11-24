import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../clickThrough";
import { displayName } from "../market/types";
import { EV, on, send, type Snapshot } from "../sync";
import { tickySvg } from "../ticky/art";
import { moodName, moodTone, pickFrom, type MoodKey } from "../ticky/moods";
import { CATALOG, itemIcon, type Outfit, type Slot } from "../ticky/outfit";
import { useDrawnTop } from "../ticky/measure";
import { useWatchlist } from "../watchlist";

// 꾸미기: the Ticky big in the middle of the screen (the same see-through window as 괴롭히기),
// a drawer of things to wear underneath. Click to put on, click again to take off; one thing
// per spot. Changes are saved as they're made (and reach the Tickies' window at once).
// "다 했어", Esc or a click on the empty screen sends it back down.

const SAY_MS = 1800;
const LEAVE_MS = 360;
const OFF_LINES = ["가벼워졌다", "벗었어", "이것도 괜찮지?"];

export function Dress({ symbol, bridge, onDone }: { symbol: string; bridge?: Snapshot; onDone?: () => void }) {
  const watch = useWatchlist();
  const [snap, setSnap] = useState<Snapshot | null>(bridge ?? null);
  useEffect(() => { if (bridge) setSnap(bridge); }, [bridge]);
  useEffect(() => {
    if (bridge) return;
    const off = on<Snapshot>(EV.snapshot, setSnap);
    send(EV.hello);
    return off;
  }, [bridge]);

  const entry = watch.entries.find((e) => e.symbol === symbol);
  const outfit: Outfit = entry?.outfit ?? {};
  const quote = snap?.quotes[symbol];
  const baseMood: MoodKey = snap?.moods[symbol] ?? "calm";
  // dressing up is a calm moment: no siren or shock face while trying things on
  const mood: MoodKey = baseMood === "alarm" || baseMood === "shock" ? "good" : baseMood;
  const tone = moodTone(baseMood, quote?.changePct ?? 0);
  const name = entry ? displayName(entry, quote) : symbol;
  const dressArt = useRef<HTMLDivElement>(null);
  const svg = useMemo(() => tickySvg(mood, tone, `${name} ${moodName(mood)}`, undefined, undefined, false, outfit),
    [mood, tone, name, outfit]);
  // the bubble floats just above the top of whatever is drawn (hat, costume, star…)
  const top = useDrawnTop(dressArt, svg);
  const bubbleAt = top === null ? undefined : { top: "auto", bottom: `${350 - top * 2.5 + 4}px` };

  // ---- talking, a little hop on each change ---------------------------------------------------
  const [tab, setTab] = useState<Slot>("head");
  const [said, setSaid] = useState<{ text: string; id: number } | null>(null);
  const [hop, setHop] = useState<"a" | "b" | undefined>();
  const seq = useRef(0);
  const sayTimer = useRef(0);
  const say = (text: string) => {
    const id = ++seq.current;
    setSaid({ text, id });
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setSaid((s) => (s?.id === id ? null : s)), SAY_MS);
  };
  useEffect(() => {
    const t = window.setTimeout(() => say(Object.keys(outfit).length ? "또 갈아입어?" : "뭐 입혀 줄 거야?"), 380);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wear = (slot: Slot, id: string, line: string) => {
    if (!entry) return;
    const off = outfit[slot] === id;
    const next: Outfit = { ...outfit, [slot]: off ? undefined : id };
    // a costume comes with its own topper: putting one on takes the hat off, and the other way round
    if (!off && slot === "body") next.head = undefined;
    if (!off && slot === "head") next.body = undefined;
    watch.setOutfit(symbol, next);
    setHop((h) => (h === "a" ? "b" : "a"));
    say(off ? pickFrom(OFF_LINES) : line);
  };
  const takeAllOff = () => {
    if (!entry || !Object.keys(outfit).length) return;
    watch.setOutfit(symbol, {});
    setHop((h) => (h === "a" ? "b" : "a"));
    say("다 벗었다!");
  };

  // ---- ending -----------------------------------------------------------------------------------
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      onDone?.();
      if (inTauri()) invoke("close_tease").catch(() => {});
    }, LEAVE_MS);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="tease dress"
      data-leaving={leaving ? "1" : undefined}
      onPointerDown={(e) => { if (e.button === 0 && !(e.target as Element).closest?.(".tease-ticky, .dress-drawer")) finish(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tease-stage">
        <div className="tease-ticky">
          <div className="tease-bubble-wrap" style={bubbleAt}>{said && <div key={said.id} className="bubble tease-bubble">{said.text}</div>}</div>
          <div className="tease-body">
            <div ref={dressArt} className="tease-art" data-bonk={hop} dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>
        <div className="tease-name">{name}</div>
      </div>

      {/* the wardrobe beside the Ticky: a tab per spot, that spot's things in a grid */}
      <div className="dress-drawer">
        <div className="dress-tabs" role="tablist">
          {CATALOG.map((group) => (
            <button
              key={group.slot}
              type="button"
              role="tab"
              aria-selected={tab === group.slot}
              className={tab === group.slot ? "on" : ""}
              onClick={() => setTab(group.slot)}
            >
              {group.label}
              {outfit[group.slot] && <i className="dress-dot" aria-label="입는 중" />}
            </button>
          ))}
        </div>
        <div className="dress-grid" role="tabpanel">
          {CATALOG.find((g) => g.slot === tab)!.items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={outfit[tab] === it.id ? "on" : ""}
              aria-pressed={outfit[tab] === it.id}
              onClick={() => wear(tab, it.id, it.line)}
            >
              <span className="dress-icon" dangerouslySetInnerHTML={{ __html: itemIcon(tab, it.id) }} />
              <span className="dress-name">{it.label}</span>
            </button>
          ))}
        </div>
        <div className="dress-actions">
          <button type="button" className="dress-reset" onClick={takeAllOff} disabled={!Object.keys(outfit).length}>다 벗기</button>
          <button type="button" className="dress-done" onClick={finish}>다 했어</button>
        </div>
      </div>
    </div>
  );
}
