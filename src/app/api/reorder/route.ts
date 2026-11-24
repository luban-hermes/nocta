import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";

/**
 * persist a drag-and-drop order: `ids` is the complete new order of one list
 * (all sites, all contents, or the categories of one kind); each item's `sort` becomes its index.
 */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ kind?: string; ids?: unknown }>(req);
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 5000) : [];
  if (!ids.length || new Set(ids).size !== ids.length) return fail("排序数据无效");
  const model = b.kind === "site" ? prisma.site : b.kind === "content" ? prisma.content : b.kind === "category" ? prisma.category : null;
  if (!model) return fail("未知的排序类型");
  // @ts-expect-error — the three delegates share the update signature we use here
  await prisma.$transaction(ids.map((id, i) => model.updateMany({ where: { id }, data: { sort: i } })));
  return json({ ok: true });
}
