import { useState } from "react";
import type { FeedStatus, LiveStatus, Quote } from "../market/types";
import type { MoodKey } from "../ticky/moods";
import { SCALES } from "../scale";
import { inTauri } from "../clickThrough";
import type { Watchlist } from "../watchlist";
import { WatchlistPanel } from "./WatchlistPanel";
import type { Layout } from "../App";

interface Props {
  watch: Watchlist;
  followHours: boolean;
  onFollowHours: (on: boolean) => void;
  wakeExtended: boolean;
  onWakeExtended: (on: boolean) => void;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  scale: number;
  onScale: (scale: number) => void;
  preview: boolean;
  onPreview: (on: boolean) => void;
  status: FeedStatus;
  quotes: Record<string, Quote>;
  moods: Record<string, MoodKey>;
}

const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: "roam", label: "티키 출근", hint: "화면 아래를 돌아다녀요" },
  { value: "prices", label: "티키 퇴근", hint: "시세만 오른쪽 아래에 쌓아요" },
];

const LIVE_TEXT: Record<LiveStatus, string> = {
  off: "",
  connecting: "연결 중…",
  ok: "연결됨",
  "rate-limit": "요청이 너무 많아요. 잠시 후 다시 시도해요",
  error: "연결할 수 없어요",
};

export function Toolbar({ watch, followHours, onFollowHours, wakeExtended, onWakeExtended, layout, onLayout, scale, onScale, preview, onPreview, status, quotes, moods }: Props) {
  const [panel, setPanel] = useState<"none" | "list" | "settings">("none");

  return (
    <div className="toolbar">
      <button
        type="button"
        className={`tool ${panel === "list" ? "on" : ""}`}
        title="관심 종목"
        aria-pressed={panel === "list"}
        onClick={() => setPanel(panel === "list" ? "none" : "list")}
      >＋</button>
      <button
        type="button"
        className={`tool ${panel === "settings" ? "on" : ""}`}
        title="설정"
        aria-pressed={panel === "settings"}
        onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
      >⚙</button>

      {panel === "list" && <WatchlistPanel watch={watch} quotes={quotes} moods={moods} />}
      {panel === "settings" && (
        <div className="panel">
          <div className="layouts" role="group" aria-label="레이아웃">
            {LAYOUTS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={l.value === layout ? "on" : ""}
                aria-pressed={l.value === layout}
                onClick={() => { onLayout(l.value); setPanel("none"); }} // close settings so the 출근 / 퇴근 can be watched
              >
                <b>{l.label}</b>
                <span>{l.hint}</span>
              </button>
            ))}
          </div>
          <div className="sizes" role="group" aria-label="크기">
            <span>크기</span>
            {SCALES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={s.value === scale ? "on" : ""}
                aria-pressed={s.value === scale}
                onClick={() => onScale(s.value)}
              >{s.label}</button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={followHours} onChange={(e) => onFollowHours(e.target.checked)} />
            실제 장 시간 따르기 (장 마감이면 잠)
          </label>
          <label className={followHours ? undefined : "off"}>
            <input
              type="checkbox"
              checked={wakeExtended}
              disabled={!followHours}
              onChange={(e) => onWakeExtended(e.target.checked)}
            />
            미국 장전·장후에도 깨어 있기
          </label>
          <label>
            <input type="checkbox" checked={preview} onChange={(e) => onPreview(e.target.checked)} />
            모든 상태 보기 (미리보기)
          </label>

          <div className="keybox">
            {inTauri() ? (
              <>
                <div className="keybox-title">
                  한국 주식 · 네이버
                  <span className={`live live-${status.kr}`}>{LIVE_TEXT[status.kr]}</span>
                </div>
                <div className="keybox-title">
                  미국 주식 · Yahoo
                  <span className={`live live-${status.us}`}>{LIVE_TEXT[status.us]}</span>
                </div>
                <p className="hint">한국 7초, 미국 15초마다 받아요. 미국은 장 전·장 후 가격까지 포함해요.</p>
              </>
            ) : (
              <p className="hint">실제 시세는 데스크탑 앱에서만 받아요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
