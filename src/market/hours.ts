// Is the stock's home market open right now? KRX 09:00–15:30 KST, US 09:30–16:00 ET, weekdays.
// Holidays are not handled yet.
import { isKrx } from "./types";

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isMarketOpen(symbol: string, now = new Date()) {
  const krx = isKrx(symbol);
  const { weekday, minutes } = localParts(now, krx ? "Asia/Seoul" : "America/New_York");
  if (weekday === "Sat" || weekday === "Sun") return false;
  return krx ? minutes >= 540 && minutes < 930 : minutes >= 570 && minutes < 960;
}
