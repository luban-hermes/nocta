import { requireAdmin } from "@/lib/auth";
import { adminItems, type AdminSort } from "@/lib/data";
import { jsonz } from "@/lib/http";

export const dynamic = "force-dynamic";

const SORTS: AdminSort[] = ["default", "title", "date", "kind", "category"];

/** 书签管理 table, paged by the server: ?q=&sort=&dir=&offset=&limit= */
export async function GET(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const p = new URL(req.url).searchParams;
  const sort = (SORTS as string[]).includes(p.get("sort") ?? "") ? (p.get("sort") as AdminSort) : "default";
  return jsonz(req, await adminItems({ q: p.get("q") ?? "", sort, dir: p.get("dir") === "desc" ? "desc" : "asc", offset: Number(p.get("offset")) || 0, limit: Number(p.get("limit")) || 60 }));
}
