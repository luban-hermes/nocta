import "server-only";
import { prisma } from "./db";

/*
 * Sort gaps (v0.4.1). A drag-and-drop move writes only the moved row, with a `sort` halfway between its new
 * neighbours (/api/reorder). Lists whose `sort` values are consecutive integers (data from before v0.4.0, bulk
 * imports, restores of old backups) have no room in between, so the first move had to renumber the whole table
 * and send every new value back (183 ms at 5000 rows). This backfill spaces the values 1024 apart once, at
 * start-up and after a restore, keeping the order exactly as it is. It only runs when some neighbours are
 * closer than 2, so a normal start does one cheap read.
 */
export const SORT_GAP = 1024;
const TABLES = [
  { t: "Site", age: "ASC" }, // sites: oldest first on equal sort
  { t: "Content", age: "DESC" }, // contents: newest first
] as const;

export async function ensureSortGaps() {
  const out: Record<string, number> = {};
  for (const { t, age } of TABLES) {
    const order = `ORDER BY pinned DESC, sort ASC, createdAt ${age}, id`;
    const [row] = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS n FROM (SELECT sort - LAG(sort) OVER (${order}) AS d, pinned = LAG(pinned) OVER (${order}) AS same FROM ${t}) WHERE same AND d < 2`,
    );
    if (!Number(row?.n ?? 0)) continue;
    out[t] = await prisma.$executeRawUnsafe(
      `UPDATE ${t} SET sort = r.rn * ${SORT_GAP} FROM (SELECT id, ROW_NUMBER() OVER (${order}) AS rn FROM ${t}) AS r WHERE ${t}.id = r.id`,
    );
  }
  if (Object.keys(out).length) console.log("[nocta] sort order spaced out for single-row moves", out);
  return out;
}
