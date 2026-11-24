import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { bool, envRaw } from "./env";
import { decrypt, encrypt, mask } from "./secret";

/*
 * All runtime configuration (item 4). Stored in the Setting table, cached in memory (globalThis, so
 * every route bundle shares it) and invalidated on save — changes apply immediately, no restart.
 * Precedence: value saved in the UI › environment variable (legacy default) › built-in default.
 */

type Kind = "bool" | "string" | "int" | "secret";
type Def = { kind: Kind; def: string | number | boolean; env?: string; min?: number; max?: number; max_len?: number };

export const DEFS = {
  publicMode: { kind: "bool", def: true, env: "PUBLIC_MODE" },
  publicMonitors: { kind: "bool", def: false, env: "PUBLIC_MONITORS" },
  aiBaseUrl: { kind: "string", def: "", env: "AI_BASE_URL", max_len: 300 },
  aiApiKey: { kind: "secret", def: "", env: "AI_API_KEY" },
  aiModel: { kind: "string", def: "", env: "AI_MODEL", max_len: 100 },
  monitorScheduler: { kind: "bool", def: true, env: "MONITOR_SCHEDULER" },
  allowPrivateMonitors: { kind: "bool", def: true, env: "ALLOW_PRIVATE_MONITORS" },
  retentionDays: { kind: "int", def: 7, env: "MONITOR_RETENTION_DAYS", min: 1, max: 365 },
  timezone: { kind: "string", def: "", env: "TZ", max_len: 64 },
  // S3-compatible backup (item 5)
  s3Endpoint: { kind: "string", def: "", max_len: 300 },
  s3Region: { kind: "string", def: "auto", max_len: 64 },
  s3Bucket: { kind: "string", def: "", max_len: 128 },
  s3AccessKey: { kind: "string", def: "", max_len: 256 },
  s3SecretKey: { kind: "secret", def: "" },
  s3Prefix: { kind: "string", def: "nocta-backups", max_len: 200 },
  s3PathStyle: { kind: "bool", def: true },
  backupSchedule: { kind: "string", def: "off", max_len: 10 }, // off | daily | weekly
  backupHour: { kind: "int", def: 3, min: 0, max: 23 },
  backupKeep: { kind: "int", def: 7, min: 1, max: 365 },
} satisfies Record<string, Def>;

export type SettingKey = keyof typeof DEFS;
type ValueOf<K extends SettingKey> = (typeof DEFS)[K]["kind"] extends "bool" ? boolean : (typeof DEFS)[K]["kind"] extends "int" ? number : string;
export type Settings = { [K in SettingKey]: ValueOf<K> } & { aiEnabled: boolean };
export type Source = "db" | "env" | "default";

type Cache = { s: Settings; src: Record<SettingKey, Source>; raw: Map<string, string> };
const g = globalThis as unknown as { __noctaSettings?: Cache | null; __noctaSettingsP?: Promise<Cache> | null };

const parse = (d: Def, v: string): string | number | boolean => {
  if (d.kind === "bool") return bool(v, d.def as boolean);
  if (d.kind === "int") {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(d.max ?? n, Math.max(d.min ?? n, n)) : (d.def as number);
  }
  return v;
};

async function load(): Promise<Cache> {
  const rows = await prisma.setting.findMany();
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const s: Record<string, unknown> = {};
  const src = {} as Record<SettingKey, Source>;
  for (const [k, d] of Object.entries(DEFS) as [SettingKey, Def][]) {
    if (raw.has(k)) {
      const v = JSON.parse(raw.get(k)!) as string | number | boolean;
      s[k] = d.kind === "secret" ? decrypt(String(v)) : d.kind === "string" ? String(v) : parse(d, String(v));
      src[k] = "db";
    } else if (d.env && envRaw(d.env) !== undefined) {
      s[k] = parse(d, envRaw(d.env)!);
      src[k] = "env";
    } else {
      s[k] = d.def;
      src[k] = "default";
    }
  }
  const out = s as Settings;
  out.aiBaseUrl = out.aiBaseUrl.replace(/\/+$/, "");
  out.aiEnabled = !!(out.aiBaseUrl && out.aiModel && (out.aiApiKey || /localhost|127\.0\.0\.1|ollama|host\.docker\.internal/.test(out.aiBaseUrl)));
  if (out.timezone && validTz(out.timezone)) process.env.TZ = out.timezone;
  return { s: out, src, raw };
}

async function cache(): Promise<Cache> {
  if (g.__noctaSettings) return g.__noctaSettings;
  if (!g.__noctaSettingsP)
    g.__noctaSettingsP = load()
      .then((c) => (g.__noctaSettings = c))
      .finally(() => (g.__noctaSettingsP = null));
  return g.__noctaSettingsP;
}

export async function getSettings(): Promise<Settings> {
  return (await cache()).s;
}
export async function getSources() {
  return (await cache()).src;
}
export function invalidateSettings() {
  g.__noctaSettings = null;
}

export const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** validate + persist a partial update. Secrets: undefined = keep, "" = clear. */
export async function saveSettings(patch: Partial<Record<SettingKey, unknown>>) {
  const ops = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFS) || v === undefined) continue;
    const d = DEFS[k as SettingKey] as Def;
    let val: string | number | boolean;
    if (d.kind === "bool") val = typeof v === "boolean" ? v : bool(String(v), d.def as boolean);
    else if (d.kind === "int") val = parse(d, String(v)) as number;
    else {
      val = String(v ?? "").trim();
      if (d.max_len && val.length > d.max_len) throw new Error(`${k} 太长`);
      if (k === "timezone" && val && !validTz(val)) throw new Error("无效的时区");
      if (k === "backupSchedule" && !["off", "daily", "weekly"].includes(val)) throw new Error("无效的备份频率");
      if ((k === "aiBaseUrl" || k === "s3Endpoint") && val && !/^https?:\/\/[^\s]+$/i.test(val)) throw new Error(k === "aiBaseUrl" ? "AI Base URL 需以 http(s):// 开头" : "S3 Endpoint 需以 http(s):// 开头");
      if (d.kind === "secret") val = encrypt(val);
    }
    const value = JSON.stringify(val);
    ops.push(prisma.setting.upsert({ where: { key: k }, create: { key: k, value }, update: { value } }));
  }
  if (ops.length) await prisma.$transaction(ops);
  invalidateSettings();
  return getSettings();
}

/** what the settings page may see: secrets only as masks */
export async function publicSettings() {
  const { s, src } = await cache();
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(DEFS) as [SettingKey, Def][]) out[k] = d.kind === "secret" ? { set: !!s[k], mask: mask(String(s[k])) } : s[k];
  return { values: out, sources: src, aiEnabled: s.aiEnabled };
}

/* ---------------- internal keys (not part of DEFS / the settings form) ---------------- */

export async function getInternal(key: string): Promise<string | null> {
  const r = await prisma.setting.findUnique({ where: { key } });
  return r ? (JSON.parse(r.value) as string) : null;
}
export async function setInternal(key: string, value: string) {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/** random secret that signs session cookies, created on first use (SESSION_SECRET env still wins) */
export async function sessionSecret() {
  const e = envRaw("SESSION_SECRET");
  if (e) return e;
  const gg = globalThis as unknown as { __noctaSess?: string };
  if (gg.__noctaSess) return gg.__noctaSess;
  let v = await getInternal("auth.sessionSecret");
  if (!v) {
    v = encrypt(randomBytes(32).toString("base64"));
    await prisma.setting.upsert({ where: { key: "auth.sessionSecret" }, create: { key: "auth.sessionSecret", value: JSON.stringify(v) }, update: {} });
    v = (await getInternal("auth.sessionSecret"))!;
  }
  return (gg.__noctaSess = decrypt(v));
}
