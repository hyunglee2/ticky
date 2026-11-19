// Size setting: the whole stage is drawn at a fixed base size and scaled as one piece,
// and the desktop window is resized to match, keeping its bottom-right corner in place.
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { inTauri } from "./clickThrough";

/** Base layout size in CSS px at 100%. Keep in sync with src-tauri/tauri.conf.json. */
export const BASE_W = 600;
export const BASE_H = 270;

export const SCALES = [
  { value: 0.8, label: "작게" },
  { value: 1, label: "보통" },
  { value: 1.25, label: "크게" },
  { value: 1.5, label: "아주 크게" },
] as const;

export async function applyScale(scale: number) {
  document.documentElement.style.setProperty("--scale", String(scale));
  if (!inTauri()) return;
  const win = getCurrentWindow();
  const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  const right = pos.x + size.width;
  const bottom = pos.y + size.height;
  await win.setSize(new LogicalSize(Math.round(BASE_W * scale), Math.round(BASE_H * scale)));
  const next = await win.outerSize();
  await win.setPosition(new PhysicalPosition(right - next.width, bottom - next.height));
}
