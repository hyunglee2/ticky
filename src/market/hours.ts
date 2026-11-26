// Is the stock's home market open right now? KRX 09:00–15:30 KST, US 09:30–16:00 ET, weekdays.
// US market holidays (NYSE full closes) are handled; Korean holidays not yet.
import { isKrx } from "./types";

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function isMarketOpen(symbol: string, now = new Date()) {
  const krx = isKrx(symbol);
  const { weekday, minutes } = localParts(now, krx ? "Asia/Seoul" : "America/New_York");
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (!krx && usHoliday(now)) return false;
  return krx ? minutes >= 540 && minutes < 930 : minutes >= 570 && minutes < 960;
}

/**
 * US 주간거래 (day market): New York 20:00–04:00, Sunday night to Friday morning — daytime in Korea.
 * Yahoo has nothing in these hours; with a KIS app key the feed switches to KIS.
 * It belongs to the next day's trading, so there's none the night before a holiday.
 */
export function isUsDayMarket(now = new Date()) {
  const { weekday, minutes } = localParts(now, "America/New_York");
  const evening = minutes >= 20 * 60 && ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(weekday);
  const early = minutes < 4 * 60 && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  return (evening || early) && !usHoliday(now);
}

/**
 * The US market holiday now falls in, by name (or null): the whole trading day it closes, from the
 * day market the evening before (New York 20:00, 10:00 in Korea) to the end of after-hours (20:00).
 */
export function usHoliday(now = new Date()): string | null {
  const { date } = localParts(new Date(now.getTime() + 4 * 3600_000), "America/New_York");
  const year = Number(date.slice(0, 4));
  return nyseHolidays(year).get(date) ?? null;
}

const cache = new Map<number, Map<string, string>>();

/** NYSE full-day closes in a year, "YYYY-MM-DD" → name (by the exchange's own rules). */
function nyseHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const out = new Map<string, string>();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const day = (m: number, d: number) => new Date(Date.UTC(year, m - 1, d));
  /** the n-th given weekday (0 = Sun) of a month; n = -1 for the last one */
  const nth = (m: number, wd: number, n: number) => {
    if (n > 0) {
      const first = day(m, 1);
      return day(m, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
    }
    const last = day(m + 1, 0);
    return day(m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
  };
  /** a fixed date: on a Saturday it's kept the Friday before, on a Sunday the Monday after */
  const observed = (m: number, d: number) => {
    const t = day(m, d);
    const wd = t.getUTCDay();
    return wd === 6 ? day(m, d - 1) : wd === 0 ? day(m, d + 1) : t;
  };
  // New Year's Day on a Saturday isn't moved back into the old year
  if (day(1, 1).getUTCDay() !== 6) out.set(key(observed(1, 1)), "새해 첫날");
  out.set(key(nth(1, 1, 3)), "마틴 루터 킹 데이");
  out.set(key(nth(2, 1, 3)), "대통령의 날");
  out.set(key(goodFriday(year)), "성금요일");
  out.set(key(nth(5, 1, -1)), "메모리얼 데이");
  if (year >= 2022) out.set(key(observed(6, 19)), "준틴스");
  out.set(key(observed(7, 4)), "독립기념일");
  out.set(key(nth(9, 1, 1)), "노동절");
  out.set(key(nth(11, 4, 4)), "추수감사절");
  out.set(key(observed(12, 25)), "크리스마스");
  cache.set(year, out);
  return out;
}

/** Easter Sunday (Gregorian, anonymous algorithm) minus two days */
function goodFriday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dayOf = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, dayOf - 2));
}
