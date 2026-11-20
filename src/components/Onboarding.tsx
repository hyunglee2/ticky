import { tickySvg } from "../ticky/art";
import type { StarterMarket } from "../watchlist";

interface Props {
  onPick: (market: StarterMarket) => void;
}

const CHOICES: { market: StarterMarket; label: string; sub: string }[] = [
  { market: "kr", label: "국내", sub: "삼성전자 · SK하이닉스 · 현대차" },
  { market: "us", label: "미국", sub: "애플 · 엔비디아 · 테슬라" },
  { market: "both", label: "둘 다", sub: "삼성전자 · SK하이닉스 · 엔비디아" },
];

// a calm Ticky to greet the user; static markup from art.ts
const GREETER = tickySvg("calm", "flat", "티키");

/** First run only: pick a market, start with its 3 representative stocks. */
export function Onboarding({ onPick }: Props) {
  return (
    <div className="onboard" role="dialog" aria-label="처음 시작하기">
      <div className="onboard-art" dangerouslySetInnerHTML={{ __html: GREETER }} />
      <div className="onboard-body">
        <p className="onboard-title">주로 보는 시장은?</p>
        <div className="onboard-choices">
          {CHOICES.map((c) => (
            <button key={c.market} type="button" onClick={() => onPick(c.market)}>
              <b>{c.label}</b>
              <span>{c.sub}</span>
            </button>
          ))}
        </div>
        <button type="button" className="onboard-skip" onClick={() => onPick("both")}>건너뛰기</button>
      </div>
    </div>
  );
}
