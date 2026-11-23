import { useEffect, useState } from "react";
import { tickySvg } from "../ticky/art";
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

// the little Ticky in the corner that everything is managed from (static markup from art.ts)
const LOGO = tickySvg("good", "up", "티키 메뉴");

const LIVE_TEXT: Record<LiveStatus, string> = {
  off: "",
  connecting: "연결 중…",
  ok: "연결됨",
  "rate-limit": "요청이 너무 많아요. 잠시 후 다시 시도해요",
  error: "연결할 수 없어요",
};

export function Toolbar({ watch, followHours, onFollowHours, wakeExtended, onWakeExtended, layout, onLayout, scale, onScale, preview, onPreview, status, quotes, moods }: Props) {
  const [panel, setPanel] = useState<"none" | "menu" | "list" | "settings">("none");
  const open = (next: typeof panel) => setPanel(panel === next ? "none" : next);

  // the menu or a panel closes on Esc or a click anywhere else: in this window, or out on the
  // desktop or another app (the click goes straight through to them, so this window loses focus)
  useEffect(() => {
    if (panel === "none") return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".toolbar")) setPanel("none");
    };
    const lostFocus = () => setPanel("none");
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", lostFocus);
    };
  }, [panel]);

  return (
    <div className="toolbar">
      {/* just a small Ticky in the corner; click or right-click it for the menu */}
      <button
        type="button"
        className={panel === "none" ? "logo" : "logo on"}
        title="티키 메뉴 (클릭 또는 우클릭)"
        aria-label="티키 메뉴"
        aria-expanded={panel !== "none"}
        onClick={() => open("menu")}
        onContextMenu={(e) => { e.preventDefault(); open("menu"); }}
        dangerouslySetInnerHTML={{ __html: LOGO }}
      />

      {panel === "menu" && (
        <div className="menu logo-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => setPanel("list")}>관심 종목</button>
          <button type="button" role="menuitem" onClick={() => setPanel("settings")}>설정</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onLayout(layout === "roam" ? "prices" : "roam"); setPanel("none"); }}
          >{layout === "roam" ? "티키 퇴근 (시세만 보기)" : "티키 출근 (돌아다니기)"}</button>
        </div>
      )}

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
