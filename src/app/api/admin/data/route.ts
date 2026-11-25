import { requireAdmin } from "@/lib/auth";
import { loadAdminData } from "@/lib/data";
import { jsonz } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  return jsonz(req, await loadAdminData());
}
