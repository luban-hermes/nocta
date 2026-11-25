import { canView } from "@/lib/auth";
import { loadCategories, loadContents, loadSites, loadVersions } from "@/lib/data";
import { fail, jsonz } from "@/lib/http";

export const dynamic = "force-dynamic";

/** one full list, compressed: ?kind=site | content | category (v0.4.0) */
export async function GET(req: Request) {
  if (!(await canView())) return fail("需要登录", 401);
  const kind = new URL(req.url).searchParams.get("kind");
  const [items, version] = await Promise.all([kind === "site" ? loadSites() : kind === "content" ? loadContents() : kind === "category" ? loadCategories() : null, loadVersions()]);
  if (!items) return fail("未知类型", 404);
  return jsonz(req, { items, version });
}
