// Mood engine: today's % change → one of 9 market moods, plus special states.
export type MoodKey =
  | "boom" | "cheer" | "happy" | "good" | "calm" | "sulky" | "sad" | "melt" | "blast"
  | "sleep" | "shock";

export type Tone = "up" | "down" | "flat";

interface Band { mood: MoodKey; lo: number; hi: number; tone: Tone; name: string }

// lo inclusive, hi exclusive, in %
const BANDS: Band[] = [
  { mood: "boom",  lo: 10,        hi: Infinity, tone: "up",   name: "폭등" },
  { mood: "cheer", lo: 5,         hi: 10,       tone: "up",   name: "환호" },
  { mood: "happy", lo: 2,         hi: 5,        tone: "up",   name: "신남" },
  { mood: "good",  lo: 0.5,       hi: 2,        tone: "up",   name: "기분 좋음" },
  { mood: "calm",  lo: -0.5,      hi: 0.5,      tone: "flat", name: "평온" },
  { mood: "sulky", lo: -2,        hi: -0.5,     tone: "down", name: "시무룩" },
  { mood: "sad",   lo: -5,        hi: -2,       tone: "down", name: "울상" },
  { mood: "melt",  lo: -10,       hi: -5,       tone: "down", name: "대성통곡" },
  { mood: "blast", lo: -Infinity, hi: -10,      tone: "down", name: "폭락" },
];

/** How far past a band edge the change must go before the mood switches (stops flicker at edges). */
export const HYSTERESIS = 0.15;

export function bandMood(pct: number, prev?: MoodKey): MoodKey {
  const kept = BANDS.find((b) => b.mood === prev);
  if (kept && pct >= kept.lo - HYSTERESIS && pct < kept.hi + HYSTERESIS) return kept.mood;
  return (BANDS.find((b) => pct >= b.lo && pct < b.hi) ?? BANDS[4]).mood;
}

export function toneFor(pct: number): Tone {
  return pct >= 0.5 ? "up" : pct <= -0.5 ? "down" : "flat";
}

export function moodName(mood: MoodKey): string {
  if (mood === "sleep") return "잠";
  if (mood === "shock") return "놀람";
  return BANDS.find((b) => b.mood === mood)?.name ?? "";
}

export function moodTone(mood: MoodKey, pct: number): Tone {
  if (mood === "sleep") return "flat";
  if (mood === "shock") return toneFor(pct);
  return BANDS.find((b) => b.mood === mood)?.tone ?? "flat";
}

// deadpan one-liners, one picked each time the mood changes
const LINES: Record<MoodKey, string[]> = {
  boom:  ["간다간다간다", "상한가 가즈아"],
  cheer: ["익절각?", "오늘 내가 주인공"],
  happy: ["오늘 좀 되는데", "후후"],
  good:  ["나쁘지 않네", "슬슬 오르나"],
  calm:  ["...", "잔잔하다"],
  sulky: ["존버 중", "괜찮아 괜찮아"],
  sad:   ["물타기 할까", "왜 나만"],
  melt:  ["계좌가 녹는다", "흐어엉"],
  blast: ["펑.", "..."],
  sleep: ["장 끝. 퇴근.", "내일 보자"],
  shock: ["어?!", "뭐야 뭐야"],
};

export function pickLine(mood: MoodKey): string {
  const list = LINES[mood];
  return list[Math.floor(Math.random() * list.length)];
}
