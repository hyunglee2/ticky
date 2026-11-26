import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../clickThrough";
import logo from "../../design/ticky-logo.svg";
import type { Layout } from "../sync";

interface Props {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  /** open the settings window (watchlist, screen, price sources) */
  onSettings: () => void;
  /** the logo was dragged to another monitor: move the Tickies there ("" = the primary one) */
  onMove: (monitor: string) => void;
}

const DRAG_PX = 8; // further than this from where it was pressed: a drag, not a click

/**
 * The bottom-right corner: just a small Ticky. Click or right-click it for a short menu:
 * open the settings window, or switch 출근 / 퇴근 straight away.
 * Drag it onto another monitor and the Tickies move house there.
 */
export function Toolbar({ layout, onLayout, onSettings, onMove }: Props) {
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const press = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false); // swallow the click that ends a drag

  // the menu closes on Esc or a click anywhere else: in this window, or out on the desktop or
  // another app (the click goes straight through to them, so this window loses focus)
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".toolbar")) setMenu(false);
    };
    const lostFocus = () => setMenu(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", lostFocus);
    };
  }, [menu]);

  // a drag: the cursor soon leaves this strip, so the Rust side watches for the button coming up
  // and says which monitor it was let go on
  const startMove = () => {
    setMenu(false);
    setMoving(true);
    dragged.current = true;
    invoke<{ name: string; primary: boolean } | null>("await_logo_drop")
      .then((drop) => { if (drop) onMove(drop.primary ? "" : drop.name); })
      .catch(() => {})
      .finally(() => setMoving(false));
  };

  return (
    <div className="toolbar" data-moving={moving ? "1" : undefined}>
      {moving && <div className="move-hint">다른 화면에 놓으면 이사해요</div>}
      <button
        type="button"
        className={menu || moving ? "logo on" : "logo"}
        title="티키 메뉴 (클릭 또는 우클릭) · 다른 화면으로 끌어 옮기기"
        aria-label="티키 메뉴"
        aria-expanded={menu}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId); // a quick flick still counts as a drag
          press.current = { x: e.clientX, y: e.clientY };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || moving || !inTauri()) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) {
            press.current = null;
            startMove();
          }
        }}
        onPointerUp={() => { press.current = null; }}
        onClick={() => {
          if (dragged.current) { dragged.current = false; return; }
          setMenu(!menu);
        }}
        onContextMenu={(e) => { e.preventDefault(); setMenu(!menu); }}
      >
        <img src={logo} alt="" draggable={false} />
      </button>
      {menu && (
        <div className="menu logo-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onSettings(); }}>설정</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenu(false); onLayout(layout === "roam" ? "prices" : "roam"); }}
          >{layout === "roam" ? "티키 퇴근 (시세만 보기)" : "티키 출근 (돌아다니기)"}</button>
        </div>
      )}
    </div>
  );
}
