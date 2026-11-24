import "server-only";
import { randomBytes } from "node:crypto";
import tls from "node:tls";
import type { Monitor } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { assertPublicHost } from "./ssrf";

export const SLOW_MS = 2000;
export const SSL_WARN_DAYS = 14;
export const SERVER_WARN_PCT = 90;
/** a server is offline when it has not reported for this many agent intervals */
const OFFLINE_FACTOR = 3;

export const newAgentToken = () => "nct_" + randomBytes(18).toString("base64url");

/** parse `ssh root@203.0.113.50 -p 2222`, `root@host:2222`, `ssh -p 2222 user@host` … */
export function parseSsh(input: string): { user: string; host: string; port: number } | null {
  const s = input.trim().replace(/^ssh\s+/i, "ssh ");
  const portFlag = s.match(/(?:^|\s)-p\s*(\d{1,5})/);
  const target = s
    .replace(/(?:^|\s)-p\s*\d{1,5}/, " ")
    .replace(/(?:^|\s)-[a-zA-Z]\s+\S+/g, " ")
    .replace(/^ssh\s+/i, "")
    .trim()
    .split(/\s+/)
    .find((t) => /@|^[\w.-]+\.[\w.-]+$|^\d+\.\d+\.\d+\.\d+$/.test(t));
  if (!target) return null;
  const m = target.match(/^(?:([\w.-]+)@)?(\[[0-9a-f:]+\]|[\w.-]+)(?::(\d{1,5}))?$/i);
  if (!m) return null;
  const port = Number(portFlag?.[1] ?? m[3] ?? 22);
  if (!(port > 0 && port < 65536)) return null;
  return { user: m[1] ?? "root", host: m[2].replace(/^\[|\]$/g, ""), port };
}

/** read the TLS certificate and return days until expiry */
export function sslInfo(host: string, port = 443, timeoutMs = 6000): Promise<{ days: number; expiresAt: Date } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { days: number; expiresAt: Date } | null) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(v);
    };
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = sock.getPeerCertificate();
      if (!cert?.valid_to) return finish(null);
      const expiresAt = new Date(cert.valid_to);
      finish({ days: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000), expiresAt });
    });
    sock.on("error", () => finish(null));
    sock.on("timeout", () => finish(null));
  });
}

export interface CheckResult {
  ok: boolean;
  status: number | null;
  latency: number | null;
  error: string;
  ssl: { days: number; expiresAt: Date } | null;
}

export async function runHttpCheck(m: Pick<Monitor, "url" | "method" | "expectStatus" | "timeoutMs">): Promise<CheckResult> {
  const u = new URL(m.url);
  if (!(await getSettings()).allowPrivateMonitors) await assertPublicHost(u.hostname);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), m.timeoutMs || 10000);
  const sslP = u.protocol === "https:" ? sslInfo(u.hostname, Number(u.port || 443)) : Promise.resolve(null);
  const t0 = performance.now();
  let status: number | null = null;
  let error = "";
  try {
    const res = await fetch(u, {
      method: m.method === "HEAD" ? "HEAD" : "GET",
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "user-agent": "NoctaMonitor/0.1 (+https://github.com/luban-hermes/nocta)" },
    });
    status = res.status;
    await res.body?.cancel().catch(() => {});
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    error = err.name === "AbortError" ? `超时（>${m.timeoutMs}ms）` : err.cause?.code || err.cause?.message || err.message;
  } finally {
    clearTimeout(timer);
  }
  const latency = status != null ? Math.round(performance.now() - t0) : null;
  const ssl = await sslP;
  const ok = status != null && (m.expectStatus ? status === m.expectStatus : status < 400);
  if (status != null && !ok) error = `HTTP ${status}`;
  return { ok, status, latency, error, ssl };
}

export function httpStatusOf(r: CheckResult): "up" | "warn" | "down" {
  if (!r.ok) return "down";
  if ((r.latency ?? 0) > SLOW_MS || (r.ssl && r.ssl.days < SSL_WARN_DAYS)) return "warn";
  return "up";
}

/** run one check for a monitor, store it and update the monitor row */
export async function checkMonitor(id: string) {
  const m = await prisma.monitor.findUnique({ where: { id } });
  if (!m || m.kind !== "http") return null;
  let r: CheckResult;
  try {
    r = await runHttpCheck(m);
  } catch (e) {
    r = { ok: false, status: null, latency: null, error: e instanceof Error ? e.message : String(e), ssl: null };
  }
  const status = httpStatusOf(r);
  const failCount = r.ok ? 0 : m.failCount + 1;
  await prisma.$transaction([
    prisma.check.create({ data: { monitorId: m.id, ok: r.ok, status: r.status, latency: r.latency, error: r.error.slice(0, 300) } }),
    prisma.monitor.update({
      where: { id: m.id },
      data: {
        status: m.paused ? "paused" : status,
        lastStatus: r.status,
        lastLatency: r.latency,
        lastError: r.error.slice(0, 300),
        lastCheckedAt: new Date(),
        failCount,
        ...(r.ssl ? { sslDays: r.ssl.days, sslExpiresAt: r.ssl.expiresAt } : {}),
      },
    }),
  ]);
  if (status === "down" && failCount === 1) console.warn(`[nocta] monitor "${m.name}" is DOWN: ${r.error}`);
  return r;
}

/** derived status of a server monitor from its last report */
export function serverStatusOf(m: Pick<Monitor, "paused" | "lastReportAt" | "interval" | "cpu" | "mem" | "disk">): "pending" | "up" | "warn" | "down" | "paused" {
  if (m.paused) return "paused";
  if (!m.lastReportAt) return "pending";
  const age = (Date.now() - m.lastReportAt.getTime()) / 1000;
  if (age > Math.max(90, (m.interval || 30) * OFFLINE_FACTOR)) return "down";
  if ((m.cpu ?? 0) > SERVER_WARN_PCT || (m.mem ?? 0) > SERVER_WARN_PCT || (m.disk ?? 0) > SERVER_WARN_PCT) return "warn";
  return "up";
}

export function effectiveStatus(m: Monitor) {
  if (m.kind === "server") return serverStatusOf(m);
  return m.paused ? "paused" : (m.status as "pending" | "up" | "warn" | "down");
}

/** the alert reason shown on a card, or "" */
export function alertOf(m: Monitor): string {
  const st = effectiveStatus(m);
  if (st === "paused" || st === "pending") return "";
  if (m.kind === "server") {
    if (st === "down") return "探针已失联";
    const hot = [m.cpu! > SERVER_WARN_PCT && "CPU", m.mem! > SERVER_WARN_PCT && "内存", m.disk! > SERVER_WARN_PCT && "磁盘"].filter(Boolean);
    return hot.length ? `${hot.join("、")} 使用率超过 ${SERVER_WARN_PCT}%` : "";
  }
  if (st === "down") return m.lastError || "无法访问";
  if (m.sslDays != null && m.sslDays < SSL_WARN_DAYS) return `SSL 证书 ${m.sslDays} 天后过期`;
  if ((m.lastLatency ?? 0) > SLOW_MS) return `响应缓慢（${m.lastLatency}ms）`;
  return "";
}

/* ---------------- creation helpers (shared by the API and the AI assistant) ---------------- */

export async function createHttpMonitor(input: { url: string; name?: string; interval?: number; method?: string; expectStatus?: number | null; timeoutMs?: number }) {
  const u = new URL(input.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("只支持 http/https 地址");
  if (!(await getSettings()).allowPrivateMonitors) await assertPublicHost(u.hostname);
  const m = await prisma.monitor.create({
    data: {
      kind: "http",
      name: (input.name || u.hostname + (u.pathname !== "/" ? u.pathname : "")).slice(0, 60),
      url: u.toString(),
      method: input.method === "HEAD" ? "HEAD" : "GET",
      interval: clampInterval(input.interval ?? 60),
      expectStatus: input.expectStatus ?? null,
      timeoutMs: Math.min(60000, Math.max(1000, input.timeoutMs ?? 10000)),
    },
  });
  // first check right away so the card is not empty
  void checkMonitor(m.id).catch(() => {});
  return m;
}

export async function createServerMonitor(input: { host: string; port?: number; user?: string; name?: string; interval?: number }) {
  const host = input.host.trim();
  if (!/^[\w.:-]+$/.test(host)) throw new Error("主机地址不合法");
  return prisma.monitor.create({
    data: {
      kind: "server",
      name: (input.name || host).slice(0, 60),
      host,
      port: input.port && input.port > 0 && input.port < 65536 ? input.port : 22,
      sshUser: (input.user || "root").slice(0, 32),
      interval: clampInterval(input.interval ?? 30),
      token: newAgentToken(),
    },
  });
}

export const clampInterval = (n: number) => Math.min(86400, Math.max(10, Math.round(Number(n) || 60)));
