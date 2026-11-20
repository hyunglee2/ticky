import { useState } from "react";
import type { LiveStatus, WatchItem } from "../market/types";
import { SCALES } from "../scale";
import { inTauri } from "../clickThrough";

interface Props {
  canAdd: boolean;
  onAdd: (item: WatchItem) => void;
  followHours: boolean;
  onFollowHours: (on: boolean) => void;
  scale: number;
  onScale: (scale: number) => void;
  liveStatus: LiveStatus;
}

const LIVE_TEXT: Record<LiveStatus, string> = {
  off: "",
  connecting: "연결 중…",
  ok: "연결됨",
  "rate-limit": "요청이 너무 많아요. 잠시 후 다시 시도해요",
  error: "연결할 수 없어요",
};

export function Toolbar({ canAdd, onAdd, followHours, onFollowHours, scale, onScale, liveStatus }: Props) {
  const [panel, setPanel] = useState<"none" | "add" | "settings">("none");
  const [text, setText] = useState("");

  const submit = () => {
    const name = text.trim();
    if (!name) return;
    // a 6-digit code is a KRX listing; anything else is used as a ticker / name as typed
    onAdd({ symbol: /^\d{6}$/.test(name) ? name : name.toUpperCase(), name });
    setText("");
    setPanel("none");
  };

  return (
    <div className="toolbar">
      <div className="grip" data-tauri-drag-region title="끌어서 옮기기">⋮⋮</div>
      <button
        type="button"
        className="tool"
        disabled={!canAdd}
        title={canAdd ? "종목 추가" : "최대 5개까지 볼 수 있어요"}
        onClick={() => setPanel(panel === "add" ? "none" : "add")}
      >＋</button>
      <button type="button" className="tool" title="설정" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>⚙</button>

      {panel === "add" && (
        <form className="panel" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="종목 이름 또는 코드"
            maxLength={16}
          />
          <button type="submit">추가</button>
        </form>
      )}
      {panel === "settings" && (
        <div className="panel">
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

          <div className="keybox">
            <div className="keybox-title">
              미국 주식 · Yahoo
              <span className={`live live-${liveStatus}`}>{LIVE_TEXT[liveStatus]}</span>
            </div>
            <p className="hint">
              {inTauri()
                ? "장 전·장 후 가격까지 15초마다 받아요. 한국 종목은 아직 가짜 시세예요."
                : "실제 시세는 데스크탑 앱에서만 받아요."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
