"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "./ui/modal";
import { SearchIcon } from "./Icons";
import { StatusDot, Tile } from "./Cards";

type Row = { key: string; group: string; title: string; sub: string; icon: ReactNode; run: () => void };

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

/** ⌘K / Ctrl K search across sites, contents and monitors */
export function CommandPalette({ open, onClose, data, onOpenItem }: { open: boolean; onClose: () => void; data: AppData; onOpenItem: (type: "content" | "monitor", id: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const s = q.trim().toLowerCase();
    const has = (...xs: string[]) => !s || xs.some((x) => x.toLowerCase().includes(s));
    const out: Row[] = [];
    for (const x of data.sites)
      if (has(x.name, x.url, x.description))
        out.push({ key: "s" + x.id, group: "站点", title: x.name, sub: x.url.replace(/^https?:\/\//, ""), icon: <Tile src={x.favicon} name={x.name} size="sm" />, run: () => window.open(x.url, "_blank", "noopener") });
    for (const x of data.contents)
      if (has(x.title, x.summary, x.domain, x.tags.join(" ")))
        out.push({ key: "c" + x.id, group: "收藏", title: x.title, sub: `${x.domain}${x.tags.length ? " · #" + x.tags.join(" #") : ""}`, icon: <Tile src={x.favicon} name={x.domain} size="sm" />, run: () => onOpenItem("content", x.id) });
    for (const x of data.monitors)
      if (has(x.name, x.url, x.host, x.hostname))
        out.push({ key: "m" + x.id, group: "监控", title: x.name, sub: x.kind === "server" ? x.host : x.url, icon: <span className="p-type"><StatusDot status={x.status} /></span>, run: () => onOpenItem("monitor", x.id) });
    return out.slice(0, s ? 60 : 24);
  }, [q, data, onOpenItem]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((v) => Math.min(rows.length - 1, v + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((v) => Math.max(0, v - 1));
    } else if (e.key === "Enter" && rows[sel]) {
      e.preventDefault();
      rows[sel].run();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <Modal open={open} onClose={onClose} label="搜索">
      <div className="p-input">
        <SearchIcon style={{ color: "var(--text3)" }} />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="搜索站点、收藏和监控…" autoComplete="off" spellCheck={false} aria-label="搜索" />
        <kbd>Esc</kbd>
      </div>
      <div className="p-list" ref={listRef} role="listbox">
        {rows.length === 0 && <p className="p-empty">没有找到「{q}」</p>}
        {rows.map((r, i) => {
          const head = r.group !== lastGroup ? <p className="p-group" key={r.key + "g"}>{r.group}</p> : null;
          lastGroup = r.group;
          return (
            <div key={r.key}>
              {head}
              <button
                data-i={i}
                role="option"
                aria-selected={i === sel}
                className={cn("p-row", i === sel && "sel")}
                onMouseMove={() => setSel(i)}
                onClick={() => {
                  r.run();
                  onClose();
                }}
              >
                {r.icon}
                <span className="pt">
                  <b>{highlight(r.title, q.trim())}</b>
                  <small>{highlight(r.sub, q.trim())}</small>
                </span>
                <span className="hint">↵ 打开</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="p-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd>选择</span>
        <span><kbd>↵</kbd>打开</span>
        <span><kbd>Esc</kbd>关闭</span>
      </div>
    </Modal>
  );
}
