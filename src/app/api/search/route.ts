import { canView } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, json } from "@/lib/http";
import { iconFileUrl } from "@/lib/iconver";
import { splitTags } from "@/lib/utils";

export const dynamic = "force-dynamic";

/*
 * ⌘K search (v0.4.1): the palette asks the server instead of downloading every site and every content first.
 * Slim rows only (what a result row shows), in list order (pinned first, then the drag order), sites before
 * contents; `n` caps the total (24 without a query, 60 with one — the same as the old local search).
 * Matching is a case-insensitive substring over the same fields as before.
 */
type SiteRow = { id: string; name: string; url: string; iconFile: string };
type ContentRow = { id: string; title: string; domain: string; tags: string; iconFile: string };

export async function GET(req: Request) {
  if (!(await canView())) return fail("需要登录", 401);
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const max = Math.min(100, Math.max(1, Number(sp.get("n")) || (q ? 60 : 24)));
  const where = (expr: string) => (q ? `WHERE instr(lower(${expr}), ?) > 0` : "");
  const args = q ? [q] : [];
  const sites = await prisma.$queryRawUnsafe<SiteRow[]>(
    `SELECT id, name, url, iconFile FROM Site ${where("name || char(1) || url || char(1) || description")} ORDER BY pinned DESC, sort ASC, createdAt ASC LIMIT ${max}`,
    ...args,
  );
  const left = max - sites.length;
  const contents = left
    ? await prisma.$queryRawUnsafe<ContentRow[]>(
        `SELECT id, title, domain, tags, iconFile FROM Content ${where("title || char(1) || summary || char(1) || domain || char(1) || replace(replace(tags, ',', ' '), '，', ' ')")} ORDER BY pinned DESC, sort ASC, createdAt DESC LIMIT ${left}`,
        ...args,
      )
    : [];
  return json(
    {
      q,
      sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.url, icon: iconFileUrl(s.iconFile) })),
      contents: contents.map((c) => ({ id: c.id, title: c.title, domain: c.domain, tags: splitTags(c.tags), icon: iconFileUrl(c.iconFile) })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
