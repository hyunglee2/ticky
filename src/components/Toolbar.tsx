import { useEffect, useState } from "react";
import { tickySvg } from "../ticky/art";
import type { Layout } from "../sync";

interface Props {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  /** open the settings window (watchlist, screen, price sources) */
  onSettings: () => void;
}

// the little Ticky in the corner that everything is managed from (static markup from art.ts)
const LOGO = tickySvg("good", "up", "티키 메뉴");

/**
 * The bottom-right corner: just a small Ticky. Click or right-click it for a short menu:
 * open the settings window, or switch 출근 / 퇴근 straight away.
 */
export function Toolbar({ layout, onLayout, onSettings }: Props) {
  const [menu, setMenu] = useState(false);

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

  return (
    <div className="toolbar">
      <button
        type="button"
        className={menu ? "logo on" : "logo"}
        title="티키 메뉴 (클릭 또는 우클릭)"
        aria-label="티키 메뉴"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
        onContextMenu={(e) => { e.preventDefault(); setMenu(!menu); }}
        dangerouslySetInnerHTML={{ __html: LOGO }}
      />
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
