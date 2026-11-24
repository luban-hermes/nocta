import { prisma } from "@/lib/db";
import { canView, requireAdmin } from "@/lib/auth";
import { contentDTO, siteDTO } from "@/lib/data";
import { fail, json } from "@/lib/http";
import { fetchCustomIcon, readIcon, refreshIcon, removeIconFile, saveCustomIcon } from "@/lib/icons";

type Ctx = { params: Promise<{ kind: string; id: string }> };
export const dynamic = "force-dynamic";

async function load(kind: string, id: string) {
  if (kind === "site") return prisma.site.findUnique({ where: { id } });
  if (kind === "content") return prisma.content.findUnique({ where: { id } });
  return null;
}

/** the cached icon of a bookmark (the URL carries ?v=… so it can be cached for long) */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await canView())) return new Response(null, { status: 401 });
  const { kind, id } = await params;
  const rec = await load(kind, id);
  const file = rec?.iconFile ? await readIcon(rec.iconFile) : null;
  if (!file) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(file.buf), {
    headers: {
      "content-type": file.type,
      "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      // SVG icons must never run script, even when opened directly
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

/**
 * admin: change the icon.
 *  - multipart form with `file` → upload an image
 *  - JSON { url }                → fetch the image from a URL (SSRF guarded)
 *  - JSON { refetch: true }      → discard any custom icon and discover it again
 */
export async function POST(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { kind, id } = await params;
  if (kind !== "site" && kind !== "content") return fail("未知类型", 404);
  const rec = await load(kind, id);
  if (!rec) return fail("书签不存在", 404);
  const dto = (r: NonNullable<Awaited<ReturnType<typeof load>>>) => (kind === "site" ? siteDTO(r as never) : contentDTO(r as never));
  try {
    let file = "", favicon: string | undefined;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = (await req.formData()).get("file");
      if (!(f instanceof Blob) || !f.size) return fail("请选择图片");
      if (f.size > 1024 * 1024) return fail("图片不能超过 1 MB");
      file = await saveCustomIcon(id, Buffer.from(await f.arrayBuffer()));
    } else {
      const b = (await req.json().catch(() => ({}))) as { url?: string; refetch?: boolean };
      if (b.refetch) {
        const r = await refreshIcon(kind, id);
        if (!r?.iconFile) return fail("没有找到可用的图标，已退回为文字图标");
        return json(dto(r));
      }
      const url = (b.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return fail("请输入 http(s) 图片地址");
      file = await fetchCustomIcon(id, url);
      favicon = url.slice(0, 500);
    }
    if (rec.iconCustom && rec.iconFile !== file) await removeIconFile(rec.iconFile);
    const data = { iconFile: file, iconCustom: true, iconCheckedAt: new Date(), ...(favicon ? { favicon } : {}) };
    const r = kind === "site" ? await prisma.site.update({ where: { id }, data }) : await prisma.content.update({ where: { id }, data });
    return json(dto(r));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "图标更新失败");
  }
}
