// Where a drawn Ticky really ends at the top (wick, hat, costume, star, sparks, anything it wears),
// in its SVG units (viewBox 0..140, feet on y=132). Measured from the rendered drawing, so speech
// bubbles and cards sit above whatever it has on instead of a guess per item.
import { useLayoutEffect, useState, type RefObject } from "react";

const SLACK = 2; // outlines are drawn half outside the shapes getBBox reports

export function drawnTop(container: Element | null): number | null {
  const g = container?.querySelector("svg > g") as SVGGraphicsElement | null;
  if (!g) return null;
  try {
    const box = g.getBBox();
    return box.height > 0 ? box.y - SLACK : null;
  } catch {
    return null; // not laid out (hidden): the caller keeps its estimate
  }
}

/** the measured top of the drawing in `ref`, re-measured whenever `markup` changes */
export function useDrawnTop(ref: RefObject<Element | null>, markup: string): number | null {
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => { setTop(drawnTop(ref.current)); }, [ref, markup]);
  return top;
}
