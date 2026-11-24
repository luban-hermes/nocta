import { requireAdmin } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { checkMonitor } from "@/lib/monitor";

type Ctx = { params: Promise<{ id: string }> };

/** run a check right now */
export async function POST(_req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const r = await checkMonitor(id);
  if (!r) return fail("只有 HTTP 监控可以立即检查", 400);
  return json({ ok: r.ok, status: r.status, latency: r.latency, error: r.error, sslDays: r.ssl?.days ?? null });
}
