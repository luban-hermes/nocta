"use client";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToVerticalAxis } from "./sortable-modifiers";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { dragState } from "./context-menu";

/*
 * Phone-style drag to reorder (dnd-kit): mouse drags after 6px, touch lifts after a short hold
 * (moving earlier scrolls the page instead), keyboard: focus an item, Space to lift, arrows, Space to drop.
 * Holding still longer opens the context menu instead (see useLongPress), which cancels the lift.
 * The lifted card is drawn by a DragOverlay portalled to <body>, so no parent's overflow /
 * content-visibility (paint containment) can clip it; the original slot stays as a faded placeholder.
 */

/** swallow the click that follows a mouse drag so a dragged link does not open */
function eatNextClick() {
  const h = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener("click", h, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", h, { capture: true }), 120);
}

const Enabled = createContext(false);

export function SortList({
  ids,
  enabled,
  onReorder,
  axis,
  overlay,
  children,
}: {
  ids: string[];
  enabled: boolean;
  onReorder: (ids: string[], moved: { id: string; from: number; to: number }) => void;
  axis?: "x" | "y";
  /** what the lifted item looks like while it follows the pointer (rendered in a portal) */
  overlay?: (id: string) => ReactNode;
  children: ReactNode;
}) {
  const [active, setActive] = useState<UniqueIdentifier | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  if (!enabled) return <Enabled.Provider value={false}>{children}</Enabled.Provider>;
  const end = (e: DragEndEvent) => {
    dragState.active = false;
    setActive(null);
    document.body.classList.remove("is-sorting");
    if (e.activatorEvent instanceof MouseEvent) eatNextClick();
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to), { id: String(active.id), from, to });
  };
  return (
    <Enabled.Provider value>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={axis === "x" ? [restrictToHorizontalAxis] : axis === "y" ? [restrictToVerticalAxis] : undefined}
        onDragStart={(e: DragStartEvent) => {
          dragState.active = true;
          setActive(e.active.id);
          document.body.classList.add("is-sorting");
          if (!(e.activatorEvent instanceof KeyboardEvent)) navigator.vibrate?.(6);
        }}
        onDragEnd={end}
        onDragCancel={() => {
          dragState.active = false;
          setActive(null);
          document.body.classList.remove("is-sorting");
        }}
        accessibility={{
          screenReaderInstructions: { draggable: "按空格键拿起，方向键移动，再按空格键放下，Esc 取消。" },
          announcements: {
            onDragStart: () => "已拿起",
            onDragOver: () => "",
            onDragEnd: ({ over }) => (over ? "已放下" : "已取消"),
            onDragCancel: () => "已取消",
          },
        }}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          {children}
        </SortableContext>
        {mounted &&
          overlay &&
          createPortal(
            <DragOverlay className="drag-overlay" zIndex={90} dropAnimation={{ duration: 220, easing: "cubic-bezier(.22,1,.36,1)" }}>
              {active != null ? <div className="drag-lift">{overlay(String(active))}</div> : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </Enabled.Provider>
  );
}

type H<E> = (e: E) => void;
export type HandleProps = {
  onMouseDown?: H<React.MouseEvent>;
  onTouchStart?: H<React.TouchEvent>;
  onTouchMove?: H<React.TouchEvent>;
  onTouchEnd?: H<React.TouchEvent>;
  onTouchCancel?: H<React.TouchEvent>;
  onKeyDown?: H<React.KeyboardEvent>;
  onClickCapture?: H<React.MouseEvent>;
  "aria-describedby"?: string;
};

/** combine several prop bags; handlers with the same name all run (drag sensor + long-press + own) */
export function mergeHandlers(...bags: (HandleProps | Record<string, unknown> | undefined)[]): HandleProps {
  const out: Record<string, unknown> = {};
  for (const b of bags)
    for (const [k, v] of Object.entries(b ?? {})) {
      const prev = out[k];
      out[k] = typeof prev === "function" && typeof v === "function" ? (...a: unknown[]) => (prev(...a), v(...a)) : v;
    }
  return out as HandleProps;
}

/**
 * one sortable item. `children` gets the props to spread on the element that should start the drag
 * (usually the card itself), so no extra tab stop or role is added.
 */
export function SortItem({ id, className, style, children, as = "div" }: { id: string; className?: string; style?: CSSProperties; as?: "div" | "li"; children: (h: HandleProps, dragging: boolean) => ReactNode }) {
  const enabled = useContext(Enabled);
  return enabled ? <Live id={id} className={className} style={style} as={as}>{children}</Live> : as === "li" ? <li className={className} style={style}>{children({}, false)}</li> : <div className={className} style={style}>{children({}, false)}</div>;
}

function Live({ id, className, style, as, children }: { id: string; className?: string; style?: CSSProperties; as: "div" | "li"; children: (h: HandleProps, dragging: boolean) => ReactNode }) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, transition: { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" } });
  const s: CSSProperties = { ...style, transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 30 : undefined, position: "relative", touchAction: "manipulation" };
  const handle = { ...(listeners as HandleProps), "aria-describedby": attributes["aria-describedby"] } as HandleProps;
  const Tag = as;
  return (
    <Tag ref={setNodeRef as never} className={cn("sort-item", isDragging && "is-dragging", className)} style={s}>
      {children(handle, isDragging)}
    </Tag>
  );
}
