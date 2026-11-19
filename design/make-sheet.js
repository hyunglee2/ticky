// Builds the Figma expression sheets from the same drawing rules as design/character-lab.html
// (static: no boil filter, no animation).
// Usage:
//   node design/make-sheet.js design/ticky-expression-sheet.svg              first sheet (7 moods + 4 special)
//   node design/make-sheet.js design/ticky-expression-sheet-lids.svg --lids  chosen combo (9 moods + 4 special)
const fs = require('fs');

const COL = { up: '#F04452', down: '#3182F6', flat: '#C9C1B4' };
const LIDCOL = { '#F04452': '#C9303D', '#3182F6': '#2266D0', '#C9C1B4': '#A69D8F' };
const USE_LIDS = process.argv.includes('--lids');
// how much of the eye the new lid covers, per eye kind
const LID = { lid: 1 / 3, heavy: 1 / 2, sleepy: 2 / 3, blank: 1 / 2 };

function lidShape(x, y, rx, ry, amount, color) {
  const cutY = y - ry + 2 * ry * amount;
  const t = (cutY - y) / ry;
  const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
  const large = cutY > y ? 1 : 0;
  return `<path d="M${r(x - dx)} ${r(cutY)} A${rx} ${ry} 0 ${large} 1 ${r(x + dx)} ${r(cutY)}Z" fill="${color}"/>` +
         `<path d="M${r(x - dx)} ${r(cutY)} L${r(x + dx)} ${r(cutY)}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
}
const INK = '#1F1F1F', TEAR = '#8CC4FF';

// eyes.svg shape: tall white oval (2:3), tall oval pupil sitting to the right
function eye(id, x, y, kind, body) {
  if (kind === 'lidclosed') {
    // eyelid fully down: the eye oval in the lid shade, with a curved lash line low on it
    return `<g id="${id}"><ellipse cx="${x}" cy="${y}" rx="7.5" ry="11.25" fill="${LIDCOL[body]}"/>` +
           `<path d="M${x - 6.5} ${y + 3} q6.5 5.5 13 0" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></g>`;
  }
  if (kind === 'daze') {
    // dazed after the blast: tiny pupils staring straight ahead
    return `<g id="${id}"><ellipse cx="${x}" cy="${y}" rx="7.5" ry="11.25" fill="#FFFFFF"/>` +
           `<ellipse cx="${x}" cy="${y + 1}" rx="2" ry="2.8" fill="${INK}"/></g>`;
  }
  if (kind === 'smug') {
    // half-lidded, pupils sliding to the side
    return `<g id="${id}"><ellipse cx="${x}" cy="${y}" rx="7.5" ry="11.25" fill="#FFFFFF"/>` +
           `<ellipse cx="${r(x + 3.9)}" cy="${r(y + 1.5)}" rx="3.6" ry="5.55" fill="${INK}"/>` +
           `<g id="${id}-lid">${lidShape(x, y, 7.5, 11.25, 0.55, LIDCOL[body])}</g></g>`;
  }
  if (kind === 'closed') {
    return `<path id="${id}" d="M${x - 6} ${y} q6 5 12 0" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const rx = 7.5, ry = 11.25, prx = 3.6, pry = 5.55, px = 3.9;
  const py = kind === 'up' ? -3.7 : kind === 'heavy' ? 1.1 : kind === 'sleepy' ? 2.5 : -0.5;
  const pxk = kind === 'blank' ? 0 : px; // blank stare looks straight ahead
  let s = `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#FFFFFF"/>` +
          `<ellipse cx="${r(x + pxk)}" cy="${r(y + py)}" rx="${prx}" ry="${pry}" fill="${INK}"/>`;
  if (USE_LIDS && LID[kind]) {
    return `<g id="${id}">${s}<g id="${id}-lid">${lidShape(x, y, rx, ry, LID[kind], LIDCOL[body])}</g></g>`;
  }
  if (kind === 'lid' || kind === 'heavy') {
    const cut = kind === 'heavy' ? 2 : -0.5;
    s += `<path d="M${x - rx - 1} ${y + cut} A${rx + 1} ${ry + 1} 0 0 1 ${x + rx + 1} ${y + cut} L${x + rx + 1} ${y - ry - 2} L${x - rx - 1} ${y - ry - 2}Z" fill="${body}"/>` +
         `<path d="M${x - rx} ${y + cut} L${x + rx} ${y + cut}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return `<g id="${id}">${s}</g>`;
}
const r = (n) => Math.round(n * 100) / 100;

function mouth(x, y, kind) {
  switch (kind) {
    case 'puff':  return `<ellipse cx="${x}" cy="${y + 1}" rx="2.6" ry="3" fill="${INK}"/>` +
                         `<circle cx="${x + 8}" cy="${y - 1}" r="3.2" fill="#A3A8B0"/>`;
    case 'smirk': return `<path d="M${x - 4} ${y + 1} q5 2.5 9 -3" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'drool': return `<path d="M${x - 4} ${y} h7" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
                         `<path d="M${x + 2} ${y + 1} v7" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>`;
    case 'open':  return `<ellipse cx="${x}" cy="${y + 1}" rx="4.2" ry="4.8" fill="${INK}"/>`;
    case 'yawn':  return `<ellipse cx="${x}" cy="${y + 1}" rx="3.2" ry="4.2" fill="${INK}"/>`;
    case 'smile': return `<path d="M${x - 4} ${y} q4 4 8 0" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'wobble':return `<path d="M${x - 6} ${y + 1} q1.5 -3 3 0 t3 0 t3 0 t3 0" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'tiny':  return `<path d="M${x - 2.5} ${y} h5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    default:      return `<path d="M${x - 4} ${y} h8" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
}

function wick(x, top, kind) {
  const d = {
    perky: `M${x} ${top + 2} q-3 -12 3 -20`,
    calm:  `M${x} ${top + 2} q-1 -8 2 -13`,
    droop: `M${x} ${top + 2} q1 -9 10 -8`,
    frizz: `M${x} ${top + 2} l-3 -4 l5 -3 l-5 -4 l5 -3 l-3 -4`,
  }[kind];
  return `<path d="${d}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
}

const star = (x, y, a, b) =>
  `<path d="M${x} ${y} l${a} ${b * 2.8} l${b * 2.8} ${a} l${-b * 2.8} ${a} l${-a} ${b * 2.8} l${-a} ${-b * 2.8} l${-b * 2.8} ${-a} l${b * 2.8} ${-a}z" fill="${INK}"/>`;

// mood list: 7 market moods + 4 special states (special ones marked draft)
const STATES = [
  { id: 'cheer',   name: '환호',     note: '+5% 이상',     color: 'up',   h: 92, eye: 'up',     mouth: 'open',   wick: 'perky' },
  { id: 'happy',   name: '신남',     note: '+2 ~ +5%',     color: 'up',   h: 80, eye: 'up',     mouth: 'smile',  wick: 'perky' },
  { id: 'good',    name: '기분 좋음', note: '+0.5 ~ +2% · 시안', color: 'up',   h: 72, eye: 'look',   mouth: 'smile',  wick: 'calm'  },
  { id: 'calm',    name: '평온',     note: '±0.5% 이내',   color: 'flat', h: 66, eye: 'look',   mouth: 'flat',   wick: 'calm'  },
  { id: 'sulky',   name: '시무룩',   note: '−0.5 ~ −2%',   color: 'down', h: 74, eye: 'lid',    mouth: 'tiny',   wick: 'droop' },
  { id: 'sad',     name: '울상',     note: '−2 ~ −5%',     color: 'down', h: 82, eye: 'heavy',  mouth: 'wobble', wick: 'droop' },
  { id: 'melt',    name: '대성통곡', note: '−5% 이하',     color: 'down', h: 0,  eye: 'heavy',  mouth: 'wobble' },
  { id: 'sleep',   name: '잠',       note: '장 마감·휴장',  color: 'flat', h: 66, eye: 'closed', mouth: 'tiny',   wick: 'droop' },
  { id: 'wake',    name: '기상',     note: '장 시작 직후 · 시안', color: 'flat', h: 66, eye: 'lid', mouth: 'yawn', wick: 'calm' },
  { id: 'shock',   name: '놀람',     note: '5분 내 ±2% · 시안',  color: 'up', h: 80, eye: 'up', mouth: 'open', wick: 'perky' },
  { id: 'offline', name: '연결 끊김', note: '데이터 수신 실패 · 시안', color: 'flat', h: 66, eye: 'look', mouth: 'flat', wick: 'droop', faded: true },
];

function character(s) {
  const fill = COL[s.color];
  const cx = 60, ground = 132, w = 64;
  const parts = [];
  parts.push(`<ellipse id="${s.id}-shadow" cx="60" cy="134" rx="${s.id === 'melt' ? 50 : 30}" ry="4" fill="#000000" fill-opacity="0.1"/>`);
  if (s.id === 'melt') {
    const top = 86, ey = top + 18;
    const shape =
      `M${cx - 30} ${ground - 4}C${cx - 30} ${top + 6} ${cx - 22} ${top} ${cx} ${top}` +
      `C${cx + 22} ${top} ${cx + 30} ${top + 6} ${cx + 30} ${ground - 14}` +
      `C${cx + 31} ${ground - 6} ${cx + 44} ${ground - 6} ${cx + 48} ${ground - 1}` +
      `C${cx + 50} ${ground + 3} ${cx + 40} ${ground + 4} ${cx + 20} ${ground + 4}` +
      `L${cx - 26} ${ground + 4}C${cx - 48} ${ground + 4} ${cx - 52} ${ground} ${cx - 44} ${ground - 3}` +
      `C${cx - 38} ${ground - 5} ${cx - 30} ${ground - 2} ${cx - 30} ${ground - 4}Z`;
    parts.push(`<g id="${s.id}-body"><path d="${shape}" fill="${fill}"/><path d="M${cx + 30} ${top + 18} q3 8 0 13 q-3 -5 0 -13z" fill="${fill}"/></g>`);
    parts.push(`<g id="${s.id}-eyes">${eye(`${s.id}-eye-l`, cx - 7.5, ey, s.eye, fill)}${eye(`${s.id}-eye-r`, cx + 7.5, ey, s.eye, fill)}</g>`);
    parts.push(`<path id="${s.id}-tear" d="M${cx - 10.5} ${ey + 9} q-2 6 0 9 q2 -3 0 -9z" fill="${TEAR}"/>`);
    parts.push(`<g id="${s.id}-mouth">${mouth(cx, ey + 15, s.mouth)}</g>`);
  } else {
    const h = s.h, top = ground - 10 - h, ey = r(top + Math.min(30, h * 0.38));
    parts.push(`<g id="${s.id}-wick">${wick(cx, top, s.wick)}</g>`);
    const feetFill = USE_LIDS ? INK : fill; // the lids sheet also carries the black-feet pick
    parts.push(`<g id="${s.id}-feet"><rect x="${cx - 16}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${feetFill}"/><rect x="${cx + 5}" y="${ground - 14}" width="11" height="14" rx="5.5" fill="${feetFill}"/></g>`);
    parts.push(`<rect id="${s.id}-body" x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="22" fill="${fill}"/>`);
    parts.push(`<g id="${s.id}-eyes">${eye(`${s.id}-eye-l`, cx - 7.5, ey, s.eye, fill)}${eye(`${s.id}-eye-r`, cx + 7.5, ey, s.eye, fill)}</g>`);
    if (s.id === 'sad') parts.push(`<path id="${s.id}-tear" d="M${cx - 10.5} ${ey + 10} q-2.5 6 0 9 q2.5 -3 0 -9z" fill="${TEAR}"/>`);
    parts.push(`<g id="${s.id}-mouth">${mouth(cx, r(ey + 16), s.mouth)}</g>`);
    // effects
    if (s.id === 'boom') {
      const sx = 63, sy = top - 18;
      parts.push(`<g id="${s.id}-spark"><path d="M${sx} ${sy - 9} v5 M${sx} ${sy + 4} v5 M${sx - 9} ${sy} h5 M${sx + 4} ${sy} h5 M${sx - 6} ${sy - 6} l3 3 M${sx + 3} ${sy + 3} l3 3 M${sx + 6} ${sy - 6} l-3 3 M${sx - 3} ${sy + 3} l-3 3" stroke="#FF8A00" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="${sx}" cy="${sy}" r="4" fill="#FFB21A"/><circle cx="${sx}" cy="${sy}" r="1.8" fill="#FFF4B8"/></g>`);
    }
    if (s.id === 'blast') {
      parts.push(`<g id="${s.id}-soot"><ellipse cx="${cx - 17}" cy="${top + 13}" rx="9" ry="6" fill="${INK}" fill-opacity="0.28"/>` +
        `<ellipse cx="${cx + 20}" cy="${top + 40}" rx="7" ry="5" fill="${INK}" fill-opacity="0.28"/>` +
        `<ellipse cx="${cx - 8}" cy="${top + h - 12}" rx="10" ry="5" fill="${INK}" fill-opacity="0.22"/></g>`);
      parts.push(`<g id="${s.id}-smoke"><circle cx="${cx + 4}" cy="${top - 24}" r="4.5" fill="#A3A8B0" fill-opacity="0.75"/>` +
        `<circle cx="${cx + 10}" cy="${top - 32}" r="6" fill="#A3A8B0" fill-opacity="0.6"/>` +
        `<circle cx="${cx + 2}" cy="${top - 41}" r="7" fill="#A3A8B0" fill-opacity="0.45"/></g>`);
    }
    if (s.id === 'cheer') parts.push(`<g id="${s.id}-sparkles">${star(98, top + 4, 2.5, 2.5)}${star(20, top + 26, 1.6, 1.6)}</g>`);
    if (s.id === 'sleep') parts.push(`<g id="${s.id}-zzz"><path d="M84 ${top - 14} h9 l-9 10 h9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M98 ${top - 26} h6 l-6 7 h6" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    if (s.id === 'shock') parts.push(`<g id="${s.id}-bang"><path d="M98 ${top + 2} v14" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="98" cy="${top + 24}" r="2.4" fill="${INK}"/></g>`);
    if (s.id === 'offline') parts.push(`<g id="${s.id}-question"><path d="M92 ${top - 4} q0 -8 7 -8 q7 0 7 7 q0 5 -7 7 v4" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="99" cy="${top + 14}" r="2" fill="${INK}"/></g>`);
  }
  return `<g${s.faded ? ' opacity="0.5"' : ''}>${parts.join('')}</g>`;
}

// mark the 4 special states so layout can split rows by kind, not by index
['sleep', 'wake', 'shock', 'offline'].forEach((id) => { STATES.find((s) => s.id === id).special = true; });

// with new lids, the sleepy wake-up and the blank offline stare use their own lid heights
if (USE_LIDS) {
  // ±10% tiers: 폭등 (lit dynamite fuse) before 환호, 폭락 (sooty aftermath) after 대성통곡
  STATES.unshift({ id: 'boom', name: '폭등', note: '+10% 이상', color: 'up', h: 100, eye: 'up', mouth: 'open', wick: 'perky' });
  STATES.splice(STATES.findIndex((s) => s.id === 'melt') + 1, 0,
    { id: 'blast', name: '폭락', note: '−10% 이하', color: 'down', h: 70, eye: 'daze', mouth: 'puff', wick: 'frizz' });
  STATES.find((s) => s.id === 'cheer').note = '+5 ~ +10%';
  STATES.find((s) => s.id === 'melt').note = '−5 ~ −10%';
  STATES.find((s) => s.id === 'wake').eye = 'sleepy';
  STATES.find((s) => s.id === 'offline').eye = 'blank';
  // chosen faces: sleep = lids down + drool, happy = smug side-eye + smirk
  Object.assign(STATES.find((s) => s.id === 'sleep'), { eye: 'lidclosed', mouth: 'drool' });
  Object.assign(STATES.find((s) => s.id === 'happy'), { eye: 'smug', mouth: 'smirk' });
}

// layout: row 1 = 7 market moods, row 2 = 4 special states, centred
const MOODS_N = STATES.filter((s) => !s.special).length;
const CELL = 160, SCALE = 1.2, W = CELL * MOODS_N + 80;
const cells = [];
STATES.forEach((s, i) => {
  const row = s.special ? 1 : 0;
  const col = row === 0 ? i : i - MOODS_N;
  const offset = row === 0 ? 40 : 40 + (CELL * MOODS_N - CELL * 4) / 2;
  const x = offset + col * CELL, y = 110 + row * 280;
  const art = `<g transform="translate(${x + (CELL - 120 * SCALE) / 2} ${y}) scale(${SCALE})">${character(s)}</g>`;
  const label =
    `<text x="${x + CELL / 2}" y="${y + 196}" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="17" font-weight="700" fill="${INK}">${s.name}</text>` +
    `<text x="${x + CELL / 2}" y="${y + 218}" text-anchor="middle" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="13" fill="#7A7A7A">${s.note}</text>`;
  cells.push(`<g id="${String(i + 1).padStart(2, '0')}-${s.id}">${art}${label}</g>`);
});

const H = 110 + 280 + 240;
const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect id="background" width="${W}" height="${H}" fill="#F6F6F4"/>
<text x="40" y="52" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="26" font-weight="700" fill="${INK}">ticky 표정 시트</text>
<text x="40" y="78" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="14" fill="#7A7A7A">색 = 방향 · 몸 길이 = 변동폭 · 심지 = 기운 · 눈과 입 = 기분</text>
<line x1="40" x2="${W - 40}" y1="360" y2="360" stroke="#E2E2DE"/>
<text x="40" y="388" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif" font-size="15" font-weight="700" fill="#7A7A7A">특수 상태</text>
${cells.join('\n')}
</svg>
`;
fs.writeFileSync(process.argv[2], svg);
console.log('wrote', process.argv[2], W + 'x' + H);
