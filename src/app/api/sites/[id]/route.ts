import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { siteDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { normalizeUrl } from "@/lib/utils";
import { refreshIcon, removeIconFile } from "@/lib/icons";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const b = await body<{ name?: string; url?: string; description?: string; favicon?: string; categoryId?: string | null; pinned?: boolean }>(req);
  const data: Record<string, unknown> = {};
  if (b.name != null) data.name = b.name.trim().slice(0, 40) || "未命名";
  if (b.url != null) {
    const u = normalizeUrl(b.url);
    if (!u) return fail("网址无效");
    data.url = u.toString();
  }
  if (b.description != null) data.description = b.description.slice(0, 200);
  if (b.favicon != null) data.favicon = b.favicon.slice(0, 500);
  if (b.categoryId !== undefined) data.categoryId = b.categoryId || null;
  if (b.pinned != null) data.pinned = !!b.pinned;
  const s = await prisma.site.update({ where: { id }, data }).catch(() => null);
  if (!s) return fail("站点不存在", 404);
  // a new URL means a new site: re-fetch its icon unless the admin pinned a custom one
  if (data.url && !s.iconCustom) return json(siteDTO((await refreshIcon("site", id).catch(() => null)) ?? s));
  return json(siteDTO(s));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const s = await prisma.site.delete({ where: { id } }).catch(() => null);
  if (s?.iconCustom) await removeIconFile(s.iconFile);
  return json({ ok: true });
}
