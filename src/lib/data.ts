import "server-only";
import type { Category, Content, Monitor, Site } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { isAdmin } from "./auth";
import { alertOf, effectiveStatus } from "./monitor";
import { splitTags } from "./utils";
import type { AppData, CategoryDTO, ContentDTO, MonitorDTO, SiteDTO, Tick } from "./types";

const TICKS = 48; // 24h in 30-minute buckets

export const siteDTO = (s: Site): SiteDTO => ({
  id: s.id,
  name: s.name,
  url: s.url,
  description: s.description,
  favicon: s.favicon,
  pinned: s.pinned,
  categoryId: s.categoryId,
  createdAt: s.createdAt.toISOString(),
});

export const contentDTO = (c: Content): ContentDTO => ({
  id: c.id,
  url: c.url,
  title: c.title,
  summary: c.summary,
  cover: c.cover,
  favicon: c.favicon,
  domain: c.domain,
  type: (["article", "video", "repo", "post"].includes(c.type) ? c.type : "article") as ContentDTO["type"],
  tags: splitTags(c.tags),
  note: c.note,
  read: c.read,
  aiSummary: c.aiSummary,
  categoryId: c.categoryId,
  createdAt: c.createdAt.toISOString(),
});

export function monitorDTO(
  m: Monitor,
  extra: { ticks?: Tick[]; spark?: number[]; uptime24h?: number | null } = {},
  admin = false,
): MonitorDTO {
  return {
    id: m.id,
    kind: m.kind === "server" ? "server" : "http",
    name: m.name,
    status: effectiveStatus(m),
    alert: alertOf(m),
    paused: m.paused,
    interval: m.interval,
    url: m.url,
    method: m.method,
    expectStatus: m.expectStatus,
    timeoutMs: m.timeoutMs,
    lastStatus: m.lastStatus,
    lastLatency: m.lastLatency,
    sslDays: m.sslDays,
    lastError: m.lastError,
    lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
    host: m.host,
    port: m.port,
    sshUser: m.sshUser,
    hostname: m.hostname,
    os: m.os,
    uptime: m.uptime,
    cpu: m.cpu,
    mem: m.mem,
    memTotal: m.memTotal,
    disk: m.disk,
    diskTotal: m.diskTotal,
    load: m.load,
    rxRate: m.rxRate,
    txRate: m.txRate,
    lastReportAt: m.lastReportAt?.toISOString() ?? null,
    ...(admin && m.token ? { token: m.token } : {}),
    uptime24h: extra.uptime24h ?? null,
    ticks: extra.ticks ?? Array(TICKS).fill("off"),
    spark: extra.spark ?? [],
  };
}

/** aggregate the last 24h into 48 availability buckets + a sparkline per monitor */
export async function monitorsWithStats(monitors: Monitor[], admin: boolean): Promise<MonitorDTO[]> {
  if (!monitors.length) return [];
  const since = new Date(Date.now() - 86_400_000);
  const ids = monitors.map((m) => m.id);
  const [checks, metrics] = await Promise.all([
    prisma.check.findMany({ where: { monitorId: { in: ids }, createdAt: { gte: since } }, select: { monitorId: true, ok: true, latency: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.metric.findMany({ where: { monitorId: { in: ids }, createdAt: { gte: since } }, select: { monitorId: true, cpu: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const t0 = since.getTime();
  const bucket = (d: Date) => Math.min(TICKS - 1, Math.floor(((d.getTime() - t0) / 86_400_000) * TICKS));
  return monitors.map((m) => {
    const ticks: Tick[] = Array(TICKS).fill("off");
    let spark: number[] = [];
    let uptime24h: number | null = null;
    if (m.kind === "server") {
      const ms = metrics.filter((x) => x.monitorId === m.id);
      for (const x of ms) ticks[bucket(x.createdAt)] = "ok";
      spark = ms.slice(-30).map((x) => Math.round(x.cpu));
      const covered = ticks.filter((t) => t === "ok").length;
      const firstBucket = bucket(new Date(Math.max(t0, m.createdAt.getTime())));
      const expected = TICKS - firstBucket;
      uptime24h = ms.length ? Math.round((covered / Math.max(1, expected)) * 1000) / 10 : null;
      for (let i = firstBucket; i < TICKS; i++) if (ticks[i] === "off" && i < bucket(new Date())) ticks[i] = "bad";
    } else {
      const cs = checks.filter((x) => x.monitorId === m.id);
      const agg = new Map<number, { ok: number; n: number }>();
      for (const c of cs) {
        const b = bucket(c.createdAt);
        const a = agg.get(b) ?? { ok: 0, n: 0 };
        a.n++;
        if (c.ok) a.ok++;
        agg.set(b, a);
      }
      for (const [b, a] of agg) ticks[b] = a.ok === a.n ? "ok" : a.ok === 0 ? "bad" : "warn";
      spark = cs.slice(-30).map((c) => c.latency ?? 0);
      uptime24h = cs.length ? Math.round((cs.filter((c) => c.ok).length / cs.length) * 1000) / 10 : null;
    }
    return monitorDTO(m, { ticks, spark, uptime24h }, admin);
  });
}

export async function loadAppData(): Promise<AppData> {
  const admin = await isAdmin();
  const showMonitors = admin || env.publicMonitors;
  const [cats, sites, contents, monitors] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ kind: "asc" }, { sort: "asc" }, { createdAt: "asc" }], include: { _count: { select: { sites: true, contents: true } } } }),
    prisma.site.findMany({ orderBy: [{ pinned: "desc" }, { sort: "asc" }, { createdAt: "asc" }] }),
    prisma.content.findMany({ orderBy: { createdAt: "desc" } }),
    showMonitors ? prisma.monitor.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([] as Monitor[]),
  ]);
  const categories: CategoryDTO[] = cats.map((c: Category & { _count: { sites: number; contents: number } }) => ({
    id: c.id,
    kind: c.kind === "content" ? "content" : "site",
    name: c.name,
    icon: c.icon,
    sort: c.sort,
    count: c.kind === "content" ? c._count.contents : c._count.sites,
  }));
  return {
    admin,
    publicMode: env.publicMode,
    showMonitors,
    aiEnabled: env.aiEnabled,
    categories,
    sites: sites.map(siteDTO),
    contents: contents.map(contentDTO),
    monitors: await monitorsWithStats(monitors, admin),
  };
}
