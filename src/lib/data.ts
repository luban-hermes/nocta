import "server-only";
import type { Category, Content, Monitor, Site, SiteLink } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { isAdmin } from "./auth";
import { alertOf, effectiveStatus } from "./monitor";
import { splitTags } from "./utils";
import { iconFileUrl } from "./iconver";
import { createHash } from "node:crypto";
import type { AdminData, AdminRow, AppData, CategoryDTO, ContentDTO, MonitorDTO, SiteDTO, Tick, Totals, Versions } from "./types";

const TICKS = 48; // 24h in 30-minute buckets

/** icons are served per file (shared by every bookmark on the same host) and cached as immutable — v0.4.0 */
const iconUrl = (_kind: "site" | "content", r: { iconFile: string }) => iconFileUrl(r.iconFile);

export const siteDTO = (s: Site & { links?: SiteLink[] }): SiteDTO => ({
  id: s.id,
  name: s.name,
  url: s.url,
  urlNote: s.urlNote ?? "",
  backups: [...(s.links ?? [])].sort((a, b) => a.sort - b.sort).map((l) => ({ id: l.id, url: l.url, note: l.note })),
  description: s.description,
  favicon: s.favicon,
  icon: iconUrl("site", s),
  iconCustom: s.iconCustom,
  pinned: s.pinned,
  sort: s.sort,
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
  icon: iconUrl("content", c),
  iconCustom: c.iconCustom,
  pinned: c.pinned,
  sort: c.sort,
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

type Bucket = { monitorId: string; b: number | bigint; n: number | bigint; okn: number | bigint | null };
type Last = { monitorId: string; v: number | null };
const num = (x: number | bigint | null | undefined) => Number(x ?? 0);

/**
 * aggregate the last 24h into 48 availability buckets + a sparkline per monitor.
 * v0.4.0: grouped in SQL (one small row per monitor × bucket) instead of pulling every check into JS.
 */
export async function monitorsWithStats(monitors: Monitor[], admin: boolean): Promise<MonitorDTO[]> {
  if (!monitors.length) return [];
  const t0 = Date.now() - 86_400_000;
  const [cb, cl, mb, ml] = await Promise.all([
    prisma.$queryRawUnsafe<Bucket[]>(`SELECT monitorId, MIN(${TICKS - 1}, CAST((createdAt - ?) * ${TICKS} / 86400000 AS INTEGER)) AS b, COUNT(*) AS n, SUM(ok) AS okn FROM "Check" WHERE createdAt >= ? GROUP BY monitorId, b`, t0, t0),
    prisma.$queryRawUnsafe<Last[]>(`SELECT monitorId, v FROM (SELECT monitorId, latency AS v, createdAt, ROW_NUMBER() OVER (PARTITION BY monitorId ORDER BY createdAt DESC) AS rn FROM "Check" WHERE createdAt >= ?) WHERE rn <= 30 ORDER BY monitorId, createdAt ASC`, t0),
    prisma.$queryRawUnsafe<Bucket[]>(`SELECT monitorId, MIN(${TICKS - 1}, CAST((createdAt - ?) * ${TICKS} / 86400000 AS INTEGER)) AS b, COUNT(*) AS n, NULL AS okn FROM "Metric" WHERE createdAt >= ? GROUP BY monitorId, b`, t0, t0),
    prisma.$queryRawUnsafe<Last[]>(`SELECT monitorId, v FROM (SELECT monitorId, cpu AS v, createdAt, ROW_NUMBER() OVER (PARTITION BY monitorId ORDER BY createdAt DESC) AS rn FROM "Metric" WHERE createdAt >= ?) WHERE rn <= 30 ORDER BY monitorId, createdAt ASC`, t0),
  ]);
  const group = <T extends { monitorId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.monitorId) ?? m.set(r.monitorId, []).get(r.monitorId)!).push(r);
    return m;
  };
  const CB = group(cb), CL = group(cl), MB = group(mb), ML = group(ml);
  const bucket = (t: number) => Math.min(TICKS - 1, Math.floor(((t - t0) / 86_400_000) * TICKS));
  return monitors.map((m) => {
    const ticks: Tick[] = Array(TICKS).fill("off");
    let spark: number[] = [];
    let uptime24h: number | null = null;
    if (m.kind === "server") {
      const bs = MB.get(m.id) ?? [];
      for (const x of bs) ticks[num(x.b)] = "ok";
      spark = (ML.get(m.id) ?? []).map((x) => Math.round(x.v ?? 0));
      const covered = ticks.filter((t) => t === "ok").length;
      const firstBucket = bucket(Math.max(t0, m.createdAt.getTime()));
      const expected = TICKS - firstBucket;
      uptime24h = bs.length ? Math.round((covered / Math.max(1, expected)) * 1000) / 10 : null;
      const nowB = bucket(Date.now());
      for (let i = firstBucket; i < TICKS; i++) if (ticks[i] === "off" && i < nowB) ticks[i] = "bad";
    } else {
      const bs = CB.get(m.id) ?? [];
      let n = 0, ok = 0;
      for (const x of bs) {
        const a = num(x.n), o = num(x.okn);
        n += a;
        ok += o;
        ticks[num(x.b)] = o === a ? "ok" : o === 0 ? "bad" : "warn";
      }
      spark = (CL.get(m.id) ?? []).map((x) => x.v ?? 0);
      uptime24h = n ? Math.round((ok / n) * 1000) / 10 : null;
    }
    return monitorDTO(m, { ticks, spark, uptime24h }, admin);
  });
}

const SITE_ORDER = [{ pinned: "desc" as const }, { sort: "asc" as const }, { createdAt: "asc" as const }];
const CONTENT_ORDER = [{ pinned: "desc" as const }, { sort: "asc" as const }, { createdAt: "desc" as const }];

async function categoryDTOs(): Promise<CategoryDTO[]> {
  const cats = await prisma.category.findMany({ orderBy: [{ kind: "asc" }, { sort: "asc" }, { createdAt: "asc" }], include: { _count: { select: { sites: true, contents: true } } } });
  return cats.map((c: Category & { _count: { sites: number; contents: number } }) => ({
    id: c.id,
    kind: c.kind === "content" ? "content" : "site",
    name: c.name,
    icon: c.icon,
    sort: c.sort,
    count: c.kind === "content" ? c._count.contents : c._count.sites,
  }));
}

export const loadSites = async () => (await prisma.site.findMany({ orderBy: SITE_ORDER, include: { links: { orderBy: { sort: "asc" } } } })).map(siteDTO);
export const loadContents = async () => (await prisma.content.findMany({ orderBy: CONTENT_ORDER })).map(contentDTO);
export const loadCategories = categoryDTOs;

export async function loadMonitors(admin: boolean) {
  return monitorsWithStats(await prisma.monitor.findMany({ orderBy: { createdAt: "asc" } }), admin);
}

/** change markers: count + newest updatedAt per bookmark table, a digest of the (small) category table */
export async function loadVersions(): Promise<Versions> {
  const [s, c, k] = await Promise.all([
    prisma.site.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.content.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.$queryRawUnsafe<{ v: string | null }[]>(`SELECT group_concat(id || ':' || name || ':' || icon || ':' || sort, '|') AS v FROM (SELECT * FROM Category ORDER BY id)`),
  ]);
  return {
    s: `${s._count._all}.${s._max.updatedAt?.getTime() ?? 0}`,
    c: `${c._count._all}.${c._max.updatedAt?.getTime() ?? 0}`,
    k: createHash("sha1").update(k[0]?.v ?? "").digest("hex").slice(0, 12),
  };
}

async function viewFlags() {
  const admin = await isAdmin();
  const env = await getSettings();
  return { admin, env, showMonitors: admin || env.publicMonitors };
}

/** everything at once (/api/data, kept for compatibility) */
export async function loadAppData(): Promise<AppData> {
  const { admin, env, showMonitors } = await viewFlags();
  const [categories, sites, contents, monitors, version] = await Promise.all([categoryDTOs(), loadSites(), loadContents(), showMonitors ? loadMonitors(admin) : Promise.resolve([]), loadVersions()]);
  return { admin, publicMode: env.publicMode, showMonitors, aiEnabled: env.aiEnabled, siteFailover: env.siteFailover, categories, sites, contents, monitors, version };
}

/** first sites the home page renders on the server; the rest arrives after hydration (v0.4.0) */
export const HOME_FIRST_SITES = 64;

export async function loadHomeData(): Promise<AppData> {
  const { admin, env, showMonitors } = await viewFlags();
  const [categories, first, nS, nC, nSn, nCn, monitors, version] = await Promise.all([
    categoryDTOs(),
    prisma.site.findMany({ orderBy: SITE_ORDER, take: HOME_FIRST_SITES, include: { links: { orderBy: { sort: "asc" } } } }),
    prisma.site.count(),
    prisma.content.count(),
    prisma.site.count({ where: { categoryId: null } }),
    prisma.content.count({ where: { categoryId: null } }),
    showMonitors ? loadMonitors(admin) : Promise.resolve([]),
    loadVersions(),
  ]);
  const totals: Totals = { sites: nS, contents: nC, sitesNone: nSn, contentsNone: nCn };
  return {
    admin,
    publicMode: env.publicMode,
    showMonitors,
    aiEnabled: env.aiEnabled,
    siteFailover: env.siteFailover,
    categories,
    sites: first.map(siteDTO),
    contents: [],
    monitors,
    partial: { sites: nS > first.length, contents: nC > 0 },
    totals,
    version,
  };
}

/* ---------------- 后台 ---------------- */

export async function loadAdminData(): Promise<AdminData> {
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [categories, sites, contents, weekNew, unread, recent, mons] = await Promise.all([
    categoryDTOs(),
    prisma.site.count(),
    prisma.content.count(),
    prisma.content.count({ where: { createdAt: { gt: week } } }),
    prisma.content.count({ where: { read: false } }),
    prisma.content.findMany({ orderBy: CONTENT_ORDER, take: 8 }),
    prisma.monitor.findMany(),
  ]);
  const st = mons.map((m) => effectiveStatus(m));
  return {
    categories,
    stats: { sites, contents, weekNew, unread, monitors: mons.length, bad: st.filter((s) => s === "down" || s === "warn").length, down: st.filter((s) => s === "down").length },
    recent: recent.map(contentDTO),
  };
}

export type AdminSort = "default" | "title" | "date" | "kind" | "category";
type RawRow = { id: string; kind: string; title: string; url: string; domain: string; categoryId: string | null; tags: string; createdAt: number | bigint; iconFile: string };

/** one page of the 书签管理 table: sites + contents, searched / sorted / paged in SQL */
export async function adminItems(o: { q?: string; sort?: AdminSort; dir?: "asc" | "desc"; offset?: number; limit?: number }) {
  const q = (o.q ?? "").trim().toLowerCase();
  const dir = o.dir === "desc" ? "DESC" : "ASC";
  const limit = Math.max(1, Math.min(200, o.limit ?? 60));
  const offset = Math.max(0, o.offset ?? 0);
  const base = `SELECT s.id AS id, 'site' AS kind, 0 AS k, s.name AS title, s.url AS url, s.url AS domain, s.categoryId AS categoryId, '' AS tags, s.createdAt AS createdAt, s.iconFile AS iconFile, s.pinned AS pinned, s.sort AS sort, s.createdAt AS cAsc, 0 AS cDesc, COALESCE(c.name, '未分类') AS catName, c.sort AS catSort
      FROM Site s LEFT JOIN Category c ON c.id = s.categoryId
    UNION ALL
    SELECT t.id, 'content', 1, t.title, t.url, t.domain, t.categoryId, t.tags, t.createdAt, t.iconFile, t.pinned, t.sort, 0, -t.createdAt, COALESCE(c.name, '未分类'), c.sort
      FROM Content t LEFT JOIN Category c ON c.id = t.categoryId`;
  // same text the old client-side filter matched: title, url, tags, category name (tags are stored comma separated)
  const where = q ? `WHERE lower(title || ' ' || url || ' ' || replace(tags, ',', ' ') || ' ' || catName) LIKE ? ESCAPE '\\'` : "";
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const order =
    o.sort === "title" ? `ORDER BY title COLLATE NOCASE ${dir}, id` :
    o.sort === "date" ? `ORDER BY createdAt ${dir}, id` :
    o.sort === "kind" ? `ORDER BY k ${dir}, pinned DESC, sort ASC, cAsc ASC, cDesc ASC` :
    o.sort === "category" ? `ORDER BY catSort IS NULL, catSort ${dir}, catName, k, pinned DESC, sort ASC, cAsc ASC, cDesc ASC` :
    `ORDER BY k ASC, pinned DESC, sort ASC, cAsc ASC, cDesc ASC`;
  const args = q ? [like] : [];
  const [rows, cnt] = await Promise.all([
    prisma.$queryRawUnsafe<RawRow[]>(`SELECT id, kind, title, url, domain, categoryId, tags, CAST(createdAt AS INTEGER) AS createdAt, iconFile FROM (${base}) ${where} ${order} LIMIT ${limit} OFFSET ${offset}`, ...args),
    prisma.$queryRawUnsafe<{ n: number | bigint }[]>(`SELECT COUNT(*) AS n FROM (${base}) ${where}`, ...args),
  ]);
  const out: AdminRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind === "content" ? "content" : "site",
    title: r.title,
    url: r.url,
    icon: iconFileUrl(r.iconFile),
    domain: r.domain,
    categoryId: r.categoryId,
    tags: splitTags(r.tags).join(" · "),
    date: new Date(Number(r.createdAt)).toISOString(),
  }));
  return { rows: out, total: Number(cnt[0]?.n ?? 0) };
}
