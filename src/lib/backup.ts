import "server-only";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma } from "./db";
import { iconsDir } from "./icons";
import { DEFS, getInternal, getSettings, saveSettings, setInternal, type SettingKey, type Settings } from "./settings";

/*
 * S3-compatible backups (item 5): AWS S3, Cloudflare R2, MinIO, Backblaze B2, 阿里云 OSS / 腾讯云 COS (S3 API) …
 * One backup = one gzip'd JSON object: the non-secret settings + every table (categories, sites,
 * contents, monitors, checks, metrics) + the cached / uploaded icon files.
 * Secrets (AI key, S3 secret, admin password, session secret) are never written to a backup.
 */

export const FORMAT = "nocta-backup";
const VERSION = 1;
const NAME_RE = /nocta-backup-\d{8}-\d{6}(?:-[a-z-]+)?\.json\.gz$/;

/** settings that travel with a backup (connection details for the backup target itself stay as they are) */
const PORTABLE: SettingKey[] = ["publicMode", "publicMonitors", "aiBaseUrl", "aiModel", "monitorScheduler", "allowPrivateMonitors", "retentionDays", "timezone"];

export type S3Conf = Pick<Settings, "s3Endpoint" | "s3Region" | "s3Bucket" | "s3AccessKey" | "s3SecretKey" | "s3Prefix" | "s3PathStyle">;

export function s3Ready(c: S3Conf) {
  return !!(c.s3Bucket && c.s3AccessKey && c.s3SecretKey);
}

function client(c: S3Conf) {
  if (!s3Ready(c)) throw new Error("请先填写 S3 的 Bucket、Access Key 和 Secret Key");
  return new S3Client({
    region: c.s3Region || "auto",
    endpoint: c.s3Endpoint || undefined,
    forcePathStyle: c.s3PathStyle,
    credentials: { accessKeyId: c.s3AccessKey, secretAccessKey: c.s3SecretKey },
    // R2 / MinIO / OSS do not all support the newer default checksums
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
}

const prefixOf = (c: S3Conf) => {
  const p = (c.s3Prefix || "").replace(/^\/+|\/+$/g, "");
  return p ? p + "/" : "";
};

function s3Error(e: unknown): Error {
  const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number }; code?: string };
  const status = err.$metadata?.httpStatusCode;
  const map: Record<string, string> = {
    NoSuchBucket: "Bucket 不存在",
    InvalidAccessKeyId: "Access Key 无效",
    SignatureDoesNotMatch: "Secret Key 不正确（签名不匹配）",
    AccessDenied: "没有权限（检查密钥的 Bucket 读写权限）",
    PermanentRedirect: "Region / Endpoint 不匹配",
    AuthorizationHeaderMalformed: "Region 不正确",
  };
  const name = err.name ?? err.code ?? "";
  if (map[name]) return new Error(`${map[name]}（${name}）`);
  if (/ENOTFOUND|EAI_AGAIN/.test(err.message ?? "")) return new Error("无法解析 Endpoint 域名");
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(err.message ?? "")) return new Error("连接 Endpoint 失败：" + err.message);
  return new Error(`${name || "S3 错误"}${status ? ` (HTTP ${status})` : ""}：${(err.message ?? String(e)).slice(0, 200)}`);
}

/** list + write + delete a probe object: proves the credentials can do everything backups need */
export async function testS3(c: S3Conf) {
  const s3 = client(c);
  const t0 = Date.now();
  const key = `${prefixOf(c)}.nocta-test-${Date.now()}`;
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: c.s3Bucket, Prefix: prefixOf(c), MaxKeys: 1 }));
    await s3.send(new PutObjectCommand({ Bucket: c.s3Bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
    await s3.send(new DeleteObjectCommand({ Bucket: c.s3Bucket, Key: key }));
  } catch (e) {
    throw s3Error(e);
  } finally {
    s3.destroy();
  }
  return { ms: Date.now() - t0 };
}

/* ---------------- dump / load ---------------- */

type Dump = {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  settings: Partial<Record<SettingKey, unknown>>;
  data: { categories: unknown[]; sites: unknown[]; contents: unknown[]; monitors: unknown[]; checks: unknown[]; metrics: unknown[] };
  icons: Record<string, string>;
};

export async function buildDump(): Promise<Dump> {
  const s = await getSettings();
  const [categories, sites, contents, monitors, checks, metrics] = await Promise.all([
    prisma.category.findMany(),
    prisma.site.findMany(),
    prisma.content.findMany(),
    prisma.monitor.findMany(),
    prisma.check.findMany(),
    prisma.metric.findMany(),
  ]);
  const icons: Record<string, string> = {};
  const used = new Set([...sites, ...contents].map((x) => x.iconFile).filter(Boolean));
  for (const f of await readdir(iconsDir()).catch(() => [] as string[]))
    if (used.has(f)) icons[f] = (await readFile(path.join(iconsDir(), f))).toString("base64");
  return {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    settings: Object.fromEntries(PORTABLE.map((k) => [k, s[k]])),
    data: { categories, sites, contents, monitors, checks, metrics },
    icons,
  };
}

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

type Status = { at: string; ok: boolean; key?: string; size?: number; error?: string; trigger: string };
async function recordStatus(st: Status) {
  await setInternal("backup.last", JSON.stringify(st));
}
export async function lastStatus(): Promise<Status | null> {
  const v = await getInternal("backup.last");
  return v ? (JSON.parse(v) as Status) : null;
}

const g = globalThis as unknown as { __noctaBackupBusy?: boolean };

/** create a backup now and apply the retention count */
export async function runBackup(trigger: "manual" | "scheduled" | "pre-restore" = "manual") {
  if (g.__noctaBackupBusy) throw new Error("已有备份 / 恢复任务在进行");
  g.__noctaBackupBusy = true;
  const s = await getSettings();
  try {
    const dump = await buildDump();
    const body = gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 });
    const key = `${prefixOf(s)}nocta-backup-${stamp()}${trigger === "pre-restore" ? "-pre-restore" : ""}.json.gz`;
    const s3 = client(s);
    try {
      await s3.send(new PutObjectCommand({ Bucket: s.s3Bucket, Key: key, Body: body, ContentType: "application/gzip", Metadata: { "nocta-format": `${FORMAT}-v${VERSION}`, trigger } }));
      await prune(s3, s);
    } catch (e) {
      throw s3Error(e);
    } finally {
      s3.destroy();
    }
    const st = { at: new Date().toISOString(), ok: true, key, size: body.length, trigger };
    await recordStatus(st);
    console.log(`[nocta] backup ${trigger}: ${key} (${(body.length / 1024).toFixed(1)} KB)`);
    return st;
  } catch (e) {
    await recordStatus({ at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e), trigger });
    throw e;
  } finally {
    g.__noctaBackupBusy = false;
  }
}

async function listRaw(s3: S3Client, c: S3Conf) {
  const out: { key: string; size: number; at: string }[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: c.s3Bucket, Prefix: prefixOf(c), ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key && NAME_RE.test(o.Key)) out.push({ key: o.Key, size: o.Size ?? 0, at: (o.LastModified ?? new Date()).toISOString() });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token && out.length < 5000);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

/** keep the newest N regular backups (pre-restore safety copies count too) */
async function prune(s3: S3Client, c: S3Conf & { backupKeep: number }) {
  const all = await listRaw(s3, c);
  for (const o of all.slice(Math.max(1, c.backupKeep))) await s3.send(new DeleteObjectCommand({ Bucket: c.s3Bucket, Key: o.key }));
}

export async function listBackups() {
  const s = await getSettings();
  if (!s3Ready(s)) return [];
  const s3 = client(s);
  try {
    return await listRaw(s3, s);
  } catch (e) {
    throw s3Error(e);
  } finally {
    s3.destroy();
  }
}

const D = (v: unknown) => (v == null ? v : new Date(v as string));
const dates = <T extends Record<string, unknown>>(rows: unknown[], keys: string[]) =>
  (rows as T[]).map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const k of keys) if (k in o) o[k] = D(o[k]);
    return o;
  });

/** replace ALL data with a backup. A safety backup of the current state is uploaded first. */
export async function restoreBackup(key: string) {
  const s = await getSettings();
  if (!NAME_RE.test(key) || !key.startsWith(prefixOf(s))) throw new Error("无效的备份文件名");
  const s3 = client(s);
  let dump: Dump;
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: s.s3Bucket, Key: key }));
    const buf = Buffer.from(await r.Body!.transformToByteArray());
    dump = JSON.parse(gunzipSync(buf).toString("utf8")) as Dump;
  } catch (e) {
    throw e instanceof SyntaxError ? new Error("备份文件损坏") : s3Error(e);
  } finally {
    s3.destroy();
  }
  if (dump.format !== FORMAT || typeof dump.version !== "number" || dump.version > VERSION || !dump.data) throw new Error("不是夜航备份文件，或版本过新");

  await runBackup("pre-restore");

  const d = dump.data;
  const stats = { categories: d.categories.length, sites: d.sites.length, contents: d.contents.length, monitors: d.monitors.length, checks: d.checks.length, metrics: d.metrics.length };
  await prisma.$transaction(
    async (tx) => {
      await tx.check.deleteMany();
      await tx.metric.deleteMany();
      await tx.monitor.deleteMany();
      await tx.site.deleteMany();
      await tx.content.deleteMany();
      await tx.category.deleteMany();
      const chunk = async <T,>(rows: T[], fn: (part: T[]) => Promise<unknown>) => {
        for (let i = 0; i < rows.length; i += 500) await fn(rows.slice(i, i + 500));
      };
      await chunk(dates(d.categories, ["createdAt"]), (p) => tx.category.createMany({ data: p as never }));
      await chunk(dates(d.sites, ["createdAt", "updatedAt", "iconCheckedAt"]), (p) => tx.site.createMany({ data: p as never }));
      await chunk(dates(d.contents, ["createdAt", "updatedAt", "iconCheckedAt"]), (p) => tx.content.createMany({ data: p as never }));
      await chunk(dates(d.monitors, ["sslExpiresAt", "lastCheckedAt", "lastReportAt", "createdAt", "updatedAt"]), (p) => tx.monitor.createMany({ data: p as never }));
      await chunk(dates(d.checks, ["createdAt"]), (p) => tx.check.createMany({ data: p as never }));
      await chunk(dates(d.metrics, ["createdAt"]), (p) => tx.metric.createMany({ data: p as never }));
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  for (const [f, b64] of Object.entries(dump.icons ?? {})) if (/^[hu]_[\w.-]+$/.test(f)) await writeFile(path.join(iconsDir(), f), Buffer.from(b64, "base64"));
  const portable = Object.fromEntries(Object.entries(dump.settings ?? {}).filter(([k]) => (PORTABLE as string[]).includes(k) && k in DEFS));
  if (Object.keys(portable).length) await saveSettings(portable);
  console.log(`[nocta] restored ${key}`, stats);
  return stats;
}

/* ---------------- schedule ---------------- */

function zoned(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

/** called by the scheduler every few seconds; runs at most once per slot (daily / weekly on Monday at backupHour) */
export async function runScheduledBackup() {
  const s = await getSettings();
  if (s.backupSchedule === "off" || !s3Ready(s) || g.__noctaBackupBusy) return;
  const now = zoned(new Date(), s.timezone);
  if (now.hour < s.backupHour) return;
  if (s.backupSchedule === "weekly" && now.weekday !== "Mon") return;
  const slot = `${s.backupSchedule}:${now.day}`;
  const gg = globalThis as unknown as { __noctaBackupSlot?: string };
  if (gg.__noctaBackupSlot === slot) return;
  gg.__noctaBackupSlot = slot;
  if ((await getInternal("backup.slot")) === slot) return;
  await setInternal("backup.slot", slot);
  await runBackup("scheduled").catch(() => {}); // the status (and its error) is recorded for the settings page
}
