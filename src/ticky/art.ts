// Ticky artwork as SVG markup, ported from design/character-lab.html with the chosen combo:
// solid eyelids, black capsule feet, sleep = lids down + drool, happy = smug side-eye.
// Output is static markup built only from constants in this file (no user text goes in).
import type { MoodKey, Tone } from "./moods";
import { drawBody, drawFace, drawHead, drawNeck, headReach, hidesEyes, hidesWick, wickLift, type Outfit } from "./outfit";

const INK = "#1f1f1f";
const TEAR = "#8cc4ff";

const toneVar = (tone: Tone) => `var(--${tone})`;
const lidVar = (tone: Tone) => `var(--${tone}-lid)`;

type EyeKind = "up" | "look" | "lid" | "heavy" | "smug" | "daze" | "lidclosed" | "blank"
  | "wide" | "squeeze" | "spiral" | "angry" | "happy" | "bashful" | "confused";
type MouthKind = "open" | "smile" | "wobble" | "tiny" | "flat" | "smirk" | "drool" | "puff"
  | "scream" | "grit" | "grin" | "pout" | "cat" | "laugh" | "shout" | "slant" | "fluster";
type WickKind = "perky" | "calm" | "droop" | "frizz" | "none";
type Anim = "hop" | "bob" | "idle" | "sway" | "melt" | "shake";

/** A short-lived face for being handled; replaces the mood's eyes, mouth and props for a moment. */
export type Face = "grab" | "fly" | "flyJoy" | "flyPanic" | "dizzy" | "wince" | "sulk" | "angry" | "happy" | "relief" | "shy"
  | "ouch" | "beg" | "smug" | "stretch";

const FACES: Record<Face, { eye: EyeKind; mouth: MouthKind; wick?: WickKind }> = {
  grab:   { eye: "wide",    mouth: "open",   wick: "perky" }, // picked up: startled, sweating
  // thrown: one of three, picked at random for each throw
  fly:      { eye: "wide",     mouth: "scream", wick: "perky" }, // scared: tiny pupils, screaming
  flyJoy:   { eye: "up",       mouth: "laugh",  wick: "perky" }, // loving it: wheee
  flyPanic: { eye: "confused", mouth: "shout",  wick: "frizz" }, // flailing: eyes all over the place
  dizzy:  { eye: "spiral",  mouth: "wobble", wick: "frizz" }, // hard landing: spinning eyes, stars
  wince:  { eye: "confused", mouth: "slant" },                // poked: "huh?" — eyes askew, crooked mouth
  sulk:   { eye: "lid",     mouth: "pout",   wick: "droop" }, // poked on a down day: grumpy, heavy lids
  angry:  { eye: "angry",   mouth: "shout" },                 // cross: lids slanting in, small open grumble
  // eyes stay whole (round whites + pupils): smiles live in the mouth, moods in the top lids
  happy:  { eye: "up",      mouth: "laugh",  wick: "perky" }, // had fun / met a friend: big open laugh
  relief: { eye: "look",    mouth: "smile" },                 // soft landing
  shy:    { eye: "bashful", mouth: "fluster" },               // embarrassed: wide eyes darting away, wobbly little mouth, pink cheeks
  // 괴롭히기
  ouch:    { eye: "wide",  mouth: "grit",   wick: "frizz" }, // bonked: tiny pupils, teeth clenched
  beg:     { eye: "heavy", mouth: "wobble", wick: "droop" }, // crying, begging: heavy lids, tears
  smug:    { eye: "smug",  mouth: "smirk",  wick: "perky" }, // an up day: "what did I do?"
  stretch: { eye: "wide",  mouth: "scream", wick: "frizz" }, // being pulled
};

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
  // 비상: a siren on the head instead of the wick, and a megaphone
  alarm: { h: 84,  eye: "up",        mouth: "open",   wick: "none",  anim: "shake" },
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

// the part of the eye oval above a slanted line (yl at the left edge, yr at the right edge)
function slantLid(x: number, y: number, yl: number, yr: number, color: string) {
  const lineY = (px: number) => yl + ((px - (x - RX)) / (2 * RX)) * (yr - yl);
  const pts: [number, number][] = [];
  const cross: [number, number][] = [];
  const N = 48;
  let prev: [number, number] | null = null;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const p: [number, number] = [x + RX * Math.cos(a), y + RY * Math.sin(a)];
    const above = p[1] <= lineY(p[0]);
    if (prev) {
      const prevAbove = prev[1] <= lineY(prev[0]);
      if (above !== prevAbove) { // crossing: add the point where the outline meets the line
        const f = (lineY(prev[0]) - prev[1]) / ((p[1] - prev[1]) - (lineY(p[0]) - lineY(prev[0])));
        const c: [number, number] = [prev[0] + (p[0] - prev[0]) * f, prev[1] + (p[1] - prev[1]) * f];
        pts.push(c);
        cross.push(c);
      }
    }
    if (above) pts.push(p);
    prev = p;
  }
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)}`).join(" ") + "Z";
  // the lid's edge: a line between the two points where it meets the eye outline
  const [a, b] = cross.length >= 2 ? cross : [[x - RX, yl], [x + RX, yr]];
  return `<path d="${d}" fill="${color}"/>` +
    `<path d="M${a[0].toFixed(2)} ${a[1].toFixed(2)} L${b[0].toFixed(2)} ${b[1].toFixed(2)}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
}

// eye shape from eyes.svg: tall white oval (2:3) with a tall oval pupil set to the right
const RX = 7.5, RY = 11.25, PRX = 3.6, PRY = 5.55, PX = 3.9;
const LID: Partial<Record<EyeKind, number>> = { lid: 1 / 3, heavy: 1 / 2, blank: 1 / 2 };

function eye(x: number, y: number, kind: EyeKind, tone: Tone) {
  const left = x < 60;
  const ink = (d: string, w = 2.6) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const white = `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="#fff"/>`;
  switch (kind) {
    case "wide": // tiny pupils in big whites
      return white + `<ellipse cx="${x}" cy="${y - 1}" rx="2.3" ry="3.2" fill="${INK}"/>`;
    case "squeeze": // > <
      return left ? ink(`M${x - 5} ${y - 6} L${x + 4} ${y} L${x - 5} ${y + 6}`, 3)
        : ink(`M${x + 5} ${y - 6} L${x - 4} ${y} L${x + 5} ${y + 6}`, 3);
    case "spiral":
      return white + ink(`M${x} ${y} a1.6 1.6 0 1 1 1.6 1.6 a3.4 3.4 0 1 1 -3.4 -3.4 a5.4 5.4 0 1 1 5.4 5.4`, 1.8);
    case "angry": { // whole round eye, the top lid cut on a slant down toward the middle
      const outer = y - RY * 0.55, inner = y - RY * 0.05; // lid edge height at the outer / inner side
      return white + `<ellipse cx="${x + (left ? 1.2 : -1.2)}" cy="${y + 2.5}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>` +
        slantLid(x, y, left ? outer : inner, left ? inner : outer, lidVar(tone));
    }
    case "confused": // pupils wandering different ways
      return white + (left
        ? `<ellipse cx="${x - 2.5}" cy="${y - 3.5}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>`
        : `<ellipse cx="${x + 3}" cy="${y + 2.5}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>`);
    case "bashful": // whole round eyes darting off to the side (no lids)
      return white + `<ellipse cx="${x - PX}" cy="${y - 1.5}" rx="${PRX}" ry="${PRY}" fill="${INK}"/>`;
    case "happy": // ^ ^
      return ink(`M${x - 6} ${y + 2} q6 -10 12 0`, 3);
  }
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
    case "scream": return `<ellipse cx="${x}" cy="${y + 3}" rx="5.4" ry="7" fill="${INK}"/>` +
      `<ellipse cx="${x}" cy="${y + 7.5}" rx="3" ry="2" fill="#ff8a95"/>`;
    case "grit":   return `<rect x="${x - 6}" y="${y - 2}" width="12" height="6" rx="2" fill="#fff" stroke="${INK}" stroke-width="2.2"/>` +
      line(`M${x - 2} ${y - 2} v6 M${x + 2} ${y - 2} v6`, 1.6);
    case "laugh":  return `<path d="M${x - 7} ${y - 2} q7 13 14 0 z" fill="${INK}"/>` +
      `<path d="M${x - 3.5} ${y + 4.2} q3.5 -2.6 7 0 q-3.5 2.2 -7 0z" fill="#ff8a95"/>`;
    case "shout":  return `<path d="M${x - 4.5} ${y + 4} q0 -6 4.5 -6 q4.5 0 4.5 6 q-4.5 -1.6 -9 0z" fill="${INK}"/>`;
    case "slant":  return line(`M${x - 4.5} ${y - 1} L${x + 4.5} ${y + 2}`);
    case "fluster": return line(`M${x - 4} ${y + 1} q1 -2 2 0 t2 0 t2 0 t2 0`, 2.2);
    case "cat":    return line(`M${x - 5} ${y} q2.5 3.5 5 0 q2.5 3.5 5 0`, 2.4); // ω
    case "pout":   return line(`M${x - 4} ${y + 3} q4 -4 8 0`);
    case "grin":   return `<path d="M${x - 6} ${y - 1} q6 10 12 0 z" fill="${INK}"/>`;
    case "puff":   return `<ellipse cx="${x}" cy="${y + 1}" rx="2.6" ry="3" fill="${INK}"/>` +
      `<circle class="puff" cx="${x + 8}" cy="${y - 1}" r="3.2" fill="#a3a8b0"/>`;
    default:       return line(`M${x - 4} ${y} h8`);
  }
}

// wick = the candle's upper shadow, worn like a single hair
function wick(x: number, top: number, kind: WickKind) {
  if (kind === "none") return "";
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
    case "alarm": {
      // siren: a red dome on a dark base, with two light beams that flash in turn
      const sirenTop = top - 4;
      const siren =
        `<path class="beam beam-l" d="M52 ${sirenTop - 6} L34 ${sirenTop - 15} L34 ${sirenTop + 2} Z" fill="#ff5a64" fill-opacity=".45"/>` +
        `<path class="beam beam-r" d="M68 ${sirenTop - 6} L86 ${sirenTop - 15} L86 ${sirenTop + 2} Z" fill="#ff5a64" fill-opacity=".45"/>` +
        `<rect x="49" y="${sirenTop}" width="22" height="5" rx="2" fill="#4a4a4a"/>` +
        `<path d="M51 ${sirenTop} a9 10 0 0 1 18 0 z" fill="#f04452"/>` +
        `<ellipse cx="56.5" cy="${sirenTop - 5}" rx="2" ry="3" fill="#fff" fill-opacity=".7"/>`;
      // megaphone held on the side it's facing, with sound waves
      const my = top + 84 * 0.58;
      const megaphone =
        `<rect x="88" y="${my + 2}" width="4" height="8" rx="1.5" fill="${INK}"/>` +
        `<path d="M86 ${my - 3} L104 ${my - 10} L104 ${my + 10} L86 ${my + 3} Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M100 ${my - 8.5} L104 ${my - 10} L104 ${my + 10} L100 ${my + 8.5} Z" fill="#f04452"/>` +
        `<path class="waves" d="M108 ${my - 6} q4 6 0 12 M113 ${my - 10} q7 10 0 20" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
      return siren + megaphone;
    }
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

/** Props that go with a reaction face */
function faceExtras(face: Face, top: number) {
  switch (face) {
    case "grab": // a sweat drop
      return `<path d="M94 ${top + 6} q-4 8 0 11 q4 -3 0 -11z" fill="${TEAR}" stroke="${INK}" stroke-width="1.4"/>`;
    case "fly": case "flyJoy": case "flyPanic": // whoosh lines
      return `<path d="M14 ${top + 20} h12 M10 ${top + 32} h14 M16 ${top + 44} h9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
    case "dizzy": // stars circling the head
      return `<g class="orbit" style="transform-origin: 60px ${top - 8}px">` +
        sparkle(38, top - 10, 1.8) + sparkle(80, top - 12, 1.8) + sparkle(60, top - 20, 1.4) + `</g>`;
    case "angry": // a small anger mark + a puff of steam
      return `<path d="M92 ${top + 4} q2.5 2.5 0 5 M97 ${top + 4} q-2.5 2.5 0 5" fill="none" stroke="#e5484d" stroke-width="2" stroke-linecap="round"/>` +
        `<circle class="puff" cx="26" cy="${top - 2}" r="3.5" fill="#d5d8dc"/>`;
    case "shy": // soft pink cheeks + a little sweat drop
      return `<ellipse cx="40" cy="${top + 40}" rx="5.5" ry="3.2" fill="#ff8fa6" opacity=".7"/>` +
        `<ellipse cx="80" cy="${top + 40}" rx="5.5" ry="3.2" fill="#ff8fa6" opacity=".7"/>` +
        `<path d="M94 ${top + 8} q-3.5 7 0 10 q3.5 -3 0 -10z" fill="${TEAR}" stroke="${INK}" stroke-width="1.3"/>`;
    case "ouch": // a bump on the head
      return `<path d="M48 ${top - 2} l-5 -6 M60 ${top - 5} v-7 M72 ${top - 2} l5 -6" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case "beg": // tears running down both cheeks
      return `<path class="tears" d="M48 ${top + 37} q-3 8 0 13 q3 -4 0 -13z M72 ${top + 37} q-3 8 0 13 q3 -4 0 -13z" fill="${TEAR}"/>`;
    case "stretch":
      return `<path d="M94 ${top + 6} q-4 8 0 11 q4 -3 0 -11z" fill="${TEAR}" stroke="${INK}" stroke-width="1.4"/>`;
    case "happy": // little sparkles
      return `<g class="heart">${sparkle(98, top + 6, 2.2)}</g><g class="heart h2">${sparkle(20, top + 18, 1.6)}</g>`;
    default:
      return "";
  }
}

/** what it's wearing (꾸미기): a costume, then the head, glasses over that, then the neck */
function dress(o: Outfit | undefined, top: number, ey: number, wide: boolean) {
  if (!o) return "";
  const costume = o.body && !wide;
  // a neck item goes just under the mouth, or under the mask when one covers down to there
  // (a necktie hangs down, so it starts a little higher on a short candle)
  const neckY = o.neck === "necktie" ? Math.min(ey + 21, 99)
    : o.head === "bungeo" && !costume ? Math.min(ey + 38, 116)
    : Math.min(ey + 24, 108);
  // glasses go over whatever is on the head (a hat's brim, a mask's window)
  return (costume ? drawBody(o.body!, top, ey) : "") +
    (o.head && !costume ? drawHead(o.head, wide ? top - 3 : top, ey) : "") +
    (o.face ? drawFace(o.face, ey) : "") +
    (o.neck && !(wide && o.neck === "necktie") ? drawNeck(o.neck, wide ? ey + 21 : neckY) : "");
}

/** a little crossed plaster on the head, after being teased */
const BANDAGE = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})">` +
  [-35, 35].map((r) => `<g transform="rotate(${r})"><rect x="-11" y="-4" width="22" height="8" rx="4" fill="#f6d7b0" stroke="${INK}" stroke-width="1.3"/>` +
    `<rect x="-3.5" y="-3" width="7" height="6" rx="1.5" fill="#e8b98a"/></g>`).join("") +
  `</g>`;

const TEAR_AT = (x: number, y: number) => `<path d="M${x} ${y} q-2.5 6 0 9 q2.5 -3 0 -9z" fill="${TEAR}"/>`;

/** `trim`: start the candle this much lower (under a mask that covers its top, so no corner peeks out) */
function body(mood: MoodKey, look: Look, tone: Tone, trim = 0, eyes = true) {
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
      feet: "",
      art: `<path d="${shape}" fill="${fill}"/>` +
        `<path d="M${cx + 30} ${top + 18} q3 8 0 13 q-3 -5 0 -13z" fill="${fill}"/>` +
        (eyes ? eye(cx - 7.5, ey, look.eye, tone) + eye(cx + 7.5, ey, look.eye, tone) + TEAR_AT(cx - 10.5, ey + 9) : "") +
        mouth(cx, ey + 15, look.mouth),
    };
  }
  const h = look.h, top = ground - 10 - h, ey = top + Math.min(30, h * 0.38);
  return {
    top,
    // black capsule feet = the lower shadow; separate parts so each can step on its own
    feet:
      `<rect class="foot foot-l" x="${cx - 16}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${INK}"/>` +
      `<rect class="foot foot-r" x="${cx + 5}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${INK}"/>`,
    art:
      `<rect x="${cx - w / 2}" y="${top + trim}" width="${w}" height="${h - trim}" rx="22" fill="${fill}"/>` +
      (eyes ? eye(cx - 7.5, ey, look.eye, tone) + eye(cx + 7.5, ey, look.eye, tone) : "") +
      (mood === "sad" && eyes ? TEAR_AT(cx - 10.5, ey + 10) : "") +
      mouth(cx, ey + 16, look.mouth),
  };
}

/**
 * Highest drawn point of the Ticky (top of the wick, spark or smoke), in SVG units
 * (the viewBox is 0..140 tall, feet stand at y=132). Lets the name tag sit right on the head.
 */
export function headTop(mood: MoodKey, outfit?: Outfit): number {
  const look = LOOKS[mood];
  if (mood === "melt") return 86 - Math.max(6, headReach(outfit));
  const top = 122 - look.h;
  const reach = { boom: 31, blast: 48, sleep: 30, offline: 14, alarm: 20 } as Partial<Record<MoodKey, number>>;
  const wickReach = look.wick === "none" ? 0
    : look.wick === "perky" ? 22 : look.wick === "frizz" ? 20 : look.wick === "calm" ? 15 : 12;
  return top - Math.max(wickReach + wickLift(outfit), reach[mood] ?? 0, headReach(outfit));
}

/**
 * Full SVG markup for one Ticky. Pass `filterId` to apply the hand-drawn boil wobble;
 * it is off by default because WebView2 rasterises SVG filters at 1x, which makes edges jagged.
 */
export function tickySvg(mood: MoodKey, tone: Tone, label: string, face?: Face, filterId?: string, bandage = false, outfit?: Outfit) {
  const f = face ? FACES[face] : undefined;
  const base = LOOKS[mood];
  const look = f ? { ...base, eye: f.eye, mouth: f.mouth, wick: f.wick ?? base.wick } : base;
  const b = body(mood, look, tone, outfit?.head === "bungeo" && !outfit.body ? 12 : 0, !hidesEyes(outfit));
  const wide = mood === "melt";
  return `<svg viewBox="0 0 120 140" role="img" aria-label="${label}" overflow="visible">` +
    `<ellipse cx="60" cy="134" rx="${wide ? 50 : 30}" ry="4" fill="rgba(0,0,0,.10)"/>` +
    `<g class="${look.anim}"${mood === "offline" ? ' opacity="0.5"' : ""}><g${filterId ? ` filter="url(#${filterId})"` : ""}>` +
    // walking animates these parts separately (App.css: feet step, upper body bobs, wick sways)
    b.feet +
    `<g class="upper">` +
    (wide || hidesWick(outfit) ? "" : `<g transform="translate(0 ${-wickLift(outfit)})"><g class="wick">${wick(60, b.top, look.wick)}</g></g>`) +
    b.art + dress(outfit, b.top, wide ? b.top + 18 : b.top + Math.min(30, look.h * 0.38), wide) +
    (face ? faceExtras(face, b.top) : extras(mood, b.top, look.h)) +
    (bandage ? BANDAGE(wide ? 74 : 80, b.top + (wide ? 6 : 9)) : "") +
    `</g></g></g></svg>`;
}
