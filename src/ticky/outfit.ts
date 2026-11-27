// 꾸미기: small things a Ticky can wear, one per spot (머리 / 얼굴 / 목), saved per stock.
// Drawn in the Ticky's own SVG units (viewBox 120×140; the candle is 64 wide, x 28–92, feet on
// y=132) from where its body top and eyes are, so they follow its height as its mood changes.
// Sunglasses-type lenses are solid (the user chose that over see-through: frames side by side read better).

export type HeadItem = "santa" | "antlers" | "beanie" | "crown" | "ribbon" | "bungeo" | "visor" | "headset" | "jonber" | "earmuffs" | "cathat";
export type FaceItem = "glasses" | "heart" | "star" | "pixel" | "strawberry" | "cake";
export type NeckItem = "scarf" | "bowtie" | "necktie";
/** a whole costume over the body; it comes with its own topper, so no head item with it */
export type BodyItem = "tree" | "goguma";
export interface Outfit { head?: HeadItem; face?: FaceItem; neck?: NeckItem; body?: BodyItem }
export type Slot = keyof Outfit;

const INK = "#1f1f1f";

/** what's in the drawer: spot → items (label, and what the Ticky says putting it on) */
export const CATALOG: { slot: Slot; label: string; items: { id: string; label: string; line: string }[] }[] = [
  {
    slot: "body", label: "옷", items: [
      { id: "tree", label: "트리 옷", line: "나 트리야!" },
      { id: "goguma", label: "군고구마 옷", line: "호호 뜨거워" },
    ],
  },
  {
    slot: "head", label: "머리", items: [
      { id: "santa", label: "산타 모자", line: "메리 크리스마스!" },
      { id: "antlers", label: "루돌프 뿔", line: "루돌프 출근했어" },
      { id: "beanie", label: "털모자", line: "포근해~" },
      { id: "crown", label: "왕관", line: "오늘은 내가 왕" },
      { id: "ribbon", label: "리본", line: "귀엽지?" },
      { id: "bungeo", label: "붕어빵 탈", line: "따끈따끈 붕어빵!" },
      { id: "earmuffs", label: "귀마개", line: "귀가 따뜻해~" },
      { id: "cathat", label: "고양이 모자", line: "야옹~" },
      { id: "visor", label: "딜러 썬캡", line: "오늘 장 좀 볼까" },
      { id: "headset", label: "헤드셋", line: "주문 들어갑니다" },
      { id: "jonber", label: "존버 머리띠", line: "존버는 승리한다" },
    ],
  },
  {
    slot: "face", label: "얼굴", items: [
      { id: "glasses", label: "동그란 안경", line: "똑똑해 보여?" },
      { id: "heart", label: "하트 선글라스", line: "사랑스럽지?" },
      { id: "star", label: "별 선글라스", line: "스타 탄생" },
      { id: "pixel", label: "픽셀 선글라스", line: "Deal with it" },
      { id: "strawberry", label: "딸기 안경", line: "상큼하게!" },
      { id: "cake", label: "생일 안경", line: "축하해 줘!" },
    ],
  },
  {
    slot: "neck", label: "목", items: [
      { id: "scarf", label: "목도리", line: "따뜻하다~" },
      { id: "bowtie", label: "나비넥타이", line: "격식 있게" },
      { id: "necktie", label: "넥타이", line: "출근 완료" },
    ],
  },
];

/** solid lenses: the eyes behind them aren't drawn at all (so none of them peeks out round a frame) */
export const hidesEyes = (o?: Outfit) => !!o?.face && ["heart", "star", "pixel", "strawberry", "cake"].includes(o.face);

/** the wick is hidden under a costume or a mask that covers the whole head */
export const hidesWick = (o?: Outfit) => !!o?.body || o?.head === "bungeo" || o?.head === "cathat";

/** how far the wick is pushed up so it pokes out of what's on the head */
export function wickLift(o?: Outfit): number {
  return o?.head === "beanie" ? 11 : o?.head === "crown" ? 6 : 0;
}

/** how far above the body top a head item reaches (for placing the speech bubble) */
export function headReach(o?: Outfit): number {
  if (o?.body) return o.body === "tree" ? 38 : 26; // the costume's tip (and the tree's star)
  const reach: Record<HeadItem, number> = {
    santa: 34, antlers: 24, beanie: 8, crown: 16, ribbon: 8, bungeo: 18, visor: 2, headset: 8, jonber: 2, earmuffs: 8, cathat: 31,
  };
  return o?.head ? reach[o.head] : 0;
}

/** a head item, sitting on the body top `t` */
export function drawHead(item: HeadItem, t: number, ey = t + 27): string {
  switch (item as string) {
    default: return "";
    case "santa": // flopping to one side, so the wick still stands up beside it
      return `<g transform="translate(46 ${t + 4}) rotate(-16)">` +
        `<path d="M-19 0C-15 -20 0 -31 19 -28C11 -20 12 -9 18 0Z" fill="#e5383b" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        `<circle cx="19" cy="-28" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
        `<rect x="-22" y="-4" width="44" height="9" rx="4.5" fill="#fff" stroke="${INK}" stroke-width="2.2"/></g>`;
    case "antlers": {
      const a = `<path d="M0 0C-1 -8 -4 -14 -9 -20M-3 -9C-8 -10 -12 -9 -15 -12M-6 -15C-4 -19 -2 -21 1 -23" fill="none" stroke="#9a6a45" stroke-width="4" stroke-linecap="round"/>`;
      return `<g transform="translate(40 ${t + 3})">${a}</g><g transform="translate(80 ${t + 3}) scale(-1 1)">${a}</g>`;
    }
    case "beanie": // a knit cap; the wick pokes out of the top
      return `<path d="M26 ${t + 10}C26 ${t - 14} 94 ${t - 14} 94 ${t + 10}Z" fill="#f2b134" stroke="${INK}" stroke-width="2.2"/>` +
        `<rect x="24" y="${t + 3}" width="72" height="10" rx="5" fill="#e09a1f" stroke="${INK}" stroke-width="2.2"/>` +
        `<path d="${[34, 42, 50, 58, 66, 74, 82].map((x) => `M${x} ${t + 5.5}v5`).join("")}" stroke="#b97a12" stroke-width="1.6" stroke-linecap="round"/>`;
    case "crown":
      return `<path d="M45 ${t + 3}L43 ${t - 12}L52 ${t - 5}L60 ${t - 16}L68 ${t - 5}L77 ${t - 12}L75 ${t + 3}Z" fill="#ffc83d" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        [[43, t - 12], [60, t - 16], [77, t - 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#f04452"/>`).join("") +
        `<circle cx="60" cy="${t - 2}" r="2.2" fill="#3182f6"/>`;
    case "bungeo": { // a taiyaki mask, traced from a taiyaki icon (with the same black outline as
      // the other things to wear): a round head with a flat-topped back, a thick waist, a two-lobed tail with a notch,
      // a dot eye and short baked lines; worn sideways with the face looking out of a round hole
      const c = "#f5b75e", d = "#d9923a";
      const top = ey - 36;                              // the fish is ~74 tall from here
      const hx = 60, hy = ey + 4, hrx = 22, hry = 19;   // the face hole
      const y = (dy: number) => top + dy;
      const fish =
        `M8 ${y(38)}C8 ${y(24)} 16 ${y(12)} 28 ${y(5)}` +             // round head
        `C31 ${y(-3)} 40 ${y(-7)} 50 ${y(-7)}C60 ${y(-7)} 68 ${y(-5)} 71 ${y(2)}` + // a round hump on the back
        `C76 ${y(4)} 84 ${y(6)} 89 ${y(11)}` +                        // down to a shallow waist
        `C93 ${y(7)} 101 ${y(6)} 106 ${y(9)}C110 ${y(12)} 110 ${y(20)} 107 ${y(24)}` + // the tail's top lobe
        `C105 ${y(27)} 108 ${y(30)} 111 ${y(34)}` +                   // the notch
        `C115 ${y(40)} 115 ${y(48)} 111 ${y(54)}C107 ${y(60)} 99 ${y(61)} 92 ${y(59)}` + // the bottom lobe
        `C89 ${y(58)} 87 ${y(57)} 86 ${y(56)}` +                      // back to the waist
        `C80 ${y(67)} 68 ${y(74)} 54 ${y(74)}` +                      // belly
        `C34 ${y(74)} 18 ${y(66)} 12 ${y(56)}C9 ${y(51)} 8 ${y(45)} 8 ${y(38)}Z`;
      const hole = `M${hx - hrx} ${hy}a${hrx} ${hry} 0 1 0 ${2 * hrx} 0a${hrx} ${hry} 0 1 0 ${-2 * hrx} 0Z`;
      const line = (dd: string) => `<path d="${dd}" fill="none" stroke="${d}" stroke-width="2.6" stroke-linecap="round"/>`;
      return (
        `<path d="${fish}${hole}" fill="${c}" fill-rule="evenodd" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        line(`M30 ${y(22)}Q36 ${y(38)} 32 ${y(55)}`) +                                       // gill
        line(`M42 ${y(-2)}l1.5 5.4M51 ${y(-3.5)}l0.6 6M60 ${y(-2.5)}l-1.5 5.4`) +              // ticks on the back
        line(`M86.5 ${y(29)}q4 3.5 0 7.5q4 3.5 0 7.5`) +                                       // scales, by the waist
        line(`M93 ${y(19)}l8 -3.4M95 ${y(36)}l9 0M93 ${y(50)}l8 3.4`) +              // the tail's lines
        `<circle cx="20" cy="${y(37.6)}" r="2.8" fill="${d}"/>`                            // the eye
      );
    }
    case "visor": { // a dealer's green see-through visor: a band, and the brim casting a green tint
      return `<path d="M24 ${t + 9}Q60 ${t + 4} 96 ${t + 9}L90 ${t + 21}Q60 ${t + 16} 30 ${t + 21}Z" fill="rgba(46,170,90,0.42)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<rect x="30" y="${t + 3}" width="60" height="7" rx="3.5" fill="#2f7d4f" stroke="${INK}" stroke-width="2"/>`;
    }
    case "headset": { // over-the-head band, ear cups, and a little mic by the mouth
      const cup = (x: number) => `<rect x="${x}" y="${t + 12}" width="12" height="21" rx="6" fill="#3a3f4a" stroke="${INK}" stroke-width="2"/>`;
      return `<path d="M26 ${t + 18}C24 ${t - 12} 96 ${t - 12} 94 ${t + 18}" fill="none" stroke="${INK}" stroke-width="6.4" stroke-linecap="round"/>` +
        `<path d="M26 ${t + 18}C24 ${t - 12} 96 ${t - 12} 94 ${t + 18}" fill="none" stroke="#3a3f4a" stroke-width="3.2" stroke-linecap="round"/>` +
        cup(19) + cup(89) +
        `<path d="M25 ${t + 31}Q26 ${ey + 17} 41 ${ey + 17}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<circle cx="43" cy="${ey + 17}" r="3.2" fill="#3a3f4a" stroke="${INK}" stroke-width="1.6"/>`;
    }
    case "jonber": // a headband with 존버 on it, the knot's ends flying out on the right
      return `<path d="M91 ${t + 7}l10 -6l1.5 7ZM91 ${t + 10}l10 4l-4.5 5Z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<rect x="30" y="${t + 3}" width="61" height="11" rx="3" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
        `<text class="readable" x="60.5" y="${t + 11.6}" text-anchor="middle" font-family="Pretendard Variable, Pretendard, sans-serif" font-weight="800" font-size="8.6" fill="#e5383b">존버</text>`;
    case "earmuffs": { // a band over the head and a fluffy round muff on each side
      const muff = (cx: number) => {
        const pts: string[] = [];
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2, r = i % 2 ? 9.2 : 10.4;
          pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(t + 23 + Math.sin(a) * r).toFixed(1)}`);
        }
        return `<path d="M${pts.join("L")}Z" fill="#fde8ee" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
          `<circle cx="${cx}" cy="${t + 23}" r="4.6" fill="#ffc2d1"/>`;
      };
      return `<path d="M25 ${t + 20}C23 ${t - 11} 97 ${t - 11} 95 ${t + 20}" fill="none" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/>` +
        `<path d="M25 ${t + 20}C23 ${t - 11} 97 ${t - 11} 95 ${t + 20}" fill="none" stroke="#ff9fb5" stroke-width="2.6" stroke-linecap="round"/>` +
        muff(23) + muff(97);
    }
    case "cathat": { // a soft knit beanie with cat ears, a folded cuff, a star patch and two buttons
      const c = "#b8d8f0", cuff = "#a2c8ea", pink = "#f6c9d6";
      const hat = `M22 ${t + 12}C20 ${t - 2} 25 ${t - 10} 32 ${t - 13}` +
        `L30 ${t - 27}Q31 ${t - 32} 35 ${t - 29}L47 ${t - 18}Q60 ${t - 22} 73 ${t - 18}` +
        `L85 ${t - 29}Q89 ${t - 32} 90 ${t - 27}L88 ${t - 13}C95 ${t - 10} 100 ${t - 2} 98 ${t + 12}Z`;
      const inner = (m: number) => {
        const x = (v: number) => (60 - m * (60 - v)).toFixed(1);
        return `<path d="M${x(34)} ${t - 16}L${x(33.5)} ${t - 24}L${x(42)} ${t - 18}Z" fill="${pink}" stroke="${pink}" stroke-width="2.4" stroke-linejoin="round"/>`;
      };
      const star = `M0 -5.6l1.7 3.4 3.7 .5 -2.7 2.6 .6 3.7 -3.3 -1.7 -3.3 1.7 .6 -3.7 -2.7 -2.6 3.7 -.5z`;
      return `<path d="${hat}" fill="${c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        inner(1) + inner(-1) +
        `<path d="${star}" transform="translate(45 ${t - 6})" fill="#f6e7b2" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<rect x="20" y="${t + 2}" width="80" height="12" rx="6" fill="${cuff}" stroke="${INK}" stroke-width="2.2"/>` +
        [81, 89].map((x) => `<circle cx="${x}" cy="${t + 8}" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`).join("");
    }
    case "ribbon": {
      const loop = `<path d="M0 0C-10 -10 -15 1 -11 6C-8 9 -3 4 0 0Z" fill="#ff6b9a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
      return `<g transform="translate(84 ${t + 5}) rotate(18)">${loop}<g transform="scale(-1 1)">${loop}</g>` +
        `<circle r="3.2" fill="#e04e80" stroke="${INK}" stroke-width="1.8"/></g>`;
    }
  }
}

/**
 * A costume over the whole candle, from its body top `t` down to the feet; the face looks out
 * of a round opening (eyes at height `ey`). Drawn after the face, so the opening is a real hole.
 */
export function drawBody(item: BodyItem, t: number, ey: number): string {
  switch (item as string) {
    default: return "";
    case "goguma": {
      // a roasted sweet potato costume: purple skin, a curly root on top, the face looking out of
      // where it's been broken open (golden inside), a couple of charred spots and some steam
      const tip = t - 20, hem = 124;
      const hood = `M60 ${tip}C78 ${tip + 2} 101 ${t + 8} 102 ${t + 38}C104 ${hem - 10} 88 ${hem + 3} 60 ${hem + 3}` +
        `C32 ${hem + 3} 16 ${hem - 10} 18 ${t + 38}C19 ${t + 8} 42 ${tip + 2} 60 ${tip}Z`;
      const cy = ey + 5, rx = 22, ry = 19;
      const hole = `M${60 - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
      // the broken edge of the skin: a jagged ring round the golden inside
      const pts: string[] = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, k = i % 2 ? 1.16 : 1.3;
        pts.push(`${(60 + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`);
      }
      const broken = `M${pts.join("L")}Z`;
      const spot = (x: number, y: number, r: number) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="#5b2a4c"/>`;
      return `<path d="${hood}${broken}" fill="#8b3f6f" fill-rule="evenodd" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        `<path d="${broken}${hole}" fill="#f6c445" fill-rule="evenodd" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        spot(30, t + 22, 3.2) + spot(91, t + 44, 2.6) + spot(36, hem - 12, 2.6) + spot(84, hem - 16, 3.2) +
        `<path d="M60 ${tip}q2 -6 9 -7" fill="none" stroke="#5b2a4c" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M40 ${tip + 2}q-4 -5 0 -10q4 -5 0 -10M82 ${tip + 4}q-4 -5 0 -10q4 -5 0 -10" fill="none" stroke="#c9c3bb" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    case "tree": {
      // a plush tree costume (like one for a stuffed toy); the face peeks out of a round opening
      const tip = t - 26, hem = 124;
      // a stuffed-toy tree: rounded tip, then two soft tiers whose edges roll out and tuck back in
      const y1 = t + 12, y2 = y1 + (hem - y1) * 0.5;
      const hood = `M54 ${tip + 7}Q60 ${tip - 2} 66 ${tip + 7}` +
        // right side, down
        `L94 ${y1 - 4}Q101 ${y1 + 2} 94 ${y1 + 5}L90 ${y1 + 5}` +
        `L102 ${y2 - 4}Q109 ${y2 + 2} 102 ${y2 + 5}L98 ${y2 + 5}` +
        `L108 ${hem - 4}Q110 ${hem + 1} 104 ${hem + 1}` +
        // the hem, then the left side back up
        `Q60 ${hem + 6} 16 ${hem + 1}Q10 ${hem + 1} 12 ${hem - 4}` +
        `L22 ${y2 + 5}L18 ${y2 + 5}Q11 ${y2 + 2} 18 ${y2 - 4}` +
        `L30 ${y1 + 5}L26 ${y1 + 5}Q19 ${y1 + 2} 26 ${y1 - 4}Z`;
      // the opening: an oval around the eyes and mouth, its top edge in soft scallops
      const cy = ey + 6, rx = 25, ry = 22;
      const pts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const up = Math.sin(a) < 0 ? -Math.sin(a) : 0; // 0 along the bottom, 1 at the very top
        const r = 1 + 0.07 * up * Math.abs(Math.sin(a * 5));
        pts.push(`${(60 + Math.cos(a) * rx * r).toFixed(1)} ${(cy + Math.sin(a) * ry * r).toFixed(1)}`);
      }
      const hole = `M${pts.join("L")}Z`;
      const ball = (x: number, y: number, r: number, c: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${INK}" stroke-width="1.8"/>`;
      // a candy cane hooked on the right side
      const cx = 99, cyc = Math.max(t + 30, hem - 52);
      const cane = `M${cx} ${cyc + 16}V${cyc}a4.5 4.5 0 0 0 -9 0`;
      // a big chunky star on the tip, tilted, with a cheeky face
      const star = `M0 -14l4.3 8.6 9.5 1.4 -6.9 6.7 1.6 9.5 -8.5 -4.5 -8.5 4.5 1.6 -9.5 -6.9 -6.7 9.5 -1.4z`;
      return `<path d="${hood}${hole}" fill="#2aa168" fill-rule="evenodd" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        ball(34, t + 12, 5.5, "#e5383b") + ball(83, hem - 12, 4.5, "#f2e6c9") + ball(30, hem - 14, 3.5, "#ffd84d") +
        `<path d="${cane}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="${cane}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>` +
        `<path d="${cane}" fill="none" stroke="#e5383b" stroke-width="3.6" stroke-dasharray="3 3"/>` +
        `<g transform="translate(61 ${tip - 6}) rotate(10) scale(1.25)">` +
        `<path d="${star}" fill="#f4d96a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle cx="-3" cy="-2" r="1.1" fill="${INK}"/><circle cx="3" cy="-2" r="1.1" fill="${INK}"/>` +
        `<path d="M-3.5 1.6h7" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>` +
        `<path d="M0.6 1.6v2.4a1.5 1.5 0 0 0 3 0v-2.4" fill="#e5383b" stroke="${INK}" stroke-width="1"/></g>`;
    }
  }
}

/** glasses around the eyes (eye centres at x 52.5 / 67.5, height `ey`) */
export function drawFace(item: FaceItem, ey: number): string {
  // the party frames sit a little wider than the eyes (centres 50 / 70); sunglasses-type lenses
  // are solid dark (they hide the eyes, on purpose)
  const dark = "#2d2a33";
  // a frame: the shape in its colour with a black edge, its lens inside
  const framed = (d: string, color: string, lens = dark) =>
    `<path d="${d}" fill="${lens}" stroke="${INK}" stroke-width="5.6" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`;
  const both = (f: (cx: number) => string) => f(50) + f(70);
  switch (item as string) {
    default: return ""; // taken out of the drawer (an old saved outfit may still name it)
    case "glasses": // clear round lenses
      return [52.5, 67.5].map((x) => `<ellipse cx="${x}" cy="${ey}" rx="8.4" ry="12.4" fill="none" stroke="${INK}" stroke-width="2.4"/>`).join("");
    case "heart": {
      const heart = (cx: number) => { const y = ey - 1;
        return `M${cx} ${y + 11}C${cx - 15} ${y + 2} ${cx - 13} ${y - 12} ${cx - 5} ${y - 11}C${cx - 2} ${y - 11} ${cx} ${y - 8} ${cx} ${y - 6}` +
          `C${cx} ${y - 8} ${cx + 2} ${y - 11} ${cx + 5} ${y - 11}C${cx + 13} ${y - 12} ${cx + 15} ${y + 2} ${cx} ${y + 11}Z`; };
      return both((cx) => framed(heart(cx), "#f04452", "#4a1c2c"));
    }
    case "star": {
      const star = (cx: number) => {
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 13;
          pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(ey + 1 + Math.sin(a) * r).toFixed(1)}`);
        }
        return `M${pts.join("L")}Z`;
      };
      return both((cx) => framed(star(cx), "#ffc83d"));
    }
    case "pixel": { // 8-bit "deal with it" shades: a straight bar and stepped solid lenses
      const px = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
      const lens = (cx: number) =>
        px(cx - 10, ey - 5, 20, 4, INK) + px(cx - 8, ey - 1, 16, 4, INK) +
        px(cx - 5, ey + 3, 10, 4, INK) +
        px(cx - 7, ey - 4, 2.5, 2.5, "#fff") + px(cx - 4.5, ey - 1.5, 2.5, 2.5, "#fff");
      return px(30, ey - 8, 60, 3.4, INK) + lens(50) + lens(70);
    }
    case "strawberry": {
      const berry = (cx: number) => { const y = ey;
        return `M${cx} ${y + 13}C${cx - 12} ${y + 9} ${cx - 13} ${y - 6} ${cx - 8} ${y - 9}C${cx - 4} ${y - 12} ${cx + 4} ${y - 12} ${cx + 8} ${y - 9}C${cx + 13} ${y - 6} ${cx + 12} ${y + 9} ${cx} ${y + 13}Z`; };
      const seeds = (cx: number) => [[-9, 0], [9, 0], [-6, 8], [6, 8], [0, 12.4]]
        .map(([dx, dy]) => `<ellipse cx="${cx + dx}" cy="${ey + dy}" rx=".9" ry="1.3" fill="#ffe27a"/>`).join("");
      const leaf = (cx: number) => `<path d="M${cx} ${ey - 10}l-5 -4 3 -.5 -1 -3.5 3 2 0 -3.5 3 3.5 2 -3 0 4 4 -1 -4 4Z" fill="#46b25a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
      return both((cx) => framed(berry(cx), "#e5383b", "#3a1e22") + seeds(cx) + leaf(cx));
    }
    case "cake": { // round white frames with sprinkles, three candles standing on each
      const ring = (cx: number) => `M${cx - 10.5} ${ey}a10.5 11.5 0 1 0 21 0a10.5 11.5 0 1 0 -21 0Z`;
      const colors = ["#f04452", "#3182f6", "#2fb36b", "#ffc83d"];
      const sprinkles = (cx: number) => [[-9, -6], [8, -7], [-10, 5], [9, 6], [0, -11.5], [0, 11.5]]
        .map(([dx, dy], i) => `<circle cx="${cx + dx}" cy="${ey + dy}" r="1.2" fill="${colors[i % 4]}"/>`).join("");
      const candles = (cx: number) => [-5, 0, 5].map((dx, i) =>
        `<rect x="${cx + dx - 1.4}" y="${ey - 21}" width="2.8" height="8" rx="1" fill="${colors[i]}" stroke="${INK}" stroke-width="1"/>` +
        `<path d="M${cx + dx} ${ey - 26}q2 2.6 0 4q-2 -1.4 0 -4z" fill="#ff9a1a"/>`).join("");
      return both((cx) => candles(cx) + framed(ring(cx), "#fff") + sprinkles(cx));
    }
  }
}

/** something round the "neck": just under the mouth, at height `y` */
export function drawNeck(item: NeckItem, y: number): string {
  switch (item) {
    case "scarf":
      return `<rect x="25" y="${y}" width="70" height="11" rx="5.5" fill="#e5383b" stroke="${INK}" stroke-width="2.2"/>` +
        `<path d="M40 ${y + 2}v7M55 ${y + 2}v7M70 ${y + 2}v7M85 ${y + 2}v7" stroke="#fff" stroke-width="2.4" opacity=".85"/>` +
        `<path d="M72 ${y + 8}l3 18l9 -2l-2 -16z" fill="#e5383b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    case "necktie": // a knot and a tie (short enough to end above the feet)
      return `<path d="M56 ${y + 6}h8l4.5 13l-8.5 7l-8.5 -7Z" fill="#3157d5" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M56.6 ${y + 11}l7.6 -2.8M55.6 ${y + 17.5}l10 -3.6" stroke="#9db4ff" stroke-width="2"/>` +
        `<path d="M53.5 ${y - 1}h13l-2.6 8h-7.8Z" fill="#2442a8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    case "bowtie":
      return `<path d="M60 ${y + 4}L49 ${y - 2}L49 ${y + 10}ZM60 ${y + 4}L71 ${y - 2}L71 ${y + 10}Z" fill="#3157d5" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
        `<rect x="57" y="${y + 1}" width="6" height="6" rx="2" fill="#2442a8" stroke="${INK}" stroke-width="1.6"/>`;
  }
}

/** a lone item for the drawer's buttons, in a small square viewBox */
export function itemIcon(slot: Slot, id: string): string {
  const body = `<rect x="28" y="40" width="64" height="82" rx="22" fill="#e7e2da"/>`;
  if (slot === "body") return `<svg viewBox="2 0 116 128" aria-hidden="true">${body}${drawBody(id as BodyItem, 40, 68)}</svg>`;
  const inner =
    slot === "head" ? drawHead(id as HeadItem, 40)
    : slot === "face" ? drawFace(id as FaceItem, 68)
    : drawNeck(id as NeckItem, 92);
  const view = slot === "head" ? (id === "bungeo" ? "2 12 126 92" : "8 4 108 92") : slot === "face" ? "14 30 92 92" : "14 50 92 92";
  return `<svg viewBox="${view}" aria-hidden="true">${body}${inner}</svg>`;
}
