"use client";
/** pure placement maths for popovers / menus: prefer below+start, flip to the other side near edges, clamp into the viewport */
export type Anchor = { x: number; y: number; w: number; h: number };
export type Placement = { left: number; top: number; maxH: number; originX: "left" | "right"; originY: "top" | "bottom" };

export function place(a: Anchor, size: { w: number; h: number }, opts: { gap?: number; pad?: number } = {}): Placement {
  const gap = opts.gap ?? 6, pad = opts.pad ?? 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const below = vh - (a.y + a.h) - gap - pad, above = a.y - gap - pad;
  const down = size.h <= below || below >= above;
  const maxH = Math.max(120, down ? below : above);
  const h = Math.min(size.h, maxH);
  const top = down ? a.y + a.h + gap : a.y - gap - h;
  let left = a.x, originX: Placement["originX"] = "left";
  if (left + size.w > vw - pad) {
    // flip to the left of the anchor's right edge (point anchors: open towards the left)
    left = a.x + a.w - size.w;
    originX = "right";
  }
  left = Math.max(pad, Math.min(left, vw - pad - size.w));
  return { left, top: Math.max(pad, top), maxH, originX, originY: down ? "top" : "bottom" };
}

/** Escape handling for stacked layers: the top-most layer handles the key and stops it reaching window listeners (drawer, modal) */
export function onEscapeCapture(fn: () => void) {
  const h = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    fn();
  };
  document.addEventListener("keydown", h, true);
  return () => document.removeEventListener("keydown", h, true);
}
