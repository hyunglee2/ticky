import { useMemo } from "react";
import type { Quote } from "../market/types";
import { moodName, pickLine, type MoodKey } from "../ticky/moods";
import { Pet } from "./Pet";

/** Every state, with a representative day change so the colour and tag look right. */
const STATES: { mood: MoodKey; pct: number }[] = [
  { mood: "boom", pct: 12.3 },
  { mood: "cheer", pct: 7.1 },
  { mood: "happy", pct: 3.2 },
  { mood: "good", pct: 1.1 },
  { mood: "calm", pct: 0.1 },
  { mood: "sulky", pct: -1.2 },
  { mood: "sad", pct: -3.4 },
  { mood: "melt", pct: -7.2 },
  { mood: "blast", pct: -12.5 },
  { mood: "shock", pct: 2.6 },
  { mood: "alarm", pct: -4.1 },
  { mood: "sleep", pct: 0.4 },
  { mood: "offline", pct: 0 },
];

const quoteFor = (symbol: string, pct: number): Quote => {
  const prevClose = 100;
  const price = prevClose * (1 + pct / 100);
  return {
    symbol, price, prevClose, changePct: pct,
    history: [prevClose, (prevClose + price) / 2, price],
    updatedAt: Date.now(), source: "fake",
  };
};

/**
 * Preview mode: all states standing still in one row along the bottom, each tagged with its
 * state name, so they can be compared side by side. The real Tickies step aside meanwhile.
 */
export function StatePreview() {
  const toolbarRoom = 60;
  const width = Math.max(600, window.innerWidth - toolbarRoom);
  const step = width / STATES.length;
  const lines = useMemo(() => Object.fromEntries(STATES.map((s) => [s.mood, pickLine(s.mood)])), []);

  return (
    <>
      {STATES.map((s, i) => {
        const symbol = `@${s.mood}`;
        return (
          <Pet
            key={symbol}
            item={{ symbol, name: moodName(s.mood) }}
            quote={quoteFor(symbol, s.pct)}
            mood={s.mood}
            line={lines[s.mood]}
            pinX={Math.round(i * step)}
          />
        );
      })}
    </>
  );
}
