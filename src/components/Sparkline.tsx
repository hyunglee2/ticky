import type { Tone } from "../ticky/moods";

interface Props { values: number[]; base: number; tone: Tone }

/** Today's price path with a dashed line at the previous close. */
export function Sparkline({ values, base, tone }: Props) {
  const w = 112, h = 28, pad = 2;
  if (values.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(base, ...values), hi = Math.max(base, ...values);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(base)} y2={y(base)} stroke="#b9bec6" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke={`var(--${tone})`} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
