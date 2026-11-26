"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../Icons";
import { onEscapeCapture, place, type Placement } from "./floating";

export type MenuItem =
  | { sep: true; key: string }
  | { sep?: false; key: string; label: string; icon?: ReactNode; onSelect?: () => void; hint?: ReactNode; danger?: boolean; disabled?: boolean; checked?: boolean; submenu?: { title: string; items: MenuItem[] } };
export type MenuState = { x: number; y: number; title?: string; items: MenuItem[] } | null;

type Panel = { title?: string; items: MenuItem[] };
const actionable = (m: MenuItem): m is Exclude<MenuItem, { sep: true }> => !m.sep && !m.disabled;

/**
 * site-styled context menu: opens at a point, flips near the viewport edges, closes on Esc / outside
 * click / scroll, full keyboard support (↑↓ Home End, Enter, → into a submenu, ← back).
 */
export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  return typeof document === "undefined" ? null : createPortal(<AnimatePresence>{state && <MenuView key={`${state.x},${state.y}`} state={state} onClose={onClose} />}</AnimatePresence>, document.body);
}

function MenuView({ state, onClose }: { state: NonNullable<MenuState>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<Panel[]>([{ title: state.title, items: state.items }]);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Placement | null>(null);
  const panel = stack[stack.length - 1];
  const prevFocus = useRef<Element | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setPos(place({ x: state.x, y: state.y, w: 0, h: 0 }, { w: el.offsetWidth, h: el.offsetHeight }, { gap: 2 }));
  }, [state.x, state.y]);
  useLayoutEffect(measure, [measure, stack.length]);
  // focus once placed (a visibility:hidden element cannot take focus) so the keyboard works right away
  const placed = !!pos;
  useEffect(() => {
    if (placed) ref.current?.focus({ preventScroll: true });
  }, [placed, stack.length]);

  useEffect(() => {
    prevFocus.current = document.activeElement;
    const off = onEscapeCapture(onClose);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onScroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", onDown, true);
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", onClose);
    addEventListener("blur", onClose);
    return () => {
      off();
      document.removeEventListener("pointerdown", onDown, true);
      removeEventListener("scroll", onScroll, true);
      removeEventListener("resize", onClose);
      removeEventListener("blur", onClose);
      const p = prevFocus.current as HTMLElement | null;
      if (p && document.contains(p)) p.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const choose = (m: MenuItem) => {
    if (!actionable(m)) return;
    if (m.submenu) {
      setStack((s) => [...s, m.submenu!]);
      setActive(0);
      return;
    }
    onClose();
    m.onSelect?.();
  };
  const back = () => {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
      setActive(0);
    }
  };
  const move = (d: number) => {
    const n = panel.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((active < 0 && d < 0 ? n : active) + d * k) % n + n) % n;
      if (actionable(panel.items[i])) return setActive(i);
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowDown") (e.preventDefault(), move(1));
    else if (k === "ArrowUp") (e.preventDefault(), move(-1));
    else if (k === "Home") (e.preventDefault(), setActive(-1), move(1));
    else if (k === "End") (e.preventDefault(), setActive(-1), move(-1));
    else if (k === "Enter" || k === " ") (e.preventDefault(), active >= 0 && choose(panel.items[active]));
    else if (k === "ArrowRight") {
      const m = panel.items[active];
      if (m && actionable(m) && m.submenu) (e.preventDefault(), choose(m));
    } else if (k === "ArrowLeft" || k === "Backspace") (e.preventDefault(), back());
    else if (k === "Tab") (e.preventDefault(), onClose());
  };

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label={panel.title ?? "菜单"}
      tabIndex={-1}
      className="pop ctx"
      style={{ left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? "visible" : "hidden", transformOrigin: pos ? `${pos.originX} ${pos.originY}` : "left top", maxHeight: pos?.maxH }}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
      transition={{ type: "spring", stiffness: 560, damping: 34 }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stack.length > 1 ? (
        <button type="button" className="pop-item" role="menuitem" onClick={back}>
          <span className="pop-ic"><ChevronLeftIcon /></span>
          <span className="pop-l">{panel.title}</span>
        </button>
      ) : (
        panel.title && <div className="pop-head">{panel.title}</div>
      )}
      {stack.length > 1 && <div className="pop-sep" />}
      {panel.items.map((m, i) =>
        m.sep ? (
          <div key={m.key} className="pop-sep" role="separator" />
        ) : (
          <button
            key={m.key}
            type="button"
            role={m.checked != null ? "menuitemradio" : "menuitem"}
            aria-checked={m.checked}
            aria-haspopup={m.submenu ? "menu" : undefined}
            disabled={m.disabled}
            className={cn("pop-item", i === active && "act", m.danger && "danger")}
            onPointerMove={() => active !== i && setActive(i)}
            onClick={() => choose(m)}
          >
            <span className="pop-ic">{m.icon}</span>
            <span className="pop-l">{m.label}</span>
            {m.hint}
            {m.checked && <CheckIcon className="pop-ck" />}
            {m.submenu && <ChevronRightIcon className="pop-ck" style={{ color: "var(--text3)" }} />}
          </button>
        ),
      )}
    </motion.div>
  );
}

/* ---------------- touch long-press ---------------- */

/** shared with the sortable lists: is a drag running right now? */
export const dragState = { active: false };
/** a lifted card is put back when its context menu opens (long-press, or Android's native contextmenu on a held link) */
export function cancelDrag() {
  if (dragState.active) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
}

/**
 * long-press on touch screens: hold still ~0.5s → `cb(x, y)`. Moving the finger first (scroll, or a
 * drag once the sortable list picked it up) cancels it. A drag that was lifted is cancelled with Esc.
 */
export function useLongPress(cb: ((x: number, y: number) => void) | null, ms = 520) {
  const st = useRef<{ t?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false });
  const clear = () => st.current.t && clearTimeout(st.current.t);
  if (!cb) return {};
  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return clear();
      const t = e.touches[0];
      st.current = { x: t.clientX, y: t.clientY, fired: false };
      st.current.t = setTimeout(() => {
        st.current.fired = true;
        cancelDrag();
        navigator.vibrate?.(8);
        cb(st.current.x, st.current.y);
      }, ms);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t && Math.hypot(t.clientX - st.current.x, t.clientY - st.current.y) > 8) clear();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      clear();
      if (st.current.fired && e.cancelable) e.preventDefault(); // no click / navigation after the menu opened
    },
    onTouchCancel: clear,
    onClickCapture: (e: React.MouseEvent) => {
      if (st.current.fired) {
        e.preventDefault();
        e.stopPropagation();
        st.current.fired = false;
      }
    },
  };
}
