"use client";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ContentDTO, MonitorDTO, SiteDTO, Tick } from "@/lib/types";
import { ago, fmtRate } from "@/lib/client";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, PinIcon, PlayIcon, SparkIcon, WarnIcon } from "./Icons";
import { useLongPress } from "./ui/context-menu";
import { mergeHandlers, type HandleProps } from "./ui/sortable";
import { linkState, openSite, siteLinks, useProbes } from "@/lib/linkprobe";

/* ---------- icon tile: cached server-side icon; the letter tile is only the very last resort ---------- */
/** an <img> that reports failures even when they happened before hydration */
function useImgFallback(src?: string) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, [src]);
  return { ref, broken, onError: () => setBroken(true) };
}

export function Tile({ src, name, size }: { src?: string; name: string; size?: "sm" | "xs" | "lg" }) {
  const { ref, broken, onError } = useImgFallback(src);
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className={cn("tile", size, src && !broken && "has-img")}>
      {src && !broken ? <img ref={ref} src={src} alt="" decoding="async" draggable={false} onError={onError} /> : <span className="tl">{letter}</span>}
    </span>
  );
}

const enter = (i: number, still?: boolean) => still ? { initial: false as const } : ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: [0.22, 1, 0.36, 1] as const } });

type CardEvents = { handle?: HandleProps; onMenu?: (x: number, y: number) => void; /** static copy drawn in the drag overlay */ overlay?: boolean };

/* ---------- reachability of one link, as seen from this browser (item 13) ---------- */
export function LinkDot({ url }: { url: string }) {
  useProbes();
  const st = linkState(url)?.status;
  return <i className={cn("ln-dot", st)} aria-label={st === "ok" ? "可用" : st === "down" ? "不可用" : st === "checking" ? "检测中" : "未检测"} />;
}
export function LinkLatency({ url }: { url: string }) {
  useProbes();
  const st = linkState(url);
  return <small className="ln-ms">{st?.status === "ok" ? `${st.ms}ms` : st?.status === "down" ? "不可用" : st?.status === "checking" ? "…" : ""}</small>;
}

/* ---------- site card: icon + name, click opens URL; right-click / long-press opens the menu ---------- */
export function SiteCard({ site, index, handle, onMenu, overlay, failover }: { site: SiteDTO; index: number; failover?: boolean } & CardEvents) {
  const [hot, setHot] = useState(false);
  const lp = useLongPress(onMenu ?? null);
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse" || document.body.classList.contains("is-sorting")) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--x", `${x * 100}%`);
    el.style.setProperty("--y", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
  };
  return (
    <motion.div {...enter(index, overlay)}>
      <a
        {...mergeHandlers(handle, lp)}
        className={cn("site", hot && !overlay && "is-hot")}
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onClick={(e) => {
          // multi-link site: open the first link that is reachable from here (primary first)
          if (!failover || !site.backups.length || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          void openSite(siteLinks(site).map((l) => l.url));
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHot(true)}
        onPointerMove={move}
        onPointerLeave={() => setHot(false)}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          setHot(false);
          onMenu(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          handle?.onKeyDown?.(e);
          if (onMenu && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.left + r.width / 2, r.top + r.height / 2);
          }
        }}
      >
        {site.pinned && (
          <span className="pin" aria-label="已置顶">
            <PinIcon />
          </span>
        )}
        <Tile src={site.icon} name={site.name} />
        <span className="nm">{site.name}</span>
      </a>
    </motion.div>
  );
}

/* ---------- content card: cover, title, AI summary, domain, tags ---------- */
const TYPE_LABEL: Record<ContentDTO["type"], string> = { article: "文章", video: "视频", repo: "仓库", post: "帖子" };

export function Cover({ c, className }: { c: ContentDTO; className?: string }) {
  const { ref, broken, onError } = useImgFallback(c.cover);
  return (
    <div className={cn("cover", className)} style={{ ["--ar" as string]: c.type === "video" ? "16/9" : "16/10" }}>
      <div className="fallback" />
      {c.cover && !broken && <img ref={ref} src={c.cover} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={onError} />}
      {(!c.cover || broken) && <span className="ctitle">{c.title.slice(0, 40)}</span>}
      {c.type === "video" && (
        <span className="play" aria-hidden="true">
          <PlayIcon />
        </span>
      )}
    </div>
  );
}

export function ContentCard({ c, index, onOpen, handle, onMenu, overlay }: { c: ContentDTO; index: number; onOpen: () => void } & CardEvents) {
  const lp = useLongPress(onMenu ?? null);
  return (
    <motion.div {...enter(index, overlay)}>
    <article
      {...mergeHandlers(handle, lp)}
      className="item"
      onClick={onOpen}
      tabIndex={0}
      role="button"
      aria-label={c.title}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        handle?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen();
        if (onMenu && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(r.left + 24, r.top + 24);
        }
      }}
    >
      <Cover c={c} />
      <div className="ibody">
        <div className="irow">
          <span className="badge">{TYPE_LABEL[c.type]}</span>
          {c.pinned && (
            <span className="badge pinb">
              <PinIcon size={11} /> 置顶
            </span>
          )}
        </div>
        <h3 className="ititle">{c.title}</h3>
        {c.summary && (
          <>
            {c.aiSummary && (
              <span className="ai-label">
                <SparkIcon size={12} /> AI 摘要
              </span>
            )}
            <p className="isum" style={c.aiSummary ? undefined : { marginTop: 8 }}>{c.summary}</p>
          </>
        )}
        {c.tags.length > 0 && (
          <div className="tags">
            {c.tags.map((t) => (
              <span key={t} className="tag">#{t}</span>
            ))}
          </div>
        )}
        <div className="ifoot">
          <Tile src={c.icon} name={c.domain} size="xs" />
          <span className="dom">{c.domain}</span>
          <span className="sep">·</span>
          <span suppressHydrationWarning>{ago(c.createdAt)}</span>
          <span className={cn("unread", c.read && "off")} aria-label={c.read ? "已读" : "未读"} />
        </div>
      </div>
    </article>
    </motion.div>
  );
}

/* ---------- monitor visuals ---------- */
export function Gauge({ label, value }: { label: string; value: number | null }) {
  const r = 22, C = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="x-g">
      <div className="x-g__r">
        <svg viewBox="0 0 54 54">
          <circle className="trk" cx="27" cy="27" r={r} />
          <circle className={cn("val", v > 90 && "warn")} cx="27" cy="27" r={r} strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} />
        </svg>
        <b>{value == null ? "—" : `${Math.round(v)}%`}</b>
      </div>
      {label}
    </div>
  );
}

export function Sparkline({ data, className = "x-spark" }: { data: number[]; className?: string }) {
  if (data.length < 2) return <svg className={className} viewBox="0 0 96 26" />;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * 96).toFixed(1)},${(24 - ((v - min) / (max - min || 1)) * 22).toFixed(1)}`);
  return (
    <svg className={className} viewBox="0 0 96 26" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M${pts.join("L")}`} />
    </svg>
  );
}

export function Ticks({ ticks }: { ticks: Tick[] }) {
  return (
    <div className="x-ticks" aria-hidden="true">
      {ticks.map((t, i) => (
        <i key={i} className={t === "ok" ? "" : t === "warn" ? "bad" : t} style={t === "warn" ? { background: "var(--warn)" } : undefined} />
      ))}
    </div>
  );
}

const dotCls = (s: MonitorDTO["status"]) => (s === "down" ? "bad" : s === "warn" ? "warn" : s === "up" ? "" : "off");
export function StatusDot({ status }: { status: MonitorDTO["status"] }) {
  return <i className={cn("x-sd", dotCls(status))} style={status === "pending" || status === "paused" ? { background: "var(--text3)" } : undefined} />;
}
export const STATUS_LABEL: Record<MonitorDTO["status"], string> = { up: "正常", warn: "告警", down: "离线", pending: "等待数据", paused: "已暂停" };

export function MonitorCard({ m, index, onOpen }: { m: MonitorDTO; index: number; onOpen: () => void }) {
  const cls = cn("x-mon", m.status === "warn" && "warn", m.status === "down" && "bad", m.paused && "mon-paused");
  return (
    // entrance animation lives on a wrapper: framer leaves an inline transform on the animated element,
    // which would override the CSS :hover lift of .x-mon (v0.3.1)
    <motion.div {...enter(index)} className="x-mon-wrap">
    <article className={cls} onClick={onOpen} tabIndex={0} role="button" aria-label={`${m.name}，${STATUS_LABEL[m.status]}`} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="x-mon__top">
        <StatusDot status={m.status} />
        <h3>{m.name}</h3>
        <span className="x-mon__ip">{m.kind === "server" ? m.host : STATUS_LABEL[m.status]}</span>
      </div>
      {m.kind === "server" ? (
        <>
          <p className="x-mon__os">{m.os || (m.lastReportAt ? m.hostname : "等待数据")}</p>
          {m.alert && <span className="x-mon__alert"><WarnIcon /> {m.alert}</span>}
          <div className="x-gauges">
            <Gauge label="CPU" value={m.cpu} />
            <Gauge label="内存" value={m.mem} />
            <Gauge label="磁盘" value={m.disk} />
          </div>
          <div className="x-mon__foot">
            <span className="rate"><ArrowDownIcon /> {fmtRate(m.rxRate)}</span>
            <span className="rate"><ArrowUpIcon size={12} /> {fmtRate(m.txRate)}</span>
            <Sparkline data={m.spark} />
          </div>
        </>
      ) : (
        <>
          <p className="x-url">{m.url}</p>
          {m.alert && <span className="x-mon__alert"><WarnIcon /> {m.alert}</span>}
          <div className="x-kv">
            <div>
              <small>状态码</small>
              <b className={m.lastStatus == null ? "" : m.lastStatus < 400 ? "ok" : "bad"}>{m.lastStatus ?? "—"}</b>
            </div>
            <div>
              <small>响应</small>
              <b>{m.lastLatency != null ? `${m.lastLatency}ms` : "—"}</b>
            </div>
            <div>
              <small>SSL</small>
              <b>{m.sslDays != null ? `${m.sslDays} 天` : m.url.startsWith("https") ? "—" : "无"}</b>
            </div>
          </div>
          <Ticks ticks={m.ticks} />
          <div className="x-tickcap">
            <span>24 小时</span>
            <b>{m.uptime24h != null ? `可用率 ${m.uptime24h}%` : "暂无数据"}</b>
          </div>
        </>
      )}
    </article>
    </motion.div>
  );
}
