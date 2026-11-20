// Ticky artwork as SVG markup, ported from design/character-lab.html with the chosen combo:
// solid eyelids, black capsule feet, sleep = lids down + drool, happy = smug side-eye.
// Output is static markup built only from constants in this file (no user text goes in).
import type { MoodKey, Tone } from "./moods";

const INK = "#1f1f1f";
const TEAR = "#8cc4ff";

const toneVar = (tone: Tone) => `var(--${tone})`;
const lidVar = (tone: Tone) => `var(--${tone}-lid)`;

type EyeKind = "up" | "look" | "lid" | "heavy" | "smug" | "daze" | "lidclosed" | "blank";
type MouthKind = "open" | "smile" | "wobble" | "tiny" | "flat" | "smirk" | "drool" | "puff";
type WickKind = "perky" | "calm" | "droop" | "frizz";
type Anim = "hop" | "bob" | "idle" | "sway" | "melt" | "shake";

interface Look {
  h: number; // body length: bigger move, longer candle (0 = melted puddle)
  eye: EyeKind;
  mouth: MouthKind;
  wick: WickKind;
  anim: Anim;
}

const LOOKS: Record<MoodKey, Look> = {
  boom:  { h: 100, eye: "up",        mouth: "open",   wick: "perky", anim: "shake" },
  cheer: { h: 92,  eye: "up",        mouth: "open",   wick: "perky", anim: "hop" },
  happy: { h: 80,  eye: "smug",      mouth: "smirk",  wick: "perky", anim: "bob" },
  good:  { h: 72,  eye: "look",      mouth: "smile",  wick: "calm",  anim: "idle" },
  calm:  { h: 66,  eye: "look",      mouth: "flat",   wick: "calm",  anim: "idle" },
  sulky: { h: 74,  eye: "lid",       mouth: "tiny",   wick: "droop", anim: "idle" },
  sad:   { h: 82,  eye: "heavy",     mouth: "wobble", wick: "droop", anim: "sway" },
  melt:  { h: 0,   eye: "heavy",     mouth: "wobble", wick: "droop", anim: "melt" },
  blast: { h: 70,  eye: "daze",      mouth: "puff",   wick: "frizz", anim: "idle" },
  sleep: { h: 66,  eye: "lidclosed", mouth: "drool",  wick: "droop", anim: "idle" },
  shock: { h: 80,  eye: "up",        mouth: "open",   wick: "perky", anim: "bob" },
  offline: { h: 66, eye: "blank",    mouth: "flat",   wick: "droop", anim: "idle" },
};

// the part of the eye oval above a horizontal cut, covering `amount` (0..1) of its height
function lidShape(x: number, y: number, rx: number, ry: number, amount: number, color: string) {
  const cutY = y - ry + 2 * ry * amount;
  const t = (cutY - y) / ry;
  const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
  const large = cutY > y ? 1 : 0;
  return `<path d="M${x - dx} ${cutY} A${rx} ${ry} 0 ${large} 1 ${x + dx} ${cutY}Z" fill="${color}"/>` +
    `<path d="M${x - dx} ${cutY} L${x + dx} ${cutY}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
}

// eye shape from eyes.svg: tall white oval (2:3) with a tall oval pupil set to the right
const RX = 7.5, RY = 11.25, PRX = 3.6, PRY = 5.55, PX = 3.9;
const LID: Partial<Record<EyeKind, number>> = { lid: 1 / 3, heavy: 1 / 2, blank: 1 / 2 };

function eye(x: number, y: number, kind: EyeKind, tone: Tone) {
  if (kind === "lidclosed") {
    return `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="${lidVar(tone)}"/>` +
      `<path d="M${x - 6.5} ${y + 3} q6.5 5.5 13 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  if (kind === "daze") {
    return `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="#fff"/>` +
      `<ellipse cx="${x}" cy="${y + 1}" rx="2" ry="2.8" fill="${INK}"/>`;
  }
  if (kind === "smug") {
    return `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="#fff"/>` +
      `<ellipse cx="${x + PX}" cy="${y + 1.5}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>` +
      lidShape(x, y, RX, RY, 0.55, lidVar(tone));
  }
  const py = kind === "up" ? -3.7 : kind === "heavy" ? 1.1 : -0.5;
  const px = kind === "blank" ? 0 : PX; // blank stare looks straight ahead
  const s = `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="#fff"/>` +
    `<ellipse cx="${x + px}" cy="${y + py}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>`;
  const amount = LID[kind];
  return amount ? s + lidShape(x, y, RX, RY, amount, lidVar(tone)) : s;
}

function mouth(x: number, y: number, kind: MouthKind) {
  const line = (d: string, w = 2.6) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
  switch (kind) {
    case "open":   return `<ellipse cx="${x}" cy="${y + 1}" rx="4.2" ry="4.8" fill="${INK}"/>`;
    case "smile":  return line(`M${x - 4} ${y} q4 4 8 0`);
    case "wobble": return line(`M${x - 6} ${y + 1} q1.5 -3 3 0 t3 0 t3 0 t3 0`, 2.4);
    case "tiny":   return line(`M${x - 2.5} ${y} h5`);
    case "smirk":  return line(`M${x - 4} ${y + 1} q5 2.5 9 -3`);
    case "drool":  return line(`M${x - 4} ${y} h7`) +
      `<path d="M${x + 2} ${y + 1} v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    case "puff":   return `<ellipse cx="${x}" cy="${y + 1}" rx="2.6" ry="3" fill="${INK}"/>` +
      `<circle class="puff" cx="${x + 8}" cy="${y - 1}" r="3.2" fill="#a3a8b0"/>`;
    default:       return line(`M${x - 4} ${y} h8`);
  }
}

// wick = the candle's upper shadow, worn like a single hair
function wick(x: number, top: number, kind: WickKind) {
  const d = {
    perky: `M${x} ${top + 2} q-3 -12 3 -20`,
    calm:  `M${x} ${top + 2} q-1 -8 2 -13`,
    droop: `M${x} ${top + 2} q1 -9 10 -8`,
    frizz: `M${x} ${top + 2} l-3 -4 l5 -3 l-5 -4 l5 -3 l-3 -4`,
  }[kind];
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
}

const sparkle = (x: number, y: number, a: number) =>
  `<path d="M${x} ${y} l${a} ${a * 2.8} l${a * 2.8} ${a} l${-a * 2.8} ${a} l${-a} ${a * 2.8} l${-a} ${-a * 2.8} l${-a * 2.8} ${-a} l${a * 2.8} ${-a}z" fill="${INK}"/>`;

function extras(mood: MoodKey, top: number, h: number) {
  const cx = 60;
  switch (mood) {
    case "boom": {
      // lit fuse: a crackling spark at the tip of the wick
      const sx = 63, sy = top - 18;
      return `<g class="spark">` +
        `<path d="M${sx} ${sy - 9} v5 M${sx} ${sy + 4} v5 M${sx - 9} ${sy} h5 M${sx + 4} ${sy} h5 M${sx - 6} ${sy - 6} l3 3 M${sx + 3} ${sy + 3} l3 3 M${sx + 6} ${sy - 6} l-3 3 M${sx - 3} ${sy + 3} l-3 3" stroke="#ff8a00" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="${sx}" cy="${sy}" r="4" fill="#ffb21a"/><circle cx="${sx}" cy="${sy}" r="1.8" fill="#fff4b8"/></g>`;
    }
    case "blast":
      // soot smudges + smoke rising from the burnt wick
      return `<ellipse cx="${cx - 17}" cy="${top + 13}" rx="9" ry="6" fill="${INK}" fill-opacity=".28"/>` +
        `<ellipse cx="${cx + 20}" cy="${top + 40}" rx="7" ry="5" fill="${INK}" fill-opacity=".28"/>` +
        `<ellipse cx="${cx - 8}" cy="${top + h - 12}" rx="10" ry="5" fill="${INK}" fill-opacity=".22"/>` +
        `<circle class="puff" cx="${cx + 4}" cy="${top - 24}" r="4.5" fill="#a3a8b0"/>` +
        `<circle class="puff p2" cx="${cx + 10}" cy="${top - 32}" r="6" fill="#a3a8b0"/>` +
        `<circle class="puff p3" cx="${cx + 2}" cy="${top - 40}" r="7" fill="#a3a8b0"/>`;
    case "cheer":
      return sparkle(98, top + 4, 2.5) + sparkle(20, top + 26, 1.6);
    case "shock":
      return `<path d="M98 ${top + 2} v14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
        `<circle cx="98" cy="${top + 24}" r="2.4" fill="${INK}"/>`;
    case "offline":
      return `<path d="M92 ${top - 4} q0 -8 7 -8 q7 0 7 7 q0 5 -7 7 v4" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="99" cy="${top + 14}" r="2" fill="${INK}"/>`;
    case "sleep":
      return `<text x="84" y="${top - 2}" font-family="Gaegu" font-weight="700" font-size="20" fill="${INK}">z</text>` +
        `<text x="96" y="${top - 14}" font-family="Gaegu" font-weight="700" font-size="15" fill="${INK}">z</text>`;
    default:
      return "";
  }
}

const TEAR_AT = (x: number, y: number) => `<path d="M${x} ${y} q-2.5 6 0 9 q2.5 -3 0 -9z" fill="${TEAR}"/>`;

function body(mood: MoodKey, look: Look, tone: Tone) {
  const fill = toneVar(tone);
  const cx = 60, ground = 132, w = 64;
  if (mood === "melt") {
    // a candle melted into a puddle, a drip on the side
    const top = 86, ey = top + 18;
    const shape =
      `M${cx - 30} ${ground - 4}C${cx - 30} ${top + 6} ${cx - 22} ${top} ${cx} ${top}` +
      `C${cx + 22} ${top} ${cx + 30} ${top + 6} ${cx + 30} ${ground - 14}` +
      `C${cx + 31} ${ground - 6} ${cx + 44} ${ground - 6} ${cx + 48} ${ground - 1}` +
      `C${cx + 50} ${ground + 3} ${cx + 40} ${ground + 4} ${cx + 20} ${ground + 4}` +
      `L${cx - 26} ${ground + 4}C${cx - 48} ${ground + 4} ${cx - 52} ${ground} ${cx - 44} ${ground - 3}` +
      `C${cx - 38} ${ground - 5} ${cx - 30} ${ground - 2} ${cx - 30} ${ground - 4}Z`;
    return {
      top,
      art: `<path d="${shape}" fill="${fill}"/>` +
        `<path d="M${cx + 30} ${top + 18} q3 8 0 13 q-3 -5 0 -13z" fill="${fill}"/>` +
        eye(cx - 7.5, ey, look.eye, tone) + eye(cx + 7.5, ey, look.eye, tone) +
        TEAR_AT(cx - 10.5, ey + 9) +
        mouth(cx, ey + 15, look.mouth),
    };
  }
  const h = look.h, top = ground - 10 - h, ey = top + Math.min(30, h * 0.38);
  return {
    top,
    art:
      // black capsule feet = the lower shadow
      `<rect x="${cx - 16}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${INK}"/>` +
      `<rect x="${cx + 5}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${INK}"/>` +
      `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="22" fill="${fill}"/>` +
      eye(cx - 7.5, ey, look.eye, tone) + eye(cx + 7.5, ey, look.eye, tone) +
      (mood === "sad" ? TEAR_AT(cx - 10.5, ey + 10) : "") +
      mouth(cx, ey + 16, look.mouth),
  };
}

/**
 * Full SVG markup for one Ticky. Pass `filterId` to apply the hand-drawn boil wobble;
 * it is off by default because WebView2 rasterises SVG filters at 1x, which makes edges jagged.
 */
export function tickySvg(mood: MoodKey, tone: Tone, label: string, filterId?: string) {
  const look = LOOKS[mood];
  const b = body(mood, look, tone);
  const wide = mood === "melt";
  return `<svg viewBox="0 0 120 140" role="img" aria-label="${label}" overflow="visible">` +
    `<ellipse cx="60" cy="134" rx="${wide ? 50 : 30}" ry="4" fill="rgba(0,0,0,.10)"/>` +
    `<g class="${look.anim}"${mood === "offline" ? ' opacity="0.5"' : ""}><g${filterId ? ` filter="url(#${filterId})"` : ""}>` +
    (wide ? "" : wick(60, b.top, look.wick)) +
    b.art + extras(mood, b.top, look.h) +
    `</g></g></svg>`;
}
