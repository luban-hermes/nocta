import "server-only";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { checkMonitor } from "./monitor";
import { ensureDefaultCategories } from "./bookmarks";
import { backfillIcons } from "./icons";
import { runScheduledBackup } from "./backup";

const TICK_MS = 5000;
const CONCURRENCY = 6;

const g = globalThis as unknown as { __noctaScheduler?: { timer: NodeJS.Timeout; running: Set<string>; lastPrune: number } };

async function tick() {
  const state = g.__noctaScheduler!;
  const now = Date.now();
  const env = await getSettings();
  // hourly housekeeping runs even while checks are switched off in 设置
  if (now - state.lastPrune > 3_600_000) {
    state.lastPrune = now;
    void backfillIcons();
    const before = new Date(now - env.retentionDays * 86_400_000);
    await prisma.check.deleteMany({ where: { createdAt: { lt: before } } });
    await prisma.metric.deleteMany({ where: { createdAt: { lt: before } } });
  }
  void runScheduledBackup().catch((e) => console.error("[nocta] scheduled backup failed", e));
  if (!env.monitorScheduler) return;
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
}

export async function startScheduler() {
  // forgot the admin password? start once with NOCTA_RESET_PASSWORD=1 → the setup wizard comes back
  if (/^(1|true|yes)$/i.test(process.env.NOCTA_RESET_PASSWORD ?? "")) {
    await prisma.setting.deleteMany({ where: { key: "auth.passwordHash" } }).catch(() => {});
    console.warn("[nocta] NOCTA_RESET_PASSWORD: admin password cleared — open the site to set a new one, then remove the variable");
  }
  try {
    await ensureDefaultCategories();
  } catch (e) {
    console.error("[nocta] could not prepare default categories (did migrations run?)", e);
  }
  // icons for bookmarks created before the icon cache existed (runs in the background)
  setTimeout(() => void backfillIcons(), 3000);
  if (g.__noctaScheduler) return;
  const state = { running: new Set<string>(), lastPrune: 0, timer: undefined as unknown as NodeJS.Timeout };
  g.__noctaScheduler = state;
  state.timer = setInterval(() => {
    tick().catch((e) => console.error("[nocta] scheduler tick failed", e));
  }, TICK_MS);
  state.timer.unref?.();
  console.log("[nocta] scheduler started (monitor checks follow 设置 → 监控)");
}
