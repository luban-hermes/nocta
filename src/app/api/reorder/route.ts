import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";

/*
 * Persist a drag-and-drop move.
 *
 *  - sites / contents (v0.4.0): { kind, id, after, before } — `after` / `before` are the item's new neighbours
 *    in the list the user was looking at (either may be null). Only the moved row is updated: it gets a `sort`
 *    between its neighbour and the next item, using gaps of 1024. When there is no gap left, the other rows are
 *    renumbered once in a single SQL statement and the new values are returned as `sorts`.
 *  - any kind (categories): { kind, ids } — the complete new order; each item's `sort` becomes its index.
 */
const GAP = 1024;
type Row = { id: string; pinned: number | boolean; sort: number | bigint; createdAt: number | bigint };
const n = (x: number | bigint) => Number(x);

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ kind?: string; ids?: unknown; id?: unknown; after?: unknown; before?: unknown }>(req);

  if (typeof b.id === "string" && (b.kind === "site" || b.kind === "content")) {
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    try {
      return json(await moveOne(b.kind, b.id, str(b.after), str(b.before)));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "排序保存失败");
    }
  }

  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string") : [];
  if (!ids.length || new Set(ids).size !== ids.length) return fail("排序数据无效");
  const model = b.kind === "site" ? prisma.site : b.kind === "content" ? prisma.content : b.kind === "category" ? prisma.category : null;
  if (!model) return fail("未知的排序类型");
  // no silent cap any more (v0.3.1 dropped everything after the 5000th id)
  await prisma.$transaction(
    async (tx) => {
      const m = b.kind === "site" ? tx.site : b.kind === "content" ? tx.content : tx.category;
      for (let i = 0; i < ids.length; i++) await (m as typeof tx.category).updateMany({ where: { id: ids[i] }, data: { sort: i } });
    },
    { timeout: 120_000 },
  );
  return json({ ok: true });
}

async function moveOne(kind: "site" | "content", id: string, after: string | null, before: string | null) {
  const T = kind === "site" ? "Site" : "Content";
  // sites: oldest first on equal sort; contents: newest first (same as the lists)
  const asc = kind === "site";
  return prisma.$transaction(
    async (tx) => {
      const get = async (x: string | null) => (x ? (await tx.$queryRawUnsafe<Row[]>(`SELECT id, CAST(pinned AS INTEGER) AS pinned, sort, CAST(createdAt AS INTEGER) AS createdAt FROM ${T} WHERE id = ?`, x))[0] ?? null : null);
      const me = await get(id);
      if (!me) throw new Error("书签不存在");
      // a neighbour across the pinned / unpinned boundary does not say anything about the position
      const same = (r: Row | null) => (r && r.id !== id && Boolean(r.pinned) === Boolean(me.pinned) ? r : null);
      const bounds = async () => {
        const a = same(await get(after)), z = a ? null : same(await get(before));
        if (!a && !z) return null;
        if (a) {
          const later = asc ? "createdAt > ?" : "createdAt < ?";
          const succ = (await tx.$queryRawUnsafe<Row[]>(`SELECT id, CAST(pinned AS INTEGER) AS pinned, sort, CAST(createdAt AS INTEGER) AS createdAt FROM ${T} WHERE pinned = ? AND id <> ? AND id <> ? AND (sort > ? OR (sort = ? AND ${later})) ORDER BY sort ASC, createdAt ${asc ? "ASC" : "DESC"} LIMIT 1`, me.pinned, id, a.id, a.sort, a.sort, a.createdAt))[0];
          return { lo: n(a.sort), hi: succ ? n(succ.sort) : n(a.sort) + 2 * GAP };
        }
        const earlier = asc ? "createdAt < ?" : "createdAt > ?";
        const pred = (await tx.$queryRawUnsafe<Row[]>(`SELECT id, CAST(pinned AS INTEGER) AS pinned, sort, CAST(createdAt AS INTEGER) AS createdAt FROM ${T} WHERE pinned = ? AND id <> ? AND id <> ? AND (sort < ? OR (sort = ? AND ${earlier})) ORDER BY sort DESC, createdAt ${asc ? "DESC" : "ASC"} LIMIT 1`, me.pinned, id, z!.id, z!.sort, z!.sort, z!.createdAt))[0];
        return { lo: pred ? n(pred.sort) : n(z!.sort) - 2 * GAP, hi: n(z!.sort) };
      };
      let bd = await bounds();
      if (!bd) return { ok: true, id, sort: n(me.sort) };
      let sorts: [string, number][] | undefined;
      if (bd.hi - bd.lo < 2) {
        // no room between the neighbours: renumber everybody else once (keeps their order), then retry
        await tx.$executeRawUnsafe(
          `UPDATE ${T} SET sort = r.rn * ${GAP} FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY pinned DESC, sort ASC, createdAt ${asc ? "ASC" : "DESC"}) AS rn FROM ${T} WHERE id <> ?) AS r WHERE ${T}.id = r.id`,
          id,
        );
        bd = (await bounds())!;
        sorts = [];
      }
      const sort = Math.floor((bd.lo + bd.hi) / 2);
      await tx.$executeRawUnsafe(`UPDATE ${T} SET sort = ?, updatedAt = ? WHERE id = ?`, sort, Date.now(), id);
      if (sorts) sorts = (await tx.$queryRawUnsafe<{ id: string; sort: number | bigint }[]>(`SELECT id, sort FROM ${T}`)).map((r) => [r.id, n(r.sort)]);
      return { ok: true, id, sort, ...(sorts ? { sorts } : {}) };
    },
    { timeout: 30_000 },
  );
}
