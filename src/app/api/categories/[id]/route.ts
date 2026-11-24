import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const cur = await prisma.category.findUnique({ where: { id } });
  if (!cur) return fail("分类不存在", 404);
  const b = await body<{ name?: string; icon?: string; move?: "up" | "down" }>(req);
  if (b.move) {
    const list = await prisma.category.findMany({ where: { kind: cur.kind }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
    const i = list.findIndex((c) => c.id === id);
    const j = b.move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      await prisma.$transaction(list.map((c, k) => prisma.category.update({ where: { id: c.id }, data: { sort: k } })));
    }
    return json({ ok: true });
  }
  const name = b.name?.trim().slice(0, 20);
  if (name && name !== cur.name && (await prisma.category.findFirst({ where: { kind: cur.kind, name } }))) return fail("已存在同名分类");
  const c = await prisma.category.update({ where: { id }, data: { ...(name ? { name } : {}), ...(b.icon != null ? { icon: b.icon.slice(0, 4) } : {}) } });
  return json(c);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  await prisma.category.delete({ where: { id } }).catch(() => null); // items fall back to 未分类 (SetNull)
  return json({ ok: true });
}
