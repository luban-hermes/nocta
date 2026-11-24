import "server-only";
import { prisma } from "./db";
import { env } from "./env";
import { checkMonitor } from "./monitor";
import { ensureDefaultCategories } from "./bookmarks";

const TICK_MS = 5000;
const CONCURRENCY = 6;

const g = globalThis as unknown as { __noctaScheduler?: { timer: NodeJS.Timeout; running: Set<string>; lastPrune: number } };

async function tick() {
  const state = g.__noctaScheduler!;
  const now = Date.now();
  const monitors = await prisma.monitor.findMany({
    where: { kind: "http", paused: false },
    select: { id: true, interval: true, lastCheckedAt: true },
  });
  const due = monitors.filter((m) => !state.running.has(m.id) && (!m.lastCheckedAt || now - m.lastCheckedAt.getTime() >= Math.max(10, m.interval) * 1000 - 500));
  const slots = Math.max(0, CONCURRENCY - state.running.size);
  for (const m of due.slice(0, slots)) {
    state.running.add(m.id);
    checkMonitor(m.id)
      .catch((e) => console.error("[nocta] check failed", m.id, e))
      .finally(() => state.running.delete(m.id));
  }
  // prune old checks / metrics once an hour
  if (now - state.lastPrune > 3_600_000) {
    state.lastPrune = now;
    const before = new Date(now - env.retentionDays * 86_400_000);
    await prisma.check.deleteMany({ where: { createdAt: { lt: before } } });
    await prisma.metric.deleteMany({ where: { createdAt: { lt: before } } });
  }
}

export async function startScheduler() {
  try {
    await ensureDefaultCategories();
  } catch (e) {
    console.error("[nocta] could not prepare default categories (did migrations run?)", e);
  }
  if (!env.schedulerEnabled || g.__noctaScheduler) return;
  const state = { running: new Set<string>(), lastPrune: 0, timer: undefined as unknown as NodeJS.Timeout };
  g.__noctaScheduler = state;
  state.timer = setInterval(() => {
    tick().catch((e) => console.error("[nocta] scheduler tick failed", e));
  }, TICK_MS);
  state.timer.unref?.();
  console.log("[nocta] monitor scheduler started");
}
