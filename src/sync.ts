// The Tickies' window and the settings window are two separate webviews. They talk through
// Tauri events (which reach every window of the app):
//   main → settings   "ticky:snapshot"   live prices, moods, connection status and settings
//   settings → main   "ticky:set"        change one setting (main applies it and saves it)
//   either way        "ticky:watchlist"  the watchlist changed (payload: the whole list)
//   settings → main   "ticky:hello"      just opened: please send a snapshot now
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { inTauri } from "./clickThrough";
import type { FeedStatus, Quote } from "./market/types";
import type { MoodKey } from "./ticky/moods";
import type { WatchEntry } from "./watchlist";

export type Layout = "roam" | "prices";

export interface Settings {
  layout: Layout;
  scale: number;
  followHours: boolean;
  wakeExtended: boolean;
  /** step aside (hide) while a full-screen app is in front */
  hideFullscreen: boolean;
  /** the monitor the Tickies live on (its system name); "" = the primary one */
  monitor: string;
  preview: boolean;
}

export interface Snapshot extends Settings {
  quotes: Record<string, Quote>;
  moods: Record<string, MoodKey>;
  status: FeedStatus;
}

export type SetMessage = { [K in keyof Settings]: { key: K; value: Settings[K] } }[keyof Settings];

export const EV = {
  snapshot: "ticky:snapshot",
  set: "ticky:set",
  watchlist: "ticky:watchlist",
  hello: "ticky:hello",
  teaseDone: "ticky:tease-done",     // tease → main: { symbol, hits } just before it closes
  teaseClosed: "ticky:tease-closed", // Rust → main: the tease window is gone
} as const;

/** Send to every window (no-op in the browser preview). */
export function send<T>(event: string, payload?: T) {
  if (inTauri()) emit(event, payload).catch(() => {});
}

/** Listen across windows; returns a cleanup for useEffect. */
export function on<T>(event: string, handler: (payload: T) => void): () => void {
  if (!inTauri()) return () => {};
  let off: UnlistenFn | undefined;
  let gone = false;
  listen<T>(event, (e) => handler(e.payload)).then((u) => { if (gone) u(); else off = u; }).catch(() => {});
  return () => { gone = true; off?.(); };
}

export type { WatchEntry };
