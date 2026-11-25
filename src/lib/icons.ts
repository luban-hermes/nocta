import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Content, Site } from "@prisma/client";
import { prisma } from "./db";
import { fetchMeta, type IconCandidate, type PageMeta } from "./metadata";
import { dataSubdir } from "./paths";
import { safeFetch } from "./ssrf";
import { iconChanged } from "./iconver";

/*
 * Server-side favicon cache. Icons are fetched once (SSRF-guarded), validated by their magic bytes and
 * stored in <data>/icons; the UI loads them from /api/icon/<kind>/<id>, so no hot-linking, no referrer
 * blocks and no letter tiles unless every source failed.
 */

export const iconsDir = () => dataSubdir("icons");
const MAX_BYTES = 1024 * 1024;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type ImgInfo = { ext: "png" | "jpg" | "gif" | "webp" | "ico" | "svg"; w: number };

/** sniff an image by its bytes (content-type headers lie); returns null for HTML error pages etc. */
export function sniff(buf: Buffer): ImgInfo | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return { ext: "png", w: buf.readUInt32BE(16) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let w = 64;
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) break;
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        w = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
    return { ext: "jpg", w };
  }
  if (buf.toString("ascii", 0, 4) === "GIF8") return { ext: "gif", w: buf.readUInt16LE(6) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const t = buf.toString("ascii", 12, 16);
    const w = t === "VP8X" ? 1 + buf.readUIntLE(24, 3) : t === "VP8L" ? 1 + (buf.readUInt16LE(21) & 0x3fff) : buf.readUInt16LE(26) & 0x3fff;
    return { ext: "webp", w };
  }
  if (buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const n = buf.readUInt16LE(4);
    if (n < 1 || n > 64 || buf.length < 6 + n * 16) return null;
    let w = 0;
    for (let i = 0; i < n; i++) w = Math.max(w, buf[6 + i * 16] || 256);
    return { ext: "ico", w };
  }
  const head = buf.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  if ((head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) && !head.includes("<html")) return { ext: "svg", w: 512 };
  return null;
}

export const MIME: Record<ImgInfo["ext"], string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", svg: "image/svg+xml" };

async function fetchImage(url: string, timeoutMs = 6000): Promise<{ buf: Buffer; info: ImgInfo } | null> {
  try {
    const r = await safeFetch(url, { timeoutMs, maxBytes: MAX_BYTES, headers: { accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5", "user-agent": UA } });
    if (r.status >= 400 || r.buf.length >= MAX_BYTES) return null;
    const info = sniff(r.buf);
    if (!info || info.w < 1) return null;
    return { buf: r.buf, info };
  } catch {
    return null;
  }
}

async function manifestIcons(url: string): Promise<IconCandidate[]> {
  try {
    const r = await safeFetch(url, { timeoutMs: 5000, maxBytes: 128 * 1024, headers: { accept: "application/manifest+json,application/json" } });
    if (r.status >= 400) return [];
    const j = JSON.parse(r.text) as { icons?: { src?: string; sizes?: string; type?: string; purpose?: string }[] };
    return (j.icons ?? [])
      .filter((i) => i.src && !/monochrome/.test(i.purpose ?? ""))
      .map((i) => {
        const size = Math.max(...(i.sizes ?? "").split(/\s+/).map((x) => Number(x.split(/x/i)[0]) || 0), 0);
        return { url: new URL(i.src!, r.url).toString(), score: /svg/.test(i.type ?? i.src ?? "") ? 400 : Math.min(size || 96, 256) };
      });
  } catch {
    return [];
  }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * find the clearest icon of a site: apple-touch-icon, manifest icons, <link rel=icon> (largest),
 * /favicon.ico, then public icon services as a fallback. Returns the image or null.
 */
export async function discoverIcon(pageUrl: string, meta?: Partial<PageMeta>, extra: string[] = []) {
  const u = new URL(pageUrl);
  const page = meta?.icons ? meta : await fetchMeta(u.origin + "/").catch(() => null);
  const cands: IconCandidate[] = [...(page?.icons ?? [])];
  if (page?.manifest) cands.push(...(await manifestIcons(page.manifest)));
  cands.push({ url: `${u.origin}/apple-touch-icon.png`, score: 179 }, { url: `${u.origin}/favicon.ico`, score: 32 });
  for (const e of extra) if (e) cands.push({ url: e, score: 150 });
  const seen = new Set<string>();
  const list = cands.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.url) && seen.add(c.url)).slice(0, 7);

  const got = (await Promise.all(list.map((c) => fetchImage(c.url)))).filter(Boolean) as { buf: Buffer; info: ImgInfo }[];
  // prefer vector, then the widest raster (≥ 32px counts as "clear enough")
  let best = got.sort((a, b) => b.info.w - a.info.w)[0] ?? null;
  if (!best || best.info.w < 32) {
    const host = u.hostname;
    for (const svc of [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`]) {
      const r = await fetchImage(svc);
      if (r && r.info.w > (best?.info.w ?? 0)) best = r;
      if (best && best.info.w >= 32) break;
    }
  }
  return best;
}

async function writeIcon(name: string, buf: Buffer) {
  const dir = iconsDir();
  const tmp = path.join(dir, `.${name}.${randomBytes(4).toString("hex")}`);
  await writeFile(tmp, buf);
  await rename(tmp, path.join(dir, name));
  iconChanged(name);
  return name;
}

/** files fetched for a host are shared by every bookmark on that host */
export const hostFile = (host: string, ext: string) => `h_${createHash("sha1").update(host).digest("hex").slice(0, 16)}.${ext}`;

export async function saveHostIcon(pageUrl: string, meta?: Partial<PageMeta>, extra: string[] = []) {
  const host = hostOf(pageUrl);
  if (!host) return "";
  const img = await discoverIcon(pageUrl, meta, extra);
  if (!img) return "";
  return writeIcon(hostFile(host, img.info.ext), img.buf);
}

export async function saveCustomIcon(id: string, buf: Buffer) {
  const info = sniff(buf);
  if (!info) throw new Error("不是有效的图片（支持 PNG / JPG / GIF / WebP / ICO / SVG）");
  return writeIcon(`u_${id}_${randomBytes(4).toString("hex")}.${info.ext}`, buf);
}

export async function fetchCustomIcon(id: string, url: string) {
  const img = await fetchImage(url, 8000);
  if (!img) throw new Error("无法从该地址获取图片");
  return writeIcon(`u_${id}_${randomBytes(4).toString("hex")}.${img.info.ext}`, img.buf);
}

export async function removeIconFile(name: string) {
  if (!name.startsWith("u_")) return; // host files are shared
  await unlink(path.join(iconsDir(), path.basename(name))).catch(() => {});
  iconChanged(name);
}

export async function readIcon(name: string) {
  const safe = path.basename(name);
  if (!safe || safe !== name) return null;
  const buf = await readFile(path.join(iconsDir(), safe)).catch(() => null);
  if (!buf) return null;
  const ext = safe.split(".").pop() as ImgInfo["ext"];
  return { buf, type: MIME[ext] ?? "application/octet-stream" };
}

/* ---------------- record helpers ---------------- */

export type IconKind = "site" | "content";

/** fetch (or re-fetch) the icon for one bookmark; other bookmarks on the same host share the file */
export async function refreshIcon(kind: "site", id: string, meta?: Partial<PageMeta>): Promise<Site | null>;
export async function refreshIcon(kind: "content", id: string, meta?: Partial<PageMeta>): Promise<Content | null>;
export async function refreshIcon(kind: IconKind, id: string, meta?: Partial<PageMeta>): Promise<Site | Content | null>;
export async function refreshIcon(kind: IconKind, id: string, meta?: Partial<PageMeta>): Promise<Site | Content | null> {
  const rec = kind === "site" ? await prisma.site.findUnique({ where: { id } }) : await prisma.content.findUnique({ where: { id } });
  if (!rec) return null;
  const file = await saveHostIcon(rec.url, meta, rec.favicon ? [rec.favicon] : []).catch(() => "");
  const data = { iconFile: file, iconCustom: false, iconCheckedAt: new Date() };
  if (rec.iconCustom && rec.iconFile) await removeIconFile(rec.iconFile);
  return kind === "site" ? prisma.site.update({ where: { id }, data }) : prisma.content.update({ where: { id }, data });
}

const g = globalThis as unknown as { __noctaIconJob?: Promise<void> | null };

/** background backfill: bookmarks without a cached icon (never tried, or last try > 3 days ago) */
export function backfillIcons() {
  if (g.__noctaIconJob) return g.__noctaIconJob;
  g.__noctaIconJob = (async () => {
    const stale = new Date(Date.now() - 3 * 86_400_000);
    const where = { iconFile: "", iconCustom: false, OR: [{ iconCheckedAt: null }, { iconCheckedAt: { lt: stale } }] };
    const [sites, contents] = await Promise.all([
      prisma.site.findMany({ where, select: { id: true, url: true, favicon: true }, take: 400 }),
      prisma.content.findMany({ where, select: { id: true, url: true, favicon: true }, take: 400 }),
    ]);
    const byHost = new Map<string, { url: string; favicons: Set<string>; sites: string[]; contents: string[] }>();
    for (const [kind, list] of [["site", sites], ["content", contents]] as const)
      for (const r of list) {
        const h = hostOf(r.url);
        if (!h) continue;
        const e = byHost.get(h) ?? { url: r.url, favicons: new Set<string>(), sites: [], contents: [] };
        if (r.favicon) e.favicons.add(r.favicon);
        (kind === "site" ? e.sites : e.contents).push(r.id);
        if (kind === "site") e.url = r.url;
        byHost.set(h, e);
      }
    const jobs = [...byHost.values()];
    let done = 0;
    const worker = async () => {
      for (let j = jobs.shift(); j; j = jobs.shift()) {
        const file = await saveHostIcon(j.url, undefined, [...j.favicons]).catch(() => "");
        const data = { iconFile: file, iconCheckedAt: new Date() };
        if (j.sites.length) await prisma.site.updateMany({ where: { id: { in: j.sites }, iconCustom: false }, data });
        if (j.contents.length) await prisma.content.updateMany({ where: { id: { in: j.contents }, iconCustom: false }, data });
        done++;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (done) console.log(`[nocta] icon backfill: ${done} host(s) processed`);
  })()
    .catch((e) => console.error("[nocta] icon backfill failed", e))
    .finally(() => {
      g.__noctaIconJob = null;
    });
  return g.__noctaIconJob;
}
