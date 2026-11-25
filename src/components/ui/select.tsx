"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "../Icons";
import { onEscapeCapture, place, type Placement } from "./floating";

export type SelectOption = { value: string; label: string; icon?: ReactNode; hint?: string; disabled?: boolean };

/**
 * Site-styled replacement for the native <select>: a button + a portalled listbox that flips near the
 * viewport edges. Keyboard: ↑/↓/Home/End/type-ahead, Enter/Space to pick, Esc/Tab to close. Works with touch.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "请选择",
  className,
  ariaLabel,
  size,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  size?: "sm";
  disabled?: boolean;
  id?: string;
}) {
  const uid = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<(Placement & { w: number }) | null>(null);
  const typed = useRef({ s: "", t: 0 });
  const cur = options.find((o) => o.value === value);

  const reposition = useCallback(() => {
    const b = btnRef.current, l = listRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const w = Math.max(r.width, 160);
    const h = l ? l.scrollHeight : Math.min(options.length * 40 + 12, 320);
    setPos({ ...place({ x: r.left, y: r.top, w: r.width, h: r.height }, { w, h: Math.min(h, 320) }), w });
  }, [options.length]);

  const show = (idx?: number) => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(idx ?? (i >= 0 ? i : 0));
    reposition();
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btnRef.current?.focus({ preventScroll: true });
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const off = onEscapeCapture(() => close());
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => reposition();
    document.addEventListener("pointerdown", onDown, true);
    addEventListener("resize", onMove);
    addEventListener("scroll", onMove, true);
    return () => {
      off();
      document.removeEventListener("pointerdown", onDown, true);
      removeEventListener("resize", onMove);
      removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reposition]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const step = (from: number, d: number) => {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + d * k + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => step(a, 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => step(a, -1)));
    else if (e.key === "Home") (e.preventDefault(), setActive(step(-1, 1)));
    else if (e.key === "End") (e.preventDefault(), setActive(step(options.length, -1)));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), pick(active));
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key.toLowerCase(), t: now };
      const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={cn("sel-btn", size === "sm" && "sm", open && "open", className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? uid : undefined}
        aria-activedescendant={open && active >= 0 ? `${uid}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        {cur?.icon && <span className="sel-ic">{cur.icon}</span>}
        <span className={cn("sel-v", !cur && "ph")}>{cur?.label ?? placeholder}</span>
        <ChevronDownIcon className="sel-chev" />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={listRef}
                id={uid}
                role="listbox"
                aria-label={ariaLabel}
                className="pop sel-pop"
                style={{ left: pos.left, top: pos.top, minWidth: pos.w, maxHeight: Math.min(320, pos.maxH), transformOrigin: `${pos.originX} ${pos.originY}` }}
                initial={{ opacity: 0, scale: 0.96, y: pos.originY === "top" ? -4 : 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                transition={{ type: "spring", stiffness: 520, damping: 34 }}
                onKeyDown={onKey}
              >
                {options.map((o, i) => (
                  <div
                    key={o.value + i}
                    id={`${uid}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled || undefined}
                    className={cn("pop-item", i === active && "act", o.disabled && "dis")}
                    onPointerMove={() => active !== i && setActive(i)}
                    onClick={() => pick(i)}
                  >
                    {o.icon && <span className="pop-ic">{o.icon}</span>}
                    <span className="pop-l">{o.label}</span>
                    {o.hint && <small>{o.hint}</small>}
                    {o.value === value && <CheckIcon className="pop-ck" />}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/**
 * One listbox shared by many trigger buttons (v0.4.0): long tables render a plain `SelectTrigger` per row and a
 * single `SharedSelect`, instead of a full Select (state, effects, portal) in every row. Same look and keys.
 */
export function SelectTrigger({ value, options, ariaLabel, size, className, onOpen, open }: { value: string; options: SelectOption[]; ariaLabel?: string; size?: "sm"; className?: string; open?: boolean; onOpen: (el: HTMLButtonElement, key?: string) => void }) {
  const cur = options.find((o) => o.value === value);
  return (
    <button
      type="button"
      className={cn("sel-btn", size === "sm" && "sm", open && "open", className)}
      aria-haspopup="listbox"
      aria-expanded={!!open}
      aria-label={ariaLabel}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (open) return;
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          onOpen(e.currentTarget, e.key);
        }
      }}
    >
      {cur?.icon && <span className="sel-ic">{cur.icon}</span>}
      <span className={cn("sel-v", !cur && "ph")}>{cur?.label ?? "请选择"}</span>
      <ChevronDownIcon className="sel-chev" />
    </button>
  );
}

export function SharedSelect({ anchor, value, options, ariaLabel, onPick, onClose }: { anchor: HTMLElement | null; value: string; options: SelectOption[]; ariaLabel?: string; onPick: (v: string) => void; onClose: () => void }) {
  const uid = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<(Placement & { w: number }) | null>(null);
  const typed = useRef({ s: "", t: 0 });
  const open = !!anchor;

  const reposition = useCallback(() => {
    const b = anchor, l = listRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const w = Math.max(r.width, 160);
    const h = l ? l.scrollHeight : Math.min(options.length * 40 + 12, 320);
    setPos({ ...place({ x: r.left, y: r.top, w: r.width, h: r.height }, { w, h: Math.min(h, 320) }), w });
  }, [anchor, options.length]);

  const close = useCallback(
    (focus = true) => {
      if (focus) anchor?.focus({ preventScroll: true });
      onClose();
    },
    [anchor, onClose],
  );
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onPick(o.value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor]);

  const step = (from: number, d: number) => {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + d * k + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  };
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => step(a, 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => step(a, -1)));
    else if (e.key === "Home") (e.preventDefault(), setActive(step(-1, 1)));
    else if (e.key === "End") (e.preventDefault(), setActive(step(options.length, -1)));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), pick(active));
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : "") + e.key.toLowerCase(), t: now };
      const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };

  useEffect(() => {
    if (!open) return;
    const off = onEscapeCapture(() => close());
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || anchor?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => keys.current(e);
    const onMove = () => reposition();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    addEventListener("resize", onMove);
    addEventListener("scroll", onMove, true);
    return () => {
      off();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      removeEventListener("resize", onMove);
      removeEventListener("scroll", onMove, true);
    };
  }, [open, anchor, close, reposition]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={listRef}
          id={uid}
          role="listbox"
          aria-label={ariaLabel}
          className="pop sel-pop"
          style={{ left: pos.left, top: pos.top, minWidth: pos.w, maxHeight: Math.min(320, pos.maxH), transformOrigin: `${pos.originX} ${pos.originY}` }}
          initial={{ opacity: 0, scale: 0.96, y: pos.originY === "top" ? -4 : 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
        >
          {options.map((o, i) => (
            <div
              key={o.value + i}
              id={`${uid}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={cn("pop-item", i === active && "act", o.disabled && "dis")}
              onPointerMove={() => active !== i && setActive(i)}
              onClick={() => pick(i)}
            >
              {o.icon && <span className="pop-ic">{o.icon}</span>}
              <span className="pop-l">{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
              {o.value === value && <CheckIcon className="pop-ck" />}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
