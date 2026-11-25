"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/*
 * Window virtualisation (v0.4.0): only the cards near the viewport are in the DOM; spacers (padding) keep the
 * page as tall as the full list, so the scrollbar, "back to top" and scroll position behave as before.
 * Both lists scroll with the page (no inner scroll box, no overflow / contain / content-visibility on any
 * ancestor), so the hover lift and its shadow are never clipped (v0.3.1).
 */

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** viewport [top, bottom] relative to `ref`, in px, rounded out to `quantum` so scrolling re-renders rarely */
export function useViewWindow(ref: React.RefObject<HTMLElement | null>, quantum: number, enabled = true) {
  const [win, setWin] = useState<[number, number] | null>(null);
  const q = Math.max(40, quantum);
  useIso(() => {
    if (!enabled) return;
    let raf = 0;
    const calc = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const top = -el.getBoundingClientRect().top;
      const a = Math.floor(top / q) * q, b = Math.ceil((top + innerHeight) / q) * q;
      setWin((w) => (w && w[0] === a && w[1] === b ? w : [a, b]));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    const ro = new ResizeObserver(on);
    if (ref.current) ro.observe(ref.current);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
      ro.disconnect();
    };
  }, [ref, q, enabled]);
  return win;
}

/** the entrance animation (CSS only) runs for the first cards of a freshly mounted list, never on scroll */
export function useEntrance(ms = 1500) {
  const until = useRef<number>(0);
  if (!until.current) until.current = (typeof performance !== "undefined" ? performance.now() : 0) + ms;
  return useCallback((i: number) => i < 20 && (typeof performance === "undefined" || performance.now() < until.current), []);
}

/** lists up to this size are rendered whole (windowing costs more than it saves for a few screens of cards) */
export const RENDER_ALL = 200;

/* ------------------------------------------------------------------------------------------------ */

type GridMetrics = { cols: number; pitch: number };
let lastGrid: GridMetrics | null = null;
let hydrated = false;
/** server render / hydration: the first rows, assuming a typical desktop width */
const SSR_COLS = 8, SSR_PITCH = 134, FIRST = 64;

/** a few rows of cards; memoised so a scroll step only mounts / unmounts the chunks entering / leaving the window */
const ROWS_PER_CHUNK = 4;
type ChunkProps = { items: { id: string }[]; from: number; to: number; render: (item: never, index: number) => ReactNode };
const GridChunk = memo(function GridChunk({ items, from, to, render }: ChunkProps) {
  return <>{items.slice(from, to).map((it, k) => render(it as never, from + k))}</>;
});

/**
 * site grid, virtualised by rows. The rows that are rendered sit in one normal `.sites` CSS grid, so the
 * layout is exactly the auto-fill grid of v0.3.1 (fills from the left, short rows stay left-aligned).
 */
export function VirtualGrid<T extends { id: string }>({ items, total, render, className = "sites" }: { items: T[]; total?: number; render: (item: T, index: number) => ReactNode; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<GridMetrics | null>(() => (hydrated ? lastGrid : null));
  const count = Math.max(items.length, total ?? 0);
  const measure = useCallback(() => {
    const g = grid.current;
    if (!g) return;
    const cs = getComputedStyle(g);
    const cols = Math.max(1, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
    const first = g.firstElementChild as HTMLElement | null;
    const gap = parseFloat(cs.rowGap) || 0;
    const h = first ? first.getBoundingClientRect().height : 0;
    if (!h) return;
    const next = { cols, pitch: h + gap };
    lastGrid = next;
    setM((o) => (o && o.cols === next.cols && Math.abs(o.pitch - next.pitch) < 0.5 ? o : next));
  }, []);
  useIso(() => {
    hydrated = true;
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [measure]);
  useIso(() => {
    if (!m) measure();
  });
  const pitch = m?.pitch ?? SSR_PITCH, cols = m?.cols ?? SSR_COLS;
  const all = count <= RENDER_ALL;
  const win = useViewWindow(wrap, pitch * ROWS_PER_CHUNK, !!m && !all);
  const rows = Math.ceil(count / cols);
  let r0 = 0, r1 = Math.ceil(Math.min(count, FIRST) / cols);
  if (all) r1 = rows;
  else if (m && win) {
    const over = Math.max(innerHeight * 0.75, pitch * 2);
    r0 = Math.max(0, Math.floor((win[0] - over) / pitch / ROWS_PER_CHUNK) * ROWS_PER_CHUNK);
    r1 = Math.min(rows, Math.ceil((win[1] + over) / pitch / ROWS_PER_CHUNK) * ROWS_PER_CHUNK);
    if (r1 < r0) r1 = r0;
  }
  const chunks: ReactNode[] = [];
  for (let r = r0; r < r1; r += ROWS_PER_CHUNK) {
    const from = r * cols, to = Math.min(items.length, Math.min(r + ROWS_PER_CHUNK, r1) * cols);
    if (from < to) chunks.push(<GridChunk key={r} items={items} from={from} to={to} render={render as ChunkProps["render"]} />);
  }
  return (
    <div ref={wrap} data-n={count} style={{ paddingTop: r0 * pitch, paddingBottom: Math.max(0, rows - r1) * pitch }}>
      <div ref={grid} className={className}>
        {chunks}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

const heightCache = new Map<string, number>();
const MCell = memo(function MCell({ item, i, render }: { item: { id: string }; i: number; render: (item: never, index: number) => ReactNode }) {
  return <>{render(item as never, i)}</>;
});

/** columns that fit, from the width of the content column (so the first render already has the right count) */
export function masonryCols(width: number, min = 290, gap = 16) {
  return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

/**
 * masonry in reading order (item i → column i % cols), virtualised per column: each column renders the
 * cards that overlap the viewport, with padding standing in for the rest. Card heights are measured as they
 * render (ResizeObserver) and remembered; unseen cards use the average height.
 */
export function VirtualMasonry<T extends { id: string }>({
  items,
  render,
  min = 290,
  gap = 16,
  jump,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  min?: number;
  gap?: number;
  /** scroll so that this item is in view (changes of `n` repeat the jump) */
  jump?: { id: string; n: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(() => (typeof document === "undefined" ? 3 : masonryCols((document.querySelector(".layout > .content") as HTMLElement | null)?.clientWidth ?? 900, min, gap)));
  const [tick, setTick] = useState(0);
  const pending = useRef(0);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setCols(masonryCols(el.clientWidth, min, gap));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min, gap]);

  // measure rendered cards
  const ro = useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            let changed = false;
            for (const e of entries) {
              const id = (e.target as HTMLElement).dataset.vid;
              if (!id) continue;
              const h = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight;
              if (!h) continue;
              if (Math.abs((heightCache.get(id) ?? -1) - h) > 0.5) {
                heightCache.set(id, h);
                changed = true;
              }
            }
            if (changed && !pending.current) pending.current = requestAnimationFrame(() => ((pending.current = 0), setTick((t) => t + 1)));
          }),
    [],
  );
  useEffect(() => () => {
    ro?.disconnect();
    cancelAnimationFrame(pending.current);
  }, [ro]);
  const nodes = useRef(new Map<string, HTMLElement>());
  const cbs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const refFor = (id: string) => {
    let cb = cbs.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        const prev = nodes.current.get(id);
        if (prev && prev !== el) ro?.unobserve(prev);
        if (el) {
          el.dataset.vid = id;
          nodes.current.set(id, el);
          ro?.observe(el);
        } else {
          nodes.current.delete(id);
          cbs.current.delete(id);
        }
      };
      cbs.current.set(id, cb);
    }
    return cb;
  };

  // column layout from known / estimated heights
  const layout = useMemo(() => {
    let sum = 0, n = 0;
    for (const it of items) {
      const h = heightCache.get(it.id);
      if (h) (sum += h), n++;
    }
    const est = n ? sum / n : 360;
    const colIdx: number[][] = Array.from({ length: cols }, () => []);
    const offs: number[][] = Array.from({ length: cols }, () => [0]);
    items.forEach((it, i) => {
      const c = i % cols;
      colIdx[c].push(i);
      const o = offs[c];
      o.push(o[o.length - 1] + (heightCache.get(it.id) ?? est) + gap);
    });
    return { colIdx, offs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, gap, tick]);

  // content cards are heavy (cover, summary, tags): window them as soon as there are more than a few screens
  const all = items.length <= 30;
  const win = useViewWindow(ref, 400, !all);

  // jump to an item (⌘K): scroll to its estimated place, then correct as the cards around it get measured
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const lastJump = useRef<string>("");
  useEffect(() => {
    if (!jump) return;
    const key = `${jump.id}:${jump.n}`;
    if (lastJump.current === key) return;
    const i = items.findIndex((x) => x.id === jump.id);
    if (i < 0 || !ref.current) return;
    lastJump.current = key;
    let tries = 0;
    const go = () => {
      const el = nodes.current.get(jump.id);
      if (el && tries > 0) {
        el.scrollIntoView({ block: "center" });
        const card = el.querySelector(".item");
        card?.classList.add("flash");
        setTimeout(() => card?.classList.remove("flash"), 1700);
        return;
      }
      if (!ref.current || tries++ > 12) return;
      const L = layoutRef.current, c = i % L.offs.length, r = Math.floor(i / L.offs.length);
      const y = ref.current.getBoundingClientRect().top + scrollY + (L.offs[c][r] ?? 0);
      scrollTo({ top: Math.max(0, y - innerHeight / 3), behavior: "auto" });
      window.setTimeout(go, 90);
    };
    go();
  }, [jump, items]);

  const over = typeof window === "undefined" ? 0 : innerHeight * 0.75;
  const top = all || !win ? -Infinity : win[0] - over, bottom = all ? Infinity : win ? win[1] + over : 1600;
  const lower = (o: number[], y: number) => {
    // first k with o[k+1] > y  (card k ends below y)
    let lo = 0, hi = o.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (o[mid + 1] - gap > y) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  return (
    <div ref={ref} className="masonry" style={{ gap }} data-n={items.length}>
      {layout.colIdx.map((idx, c) => {
        const o = layout.offs[c];
        const len = idx.length;
        const s = top === -Infinity ? 0 : Math.min(len, lower(o, top));
        let e = s;
        while (e < len && o[e] < bottom) e++;
        return (
          <div key={c} className="mcol" style={{ gap, paddingTop: o[s], paddingBottom: Math.max(0, o[len] - o[e]) }}>
            {idx.slice(s, e).map((i) => (
              <div key={items[i].id} ref={refFor(items[i].id)}>
                <MCell item={items[i]} i={i} render={render as (item: never, index: number) => ReactNode} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
