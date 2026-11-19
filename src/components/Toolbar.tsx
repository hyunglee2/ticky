import { useState } from "react";
import type { WatchItem } from "../market/types";
import { SCALES } from "../scale";

interface Props {
  canAdd: boolean;
  onAdd: (item: WatchItem) => void;
  followHours: boolean;
  onFollowHours: (on: boolean) => void;
  scale: number;
  onScale: (scale: number) => void;
}

export function Toolbar({ canAdd, onAdd, followHours, onFollowHours, scale, onScale }: Props) {
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
          <p className="hint">지금은 가짜 시세로 움직여요.</p>
        </div>
      )}
    </div>
  );
}
