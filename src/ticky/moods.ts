// Mood engine: today's % change → one of 9 market moods, plus special states.
export type MoodKey =
  | "boom" | "cheer" | "happy" | "good" | "calm" | "sulky" | "sad" | "melt" | "blast"
  | "sleep" | "shock" | "offline" | "alarm";

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
  if (mood === "offline") return "연결 끊김";
  if (mood === "alarm") return "비상";
  return BANDS.find((b) => b.mood === mood)?.name ?? "";
}

export function moodTone(mood: MoodKey, pct: number): Tone {
  if (mood === "sleep" || mood === "offline") return "flat";
  if (mood === "shock" || mood === "alarm") return toneFor(pct);
  return BANDS.find((b) => b.mood === mood)?.tone ?? "flat";
}

// 대사 콘셉트: 주식하는 사람의 속마음을 대신 말하는 무심한 캔들. 반말, 투자 권유처럼 들리는 말은 쓰지 않는다.
const LINES: Record<MoodKey, string[]> = {
  boom:  ["간다간다간다", "이게 맞아?", "미쳐따", "어디까지 가", "오늘 무슨 날임?"],
  cheer: ["오늘 내가 주인공", "오늘 한 번 보여주나?", "심상치 않은데", "폼 미쳤다", "드디어 가는구나", "이걸 가네"],
  happy: ["오늘 좀 되는데", "후후", "슬슬 시동 거나?", "느좋", "가즈아", "야르릉"],
  good:  ["나쁘지 않네", "오늘 좀 가나?", "오?", "굿"],
  calm:  ["...", "흠", "오늘도 제자리", "움직여 봐", "숨은 쉬니?", "노잼"],
  sulky: ["하...", "ㄱㅊㄱㅊ", "왜 이래", "오늘은 아닌가", "또 시작이네", "엥..."],
  sad:   ["왜 나만", "살려줘", "이게 맞아?", "적당히 좀", "에휴"],
  melt:  ["흐어엉", "제발 그만", "바닥이 어디야", "하 진짜", "1주석...", "이건 좀"],
  blast: ["펑.", "ㅋㅋㅋㅋㅋ", "나 먼저 간다", "이게 주식이야?", "환불해줘;;"],
  shock: ["엥", "뭐야 뭐야", "잠깐만", "갑자기?"],
  sleep: ["장 끝. 퇴근.", "내일 보자", "zzz"],
  offline: ["연결 끊김", "뭐지?", "시세 안 뜸", "응답 없음"],
  // only when the reason is unknown; normally ALARM_LINES says what happened
  alarm: ["비상! 비상!", "삐뽀삐뽀!"],
};

export function moodLines(mood: MoodKey): string[] {
  return LINES[mood];
}

/** A random line from the list, never the one just said (when there's a choice). */
export function pickFrom(list: string[], avoid?: string): string {
  const pool = list.length > 1 && avoid ? list.filter((l) => l !== avoid) : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickLine(mood: MoodKey, avoid?: string): string {
  return pickFrom(LINES[mood], avoid);
}

/** What set off 비상. Each reason has its own first line and a follow-up. */
export type AlarmReason = "target" | "stop" | "jumpUp" | "jumpDown" | "boom" | "blast";

export const ALARM_LINES: Record<AlarmReason, [string, string]> = {
  target:   ["목표가 찍었다!", "드디어!!"],
  stop:     ["손절가 도달!", "비상! 비상!"],
  jumpUp:   ["5분 만에 +3%", "뭐야 갑자기 ㅋㅋ"],
  jumpDown: ["5분 만에 -3%", "잠깐만..."],
  boom:     ["10% 돌파!", "간다간다간다"],
  blast:    ["-10% 진입!", "이건 좀 심한데"],
};
