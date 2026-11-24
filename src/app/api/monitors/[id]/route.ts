import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isAdmin, requireAdmin } from "@/lib/auth";
import { monitorsWithStats } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { clampInterval, newAgentToken } from "@/lib/monitor";
import { normalizeUrl } from "@/lib/utils";
import type { MonitorDetail } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Ctx) {
  const admin = await isAdmin();
  if (!admin && !(await getSettings()).publicMonitors) return fail("需要管理员登录", 401);
  const { id } = await params;
  const m = await prisma.monitor.findUnique({ where: { id } });
  if (!m) return fail("监控不存在", 404);
  const since = new Date(Date.now() - 86_400_000);
  const [dto] = await monitorsWithStats([m], admin);
  const [checks, metrics] = await Promise.all([
    prisma.check.findMany({ where: { monitorId: id, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 3000 }),
    prisma.metric.findMany({ where: { monitorId: id, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 3000 }),
  ]);
  const out: MonitorDetail = {
    monitor: dto,
    checks: checks.map((c) => ({ ok: c.ok, status: c.status, latency: c.latency, error: c.error, createdAt: c.createdAt.toISOString() })),
    metrics: metrics.map((x) => ({ cpu: x.cpu, mem: x.mem, disk: x.disk, rxRate: x.rxRate, txRate: x.txRate, createdAt: x.createdAt.toISOString() })),
  };
  return json(out, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  const m = await prisma.monitor.findUnique({ where: { id } });
  if (!m) return fail("监控不存在", 404);
  const b = await body<{ name?: string; url?: string; interval?: number; paused?: boolean; method?: string; expectStatus?: number | null; timeoutMs?: number; host?: string; port?: number; sshUser?: string; rotateToken?: boolean }>(req);
  const data: Record<string, unknown> = {};
  if (b.name != null) data.name = b.name.trim().slice(0, 60) || m.name;
  if (b.interval != null) data.interval = clampInterval(b.interval);
  if (b.paused != null) {
    data.paused = !!b.paused;
    data.status = b.paused ? "paused" : "pending";
    if (!b.paused) data.lastCheckedAt = null; // check again right away
  }
  if (m.kind === "http") {
    if (b.url != null) {
      const u = normalizeUrl(b.url);
      if (!u) return fail("网址无效");
      data.url = u.toString();
      data.lastCheckedAt = null;
    }
    if (b.method != null) data.method = b.method === "HEAD" ? "HEAD" : "GET";
    if (b.expectStatus !== undefined) data.expectStatus = b.expectStatus ? Number(b.expectStatus) : null;
    if (b.timeoutMs != null) data.timeoutMs = Math.min(60000, Math.max(1000, Number(b.timeoutMs) || 10000));
  } else {
    if (b.host != null && /^[\w.:-]+$/.test(b.host.trim())) data.host = b.host.trim();
    if (b.port != null && b.port > 0 && b.port < 65536) data.port = Number(b.port);
    if (b.sshUser != null) data.sshUser = b.sshUser.trim().slice(0, 32) || "root";
    if (b.rotateToken) data.token = newAgentToken();
  }
  await prisma.monitor.update({ where: { id }, data });
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  await prisma.monitor.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
