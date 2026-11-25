import { canView } from "@/lib/auth";
import { loadAppData } from "@/lib/data";
import { fail, jsonz } from "@/lib/http";

export const dynamic = "force-dynamic";

/** everything at once (kept for compatibility; the app itself uses /api/items + /api/sync since v0.4.0) */
export async function GET(req: Request) {
  if (!(await canView())) return fail("需要登录", 401);
  return jsonz(req, await loadAppData());
}
