import { canView } from "@/lib/auth";
import { loadAppData } from "@/lib/data";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await canView())) return fail("需要登录", 401);
  return json(await loadAppData(), { headers: { "cache-control": "no-store" } });
}
