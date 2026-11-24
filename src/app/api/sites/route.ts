import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createSiteFromUrl } from "@/lib/bookmarks";
import { siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { normalizeUrl } from "@/lib/utils";

/** create a site. With only `url`, metadata is fetched automatically. */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ url?: string; name?: string; categoryId?: string; description?: string; favicon?: string }>(req);
  const u = normalizeUrl(b.url ?? "");
  if (!u) return fail("请输入有效的网址");
  if (b.name && b.favicon != null) {
    const s = await prisma.site.create({ data: { name: b.name.slice(0, 40), url: u.toString(), favicon: b.favicon, description: b.description ?? "", categoryId: b.categoryId || null } });
    return json(siteDTO(s), 201);
  }
  const { site } = await createSiteFromUrl(u, { name: b.name, categoryId: b.categoryId });
  return json(siteDTO(site), 201);
}
