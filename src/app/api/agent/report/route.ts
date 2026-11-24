import { prisma } from "@/lib/db";
import { body, fail, json } from "@/lib/http";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const pct = (used: number | null, total: number | null) => (used != null && total ? Math.min(100, Math.round((used / total) * 1000) / 10) : null);

/**
 * Push endpoint for agent/nocta-agent.sh.
 * Auth: `Authorization: Bearer <token>` (per-server token shown in the UI).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail("missing token", 401);
  const m = await prisma.monitor.findUnique({ where: { token } });
  if (!m || m.kind !== "server") return fail("invalid token", 401);
  if (m.paused) return json({ ok: true, paused: true, interval: m.interval });

  const b = await body<Record<string, unknown>>(req);
  const cpu = num(b.cpu);
  const memTotal = num(b.mem_total);
  const diskTotal = num(b.disk_total);
  const mem = pct(num(b.mem_used), memTotal);
  const disk = pct(num(b.disk_used), diskTotal);
  const rxRate = num(b.rx_rate);
  const txRate = num(b.tx_rate);
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

  await prisma.$transaction([
    prisma.monitor.update({
      where: { id: m.id },
      data: {
        hostname: str(b.hostname, 80) || m.hostname,
        os: [str(b.os, 80), str(b.kernel, 60)].filter(Boolean).join(" · ") || m.os,
        uptime: num(b.uptime) != null ? Math.round(num(b.uptime)!) : m.uptime,
        cpu: cpu != null ? Math.min(100, Math.round(cpu * 10) / 10) : null,
        mem,
        memTotal,
        disk,
        diskTotal,
        load: str(b.load, 40),
        rxRate,
        txRate,
        lastReportAt: new Date(),
        status: "up",
      },
    }),
    prisma.metric.create({ data: { monitorId: m.id, cpu: cpu ?? 0, mem: mem ?? 0, disk: disk ?? 0, rxRate: rxRate ?? 0, txRate: txRate ?? 0 } }),
  ]);
  return json({ ok: true, interval: m.interval });
}
