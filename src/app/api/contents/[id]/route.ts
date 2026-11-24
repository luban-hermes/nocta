import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { contentDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { joinTags } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const b = await body<{ title?: string; summary?: string; tags?: string[] | string; note?: string; read?: boolean; categoryId?: string | null; cover?: string }>(req);
  const data: Record<string, unknown> = {};
  if (b.title != null) data.title = b.title.trim().slice(0, 200) || "未命名";
  if (b.summary != null) data.summary = b.summary.slice(0, 500);
  if (b.tags != null) data.tags = joinTags(b.tags);
  if (b.note != null) data.note = b.note.slice(0, 5000);
  if (b.read != null) data.read = !!b.read;
  if (b.cover != null) data.cover = b.cover.slice(0, 1000);
  if (b.categoryId !== undefined) data.categoryId = b.categoryId || null;
  const c = await prisma.content.update({ where: { id }, data }).catch(() => null);
  return c ? json(contentDTO(c)) : fail("内容不存在", 404);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  await prisma.content.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
