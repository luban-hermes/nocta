"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MonitorDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "./ui/modal";
import { SearchIcon } from "./Icons";
import { StatusDot, Tile } from "./Cards";

type Hit = { key: string; group: string; title: string; sub: string; icon: ReactNode; run: () => void };
type SearchRes = { q: string; sites: { id: string; name: string; url: string; icon: string }[]; contents: { id: string; title: string; domain: string; tags: string[]; icon: string }[] };

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/*
 * icons of an answer are fetched and decoded before the answer is shown, so its rows (icons included) paint in
 * one frame — without this every icon that arrived later cost one more frame of the blurred glass dialog, and the
 * first keystrokes after opening waited behind those frames (v0.4.1)
 */
const decoded = new Set<string>();
function iconsReady(r: SearchRes, ms = 150): Promise<void> {
  const urls = [...new Set([...r.sites.map((x) => x.icon), ...r.contents.map((x) => x.icon)].filter((u) => u && !decoded.has(u)))];
  if (!urls.length) return Promise.resolve();
  const all = Promise.all(
    urls.map((u) => {
      const img = new Image();
      img.src = u;
      return img.decode().then(
        () => void decoded.add(u),
        () => void decoded.add(u), // broken: the tile shows its letter, nothing to wait for next time
      );
    }),
  ).then(() => {});
  return Promise.race([all, new Promise<void>((res) => setTimeout(res, ms))]);
}

/* the empty-query answer, fetched ahead (pointer on the search pill, ⌘ / Ctrl held) so the palette opens with its rows */
let ahead: { at: number; res: SearchRes } | null = null;
let aheadJob: Promise<void> | null = null;
export function prefetchSearch() {
  if ((ahead && performance.now() - ahead.at < 30_000) || aheadJob) return;
  aheadJob = fetch("/api/search?q=", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SearchRes>) : null))
    .then(async (r) => {
      if (!r) return;
      await iconsReady(r, 400);
      ahead = { at: performance.now(), res: r };
    })
    .catch(() => {})
    .finally(() => (aheadJob = null));
}

/** one result row; memoised so moving the selection re-renders two rows, and typing re-renders none */
const Row = memo(function Row({ r, i, sel, q, head, onPick, onHover }: { r: Hit; i: number; sel: boolean; q: string; head: string | null; onPick: (r: Hit) => void; onHover: (i: number) => void }) {
  return (
    <div>
      {head && <p className="p-group">{head}</p>}
      <button data-i={i} role="option" aria-selected={sel} className={cn("p-row", sel && "sel")} onMouseMove={() => onHover(i)} onClick={() => onPick(r)}>
        {r.icon}
        <span className="pt">
          <b>{highlight(r.title, q)}</b>
          <small>{highlight(r.sub, q)}</small>
        </span>
        <span className="hint">↵ 打开</span>
      </button>
    </div>
  );
});

/**
 * ⌘K / Ctrl K search across sites, contents and monitors.
 * v0.4.1: sites and contents are searched on the server (/api/search, slim rows), so the palette no longer needs
 * the full lists in the browser; monitors (a short list that is always loaded) are matched locally. A keystroke
 * only updates the input — the list keeps showing the last answer until the next one arrives (answers are cached
 * per query while the palette is open, so deleting characters is instant).
 */
export function CommandPalette({ open, onClose, monitors, onOpenItem }: { open: boolean; onClose: () => void; monitors: MonitorDTO[]; onOpenItem: (type: "content" | "monitor", id: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchRes | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, SearchRes>());
  const want = useRef("");
  const lastKey = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** show an answer — while keys are coming in fast, wait for a pause so typing frames only redraw the input */
  const show = useCallback((k: string, r: SearchRes) => {
    clearTimeout(timer.current);
    const wait = lastKey.current + 110 - performance.now();
    const apply = () => want.current === k && setRes(r);
    if (wait > 0) timer.current = setTimeout(apply, wait);
    else apply();
  }, []);
  const fetchQ = useCallback(
    (raw: string) => {
      const k = raw.trim().toLowerCase();
      want.current = k;
      const hit = cache.current.get(k);
      if (hit) return show(k, hit);
      fetch(`/api/search?q=${encodeURIComponent(k)}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<SearchRes>) : null))
        .then(async (r) => {
          if (!r) return;
          await iconsReady(r);
          cache.current.set(k, r);
          show(k, r);
        })
        .catch(() => {});
    },
    [show],
  );

  // before the first paint of the opened palette, so a prefetched answer is in its very first frame
  useLayoutEffect(() => {
    if (!open) return;
    cache.current.clear();
    lastKey.current = 0;
    setQ("");
    setSel(0);
    if (ahead && performance.now() - ahead.at < 30_000) {
      cache.current.set("", ahead.res);
      want.current = "";
      setRes(ahead.res);
    } else fetchQ("");
    ahead = null;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      clearTimeout(timer.current);
    };
  }, [open, fetchQ]);

  const shown = res?.q ?? "";
  const rows = useMemo<Hit[]>(() => {
    if (!res) return [];
    const max = shown ? 60 : 24;
    const out: Hit[] = [];
    for (const x of res.sites) out.push({ key: "s" + x.id, group: "站点", title: x.name, sub: x.url.replace(/^https?:\/\//, ""), icon: <Tile src={x.icon} name={x.name} size="sm" eager={decoded.has(x.icon)} />, run: () => window.open(x.url, "_blank", "noopener") });
    for (const x of res.contents) out.push({ key: "c" + x.id, group: "收藏", title: x.title, sub: `${x.domain}${x.tags.length ? " · #" + x.tags.join(" #") : ""}`, icon: <Tile src={x.icon} name={x.domain} size="sm" eager={decoded.has(x.icon)} />, run: () => onOpenItem("content", x.id) });
    for (const x of monitors) {
      if (out.length >= max) break;
      if (shown && ![x.name, x.url, x.host, x.hostname].join("\u0001").toLowerCase().includes(shown)) continue;
      out.push({ key: "m" + x.id, group: "监控", title: x.name, sub: x.kind === "server" ? x.host : x.url, icon: <span className="p-type"><StatusDot status={x.status} /></span>, run: () => onOpenItem("monitor", x.id) });
    }
    return out;
  }, [res, shown, monitors, onOpenItem]);

  useEffect(() => setSel(0), [res]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const pick = useCallback(
    (r: Hit) => {
      r.run();
      onClose();
    },
    [onClose],
  );
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((v) => Math.min(rows.length - 1, v + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter" && rows[sel]) {
      e.preventDefault();
      pick(rows[sel]);
    }
  };

  const list = useMemo(() => {
    let last = "";
    return rows.map((r, i) => {
      const head = r.group !== last ? r.group : null;
      last = r.group;
      return { r, i, head };
    });
  }, [rows]);

  return (
    <Modal open={open} onClose={onClose} label="搜索">
      <div className="p-input">
        <SearchIcon style={{ color: "var(--text3)" }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            lastKey.current = performance.now();
            setQ(e.target.value);
            fetchQ(e.target.value);
          }}
          onKeyDown={onKey}
          placeholder="搜索站点、收藏和监控…"
          autoComplete="off"
          spellCheck={false}
          aria-label="搜索"
        />
        <kbd>Esc</kbd>
      </div>
      <div className="p-list" ref={listRef} role="listbox">
        {res && rows.length === 0 && <p className="p-empty">没有找到「{shown}」</p>}
        {list.map(({ r, i, head }) => (
          <Row key={r.key} r={r} i={i} sel={i === sel} q={shown} head={head} onPick={pick} onHover={setSel} />
        ))}
      </div>
      <div className="p-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd>选择</span>
        <span><kbd>↵</kbd>打开</span>
        <span><kbd>Esc</kbd>关闭</span>
      </div>
    </Modal>
  );
}
