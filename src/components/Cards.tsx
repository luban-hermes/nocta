"use client";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ContentDTO, MonitorDTO, SiteDTO, Tick } from "@/lib/types";
import { ago, fmtRate } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DotsIcon, PinIcon, PlayIcon } from "./Icons";

/* ---------- favicon tile with letter fallback ---------- */
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

export function Tile({ src, name, size }: { src?: string; name: string; size?: "sm" | "xs" }) {
  const { ref, broken, onError } = useImgFallback(src);
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className={cn("tile", size)}>
      {src && !broken ? <img ref={ref} src={src} alt="" referrerPolicy="no-referrer" onError={onError} /> : letter}
    </span>
  );
}

const enter = (i: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: Math.min(i, 20) * 0.03, ease: [0.22, 1, 0.36, 1] as const } });

/* ---------- site card: favicon + name, click opens URL ---------- */
export function SiteCard({ site, index, admin, onMore }: { site: SiteDTO; index: number; admin: boolean; onMore: () => void }) {
  const [hot, setHot] = useState(false);
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--x", `${x * 100}%`);
    el.style.setProperty("--y", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
  };
  return (
    <motion.div {...enter(index)}>
      <a
        className={cn("site", hot && "is-hot")}
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        title={site.description || site.url}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHot(true)}
        onPointerMove={move}
        onPointerLeave={() => setHot(false)}
        onContextMenu={(e) => {
          if (!admin) return;
          e.preventDefault();
          onMore();
        }}
      >
        {site.pinned && (
          <span className="pin" title="已置顶">
            <PinIcon />
          </span>
        )}
        {admin && (
          <button
            className="more"
            aria-label={`编辑 ${site.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMore();
            }}
          >
            <DotsIcon />
          </button>
        )}
        <Tile src={site.favicon} name={site.name} />
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
      {c.cover && !broken && <img ref={ref} src={c.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onError} />}
      {(!c.cover || broken) && <span className="ctitle">{c.title.slice(0, 40)}</span>}
      {c.type === "video" && (
        <span className="play" aria-hidden="true">
          <PlayIcon />
        </span>
      )}
    </div>
  );
}

export function ContentCard({ c, index, onOpen }: { c: ContentDTO; index: number; onOpen: () => void }) {
  return (
    <motion.article {...enter(index)} className="item" onClick={onOpen} tabIndex={0} role="button" aria-label={c.title} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <Cover c={c} />
      <div className="ibody">
        <div className="irow">
          <span className="badge">{TYPE_LABEL[c.type]}</span>
        </div>
        <h3 className="ititle">{c.title}</h3>
        {c.summary && (
          <>
            {c.aiSummary && <span className="ai-label">AI 摘要</span>}
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
          <Tile src={c.favicon} name={c.domain} size="xs" />
          <span className="dom">{c.domain}</span>
          <span className="sep">·</span>
          <span>{ago(c.createdAt)}</span>
          <span className={cn("unread", c.read && "off")} title={c.read ? "已读" : "未读"} />
        </div>
      </div>
    </motion.article>
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
    <motion.article {...enter(index)} className={cls} onClick={onOpen} tabIndex={0} role="button" aria-label={`${m.name}，${STATUS_LABEL[m.status]}`} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="x-mon__top">
        <StatusDot status={m.status} />
        <h3>{m.name}</h3>
        <span className="x-mon__ip">{m.kind === "server" ? m.host : STATUS_LABEL[m.status]}</span>
      </div>
      {m.kind === "server" ? (
        <>
          <p className="x-mon__os">{m.os || (m.lastReportAt ? m.hostname : "尚未收到探针数据 · 点击查看安装命令")}</p>
          {m.alert && <span className="x-mon__alert">⚠ {m.alert}</span>}
          <div className="x-gauges">
            <Gauge label="CPU" value={m.cpu} />
            <Gauge label="内存" value={m.mem} />
            <Gauge label="磁盘" value={m.disk} />
          </div>
          <div className="x-mon__foot">
            <span>↓ {fmtRate(m.rxRate)}</span>
            <span>↑ {fmtRate(m.txRate)}</span>
            <Sparkline data={m.spark} />
          </div>
        </>
      ) : (
        <>
          <p className="x-url">{m.url}</p>
          {m.alert && <span className="x-mon__alert">⚠ {m.alert}</span>}
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
    </motion.article>
  );
}
