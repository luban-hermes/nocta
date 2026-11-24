import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ kind?: string; name?: string; icon?: string }>(req);
  const kind = b.kind === "content" ? "content" : b.kind === "site" ? "site" : null;
  const name = (b.name ?? "").trim().slice(0, 20);
  if (!kind || !name) return fail("请填写分类名称");
  if (await prisma.category.findFirst({ where: { kind, name } })) return fail("已存在同名分类");
  const max = await prisma.category.aggregate({ where: { kind }, _max: { sort: true } });
  const c = await prisma.category.create({ data: { kind, name, icon: (b.icon ?? "").slice(0, 4), sort: (max._max.sort ?? -1) + 1 } });
  return json(c, 201);
}
