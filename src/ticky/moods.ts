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
export type AlarmReason = "jumpUp" | "jumpDown" | "boom" | "blast";

export const ALARM_LINES: Record<AlarmReason, [string, string]> = {
  jumpUp:   ["5분 만에 +3%", "뭐야 갑자기 ㅋㅋ"],
  jumpDown: ["5분 만에 -3%", "잠깐만..."],
  boom:     ["10% 돌파!", "간다간다간다"],
  blast:    ["-10% 진입!", "이건 좀 심한데"],
};

/**
 * Lines for being handled: picked up, thrown, poked, or bumping into another Ticky.
 * Each pool goes with one face (Pet.tsx reaction()), so what it says matches how it looks.
 */
export const REACT_LINES = {
  grab:     ["으앗", "내려줘!", "높다...", "흔들지 마", "놔줘!", "무서워", "나 고소공포증 있음", "괴롭히지 마", "이게 뭐야"], // startled
  grabHappy: ["우와 높다!", "어디 데려가?", "히히", "나 들렸어!"],                                                       // pleased
  fun:   ["히히 재밌당", "또 또!", "한 번 더!", "꺄르르", "재밌다", "놀이기구 같아", "또 해 줘"],
  land:  ["휴", "착지 성공", "됐다", "살았다", "무사 착지", "10점 만점에 10점"],
  huff:  ["흥!", "다시는 그러지 마", "나 화났어", "함부로 옮기지 마", "왜 맘대로 옮겨"],
  shy:   ["헤헤", "부끄럽게 왜 그래", "나 무거웠지?", "어머"],
  crash: ["어지러워...", "아야", "살살 좀;;", "별이 보여", "괴롭히지 마...", "나한테 왜 그래", "머리 아파"],
  poke: {
    up:   ["히히", "간지러워", "왜~", "기분 좋아", "뭐야 ㅋㅋ", "또 찔러 봐"],
    down: ["건드리지 마...", "지금 그럴 기분 아님", "하...", "괴롭히지 마", "나 지금 예민해", "저리 가"],
    flat: ["응?", "왜?", "뭐", "...", "불렀어?", "심심해?"],
  },
  leave:  ["퇴근!", "수고하셨습니다~", "내일 봐!", "칼퇴 간다", "먼저 들어갈게요"],
  arrive: ["티키 등장!", "짠!", "나 왔어~", "출근!", "좋은 아침~", "오늘도 힘내자", "출근 완료", "왔다!"],
  pokeSleep:   ["5분만...", "zzz..", "깨우지 마", "음냐.."],
  pokeOffline: ["나 지금 연결 안 됨", "...", "지금 아무것도 안 보여"],
  angry: ["그만 찔러", "아 왜!!", "화났어", "진짜 그만", "괴롭히지 마!", "신고할 거야", "손가락 치워"],
  // meeting another Ticky: [my tone][their tone]; anyone flat just says hi
  meet: {
    upUp:     ["하이파이브!", "오늘 우리 좋다", "너도 올랐네?"],
    upDown:   ["괜찮아?", "힘내", "토닥토닥"],
    downUp:   ["부럽다...", "좋겠다", "나도 데려가"],
    downDown: ["우리 왜 이래", "같이 버티자", "너도냐..."],
    hi:       ["안녕", "뭐 해?", "ㅎㅇ"],
  },
};
