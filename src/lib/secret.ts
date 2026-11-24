import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { dataDir } from "./paths";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const g = globalThis as unknown as { __noctaKey?: Buffer };

/** the encryption key: generated once into the data volume (<data>/secret.key, mode 600) */
export function masterKey(): Buffer {
  if (g.__noctaKey) return g.__noctaKey;
  const f = path.join(dataDir(), "secret.key");
  if (!existsSync(f)) {
    writeFileSync(f, randomBytes(32).toString("base64") + "\n", { mode: 0o600, flag: "wx" });
  }
  try {
    chmodSync(f, 0o600);
  } catch {
    /* read-only fs: fine */
  }
  const k = Buffer.from(readFileSync(f, "utf8").trim(), "base64");
  if (k.length !== 32) throw new Error(`${f} is not a valid 32-byte key`);
  g.__noctaKey = k;
  return k;
}

export function encrypt(plain: string) {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(v: string) {
  if (!v?.startsWith("enc:v1:")) return v ?? "";
  try {
    const [, , iv, tag, ct] = v.split(":");
    const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    console.error("[nocta] could not decrypt a stored secret (was secret.key replaced?) — re-enter it in 设置");
    return "";
  }
}

/** "abcd…wxyz" style mask for the UI — never the full value */
export const mask = (v: string) => (!v ? "" : v.length <= 8 ? "••••••" : `${v.slice(0, 3)}••••${v.slice(-4)}`);

const SC = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, SC);
  return `scrypt$${SC.N}$${salt.toString("base64")}$${h.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { ...SC, N: Number(n) || SC.N });
  return got.length === want.length && timingSafeEqual(got, want);
}
