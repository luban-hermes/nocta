import "server-only";
import { prisma } from "./db";
import { refreshIcon } from "./icons";
import { iconContentHash } from "./iconver";
import { normalizeUrl } from "./utils";

/*
 * Multi-link sites (item 13). Site.url is the primary link; SiteLink rows are the backups in `sort`
 * order. Which link is reachable is decided in the visitor's browser, never here.
 */

export type LinkInput = { url: string; note?: string };
export const MAX_LINKS = 10;

/** validate + dedupe an ordered list (first = primary). Throws a user-facing message. */
export function cleanLinks(list: LinkInput[]) {
  const out: { url: string; note: string }[] = [];
  const seen = new Set<string>();
  for (const l of list) {
    if (!l || typeof l.url !== "string" || !l.url.trim()) continue;
    const u = normalizeUrl(l.url);
    if (!u) throw new Error(`网址无效：${l.url.slice(0, 80)}`);
    const url = u.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, note: String(l.note ?? "").trim().slice(0, 40) });
  }
  if (!out.length) throw new Error("至少需要一个链接");
  if (out.length > MAX_LINKS) throw new Error(`最多 ${MAX_LINKS} 个链接`);
  return out;
}

const withLinks = (id: string) => prisma.site.findUnique({ where: { id }, include: { links: { orderBy: { sort: "asc" } } } });

/** replace all links of a site; links[0] becomes the primary. Re-fetches the icon when the primary host changed. */
export async function setLinks(siteId: string, list: LinkInput[]) {
  const links = cleanLinks(list);
  const before = await prisma.site.findUnique({ where: { id: siteId } });
  if (!before) throw new Error("站点不存在");
  const [primary, ...rest] = links;
  await prisma.$transaction([
    prisma.site.update({ where: { id: siteId }, data: { url: primary.url, urlNote: primary.note } }),
    prisma.siteLink.deleteMany({ where: { siteId } }),
    ...(rest.length ? [prisma.siteLink.createMany({ data: rest.map((l, i) => ({ siteId, url: l.url, note: l.note, sort: i })) })] : []),
  ]);
  if (!before.iconCustom && hostOf(before.url) !== hostOf(primary.url)) await refreshIcon("site", siteId).catch(() => null);
  return withLinks(siteId);
}

/** append one backup link */
export async function addLink(siteId: string, raw: string, note = "") {
  const s = await withLinks(siteId);
  if (!s) throw new Error("站点不存在");
  return setLinks(siteId, [{ url: s.url, note: s.urlNote }, ...s.links, { url: raw, note }]);
}

/** turn site `fromId` into backup links of `intoId` and delete it */
export async function mergeInto(fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("不能合并到自己");
  const [from, into] = await Promise.all([withLinks(fromId), withLinks(intoId)]);
  if (!from || !into) throw new Error("站点不存在");
  const res = await setLinks(intoId, [{ url: into.url, note: into.urlNote }, ...into.links, { url: from.url, note: from.urlNote }, ...from.links]);
  await prisma.site.delete({ where: { id: fromId } });
  return res;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

async function iconHash(file: string) {
  return iconContentHash(file);
}

/**
 * an existing site that looks like the same service (same name, or the same icon picture) — offered as
 * "add as a backup link of X" after adding. Icons shared by 3+ hosts (generic fallbacks) do not count.
 */
export async function findSimilarSite(siteId: string) {
  const me = await prisma.site.findUnique({ where: { id: siteId } });
  if (!me) return null;
  const others = await prisma.site.findMany({ where: { id: { not: siteId } }, select: { id: true, name: true, url: true, iconFile: true } });
  const myHost = hostOf(me.url);
  const byName = others.find((o) => norm(o.name) && norm(o.name) === norm(me.name) && hostOf(o.url) !== myHost);
  if (byName) return { id: byName.id, name: byName.name };
  const mine = await iconHash(me.iconFile);
  if (!mine) return null;
  const hosts = new Map<string, Set<string>>();
  const hashes = new Map<string, string>();
  for (const o of others) {
    if (!o.iconFile) continue;
    const h = hashes.get(o.iconFile) ?? (await iconHash(o.iconFile));
    hashes.set(o.iconFile, h);
    if (!h) continue;
    if (!hosts.has(h)) hosts.set(h, new Set());
    hosts.get(h)!.add(hostOf(o.url));
  }
  if ((hosts.get(mine)?.size ?? 0) >= 3) return null;
  const byIcon = others.find((o) => o.iconFile && hashes.get(o.iconFile) === mine && hostOf(o.url) !== myHost);
  return byIcon ? { id: byIcon.id, name: byIcon.name } : null;
}

export { withLinks as siteWithLinks };
