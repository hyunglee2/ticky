// Chart flow: where the price came from, not just today's %. The same +3% can be climbing,
// speeding up, giving back gains, bouncing back or resting — each gets its own lines.
// Judged only from earlier prices in the history (polls since launch, the last ~15–40 minutes).

export type Trend =
  | "turnUp" | "turnDown" | "rebound" | "givingBack"
  | "riseFaster" | "fallFaster" | "riseStart" | "fallEasing" | "riseHolding" | "resting";

export const TREND_LINES: Record<Trend, string[]> = {
  riseStart:   ["오늘 한 번 보여주나?", "오?", "슬슬 가보자", "뭔가 온다"],
  riseFaster:  ["갑자기 뭐야 ㅋㅋ", "속도 미쳤다", "제대로 가네", "시동 걸렸다"],
  riseHolding: ["잘 버티네", "이대로만", "오늘 좀 치네", "굿굿"],
  givingBack:  ["아까 좋았잖아", "역시나", "또 이러네"],
  rebound:     ["살아났다", "오 다시 올라온다", "이걸 말아 올리네", "반등 성공?"],
  fallFaster:  ["적당히 좀", "끝이 없네", "아 진짜", "또 빠진다"],
  fallEasing:  ["이제 좀 멈췄네", "진정 좀 하자", "제발 여기까지", "휴..."],
  resting:     ["지루하다", "움직일 생각 없음?", "여기서 쉬어 가나", "노잼"],
  turnUp:      ["양전!", "드디어 빨간불", "돌아왔다", "이걸 올리네"],
  turnDown:    ["음전...", "우리 좋았잖아", "결국 파란불", "하..."],
};

/**
 * @param history  prices, oldest first
 * @param prevClose  yesterday's close (the base for %)
 * @param window  how many points back to compare against (about 10 minutes)
 */
export function detectTrend(history: number[], prevClose: number, window: number): Trend | null {
  if (history.length <= window || prevClose <= 0 || window < 2) return null;
  const pct = history.map((p) => (p / prevClose - 1) * 100);
  const at = (back: number) => pct[pct.length - 1 - back];
  const now = at(0);
  const mid = at(Math.floor(window / 2)); // ~5 minutes ago
  const past = at(window);                // ~10 minutes ago
  const early = mid - past;               // change over the earlier half
  const late = now - mid;                 // change over the recent half
  const recent = pct.slice(-window - 1);
  const high = Math.max(...pct);
  const low = Math.min(...pct);

  // crossed yesterday's close within the window
  if (past < 0 && now > 0) return "turnUp";
  if (past > 0 && now < 0) return "turnDown";
  // came back 2%p or more off a low of −2% or worse, still climbing
  if (low <= -2 && now - low >= 2 && now > past) return "rebound";
  // was +3% or more, has handed back 2%p or more and is still sliding
  if (high >= 3 && high - now >= 2 && now < past) return "givingBack";
  // the recent half moved a full point, clearly faster than the half before
  if (late >= 1 && late > early + 0.5) return "riseFaster";
  if (late <= -1 && late < early - 0.5) return "fallFaster";
  // flat, then starting to climb
  if (Math.abs(early) < 0.3 && late >= 0.5) return "riseStart";
  // was falling, now has stopped
  if (early <= -1 && Math.abs(late) < 0.3) return "fallEasing";
  // climbing steadily through both halves
  if (early >= 0.3 && late >= 0.3) return "riseHolding";
  // parked away from yesterday's close: barely moved over the window
  if (Math.abs(now) >= 0.5 && Math.max(...recent) - Math.min(...recent) < 0.3) return "resting";
  return null;
}
