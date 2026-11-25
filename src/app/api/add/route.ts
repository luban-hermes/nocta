import { requireAdmin } from "@/lib/auth";
import { addByUrl } from "@/lib/bookmarks";
import { contentDTO, siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { addLink, cleanLinks, findSimilarSite, siteWithLinks } from "@/lib/sitelinks";

/**
 * add by URL: bare domain → 站点, URL with a path → 内容 (force with `as`).
 * `backups` (item 13) makes it a site with backup links; a site that looks like an existing one comes back with `similar`.
 */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ url?: string; as?: "site" | "content"; backups?: string[] }>(req);
  const backups = (Array.isArray(b.backups) ? b.backups : []).filter((x) => typeof x === "string" && x.trim());
  try {
    if (backups.length) cleanLinks([{ url: b.url ?? "" }, ...backups.map((url) => ({ url }))]);
    const r = await addByUrl(b.url ?? "", backups.length ? "site" : b.as === "site" || b.as === "content" ? b.as : undefined);
    if (r.kind === "site") {
      for (const u of backups) await addLink(r.site.id, u).catch(() => null);
      const site = (await siteWithLinks(r.site.id)) ?? r.site;
      const similar = await findSimilarSite(r.site.id).catch(() => null);
      return json({ kind: "site", site: siteDTO(site), usedAi: r.usedAi, fetched: r.fetched, similar }, 201);
    }
    return json({ kind: "content", content: contentDTO(r.content), usedAi: r.usedAi, fetched: r.fetched }, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "添加失败");
  }
}
