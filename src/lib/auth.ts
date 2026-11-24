import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { legacyAdminPassword } from "./env";
import { fail } from "./http";
import { hashPassword, verifyPassword } from "./secret";
import { getInternal, getSettings, sessionSecret, setInternal } from "./settings";

export const SESSION_COOKIE = "nocta_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/*
 * The admin password is set in the first-run setup wizard and stored as an scrypt hash
 * (Setting "auth.passwordHash"). A legacy ADMIN_PASSWORD env var keeps working until a password is
 * saved in the UI.
 */
async function passwordState() {
  const hash = await getInternal("auth.passwordHash");
  if (hash) return { kind: "hash" as const, hash, fp: hash };
  const legacy = legacyAdminPassword();
  if (legacy) return { kind: "env" as const, legacy, fp: "env:" + legacy };
  return { kind: "none" as const, fp: "" };
}

/** true until an admin password exists (fresh install without ADMIN_PASSWORD) → /setup */
export async function needsSetup() {
  return (await passwordState()).kind === "none";
}
export async function passwordSource() {
  return (await passwordState()).kind;
}

async function secretKey() {
  return new Uint8Array(createHash("sha256").update(await sessionSecret()).digest());
}
const fingerprint = (fp: string) => createHash("sha256").update(fp).digest("hex").slice(0, 12);

export async function checkPassword(input: string) {
  const st = await passwordState();
  if (st.kind === "hash") return verifyPassword(input, st.hash);
  if (st.kind === "env") {
    const a = createHash("sha256").update(input).digest();
    const b = createHash("sha256").update(st.legacy).digest();
    return timingSafeEqual(a, b);
  }
  return false;
}

/** store a new password (also used by the setup wizard); every existing session becomes invalid */
export async function setPassword(pw: string) {
  if (pw.length < 8) throw new Error("密码至少 8 位");
  if (pw.length > 200) throw new Error("密码太长");
  await setInternal("auth.passwordHash", await hashPassword(pw));
}

export async function createSession() {
  // the password fingerprint is embedded so changing the password invalidates old sessions
  const pv = fingerprint((await passwordState()).fp);
  return new SignJWT({ role: "admin", pv }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(await secretKey());
}

export async function verifySession(token: string | undefined) {
  if (!token) return false;
  const st = await passwordState();
  if (st.kind === "none") return false;
  try {
    const { payload } = await jwtVerify(token, await secretKey(), { algorithms: ["HS256"] });
    return payload.role === "admin" && payload.pv === fingerprint(st.fp);
  } catch {
    return false;
  }
}

export async function isAdmin() {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** returns a 401 response when not admin, otherwise null */
export async function requireAdmin() {
  return (await isAdmin()) ? null : fail("需要管理员登录", 401);
}

/** may the current visitor read data at all? */
export async function canView() {
  return (await getSettings()).publicMode || (await isAdmin());
}

export function cookieOptions(req: Request) {
  // proxies may chain values ("https, http"): the first one is what the browser used
  const fwd = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const proto = fwd || new URL(req.url).protocol.replace(":", "");
  const secure = process.env.COOKIE_SECURE ? /^(1|true)$/i.test(process.env.COOKIE_SECURE) : proto === "https";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: MAX_AGE };
}

/** shared brute-force guard for login / password change / setup */
const attempts = new Map<string, { n: number; t: number }>();
const WINDOW = 600_000;
let all = { n: 0, t: 0 };
export function rateLimit(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (now - all.t >= WINDOW) all = { n: 0, t: now };
  const blocked = (a && now - a.t < WINDOW && a.n >= 10) || all.n >= 100;
  return {
    blocked,
    fail() {
      attempts.set(ip, { n: a && now - a.t < WINDOW ? a.n + 1 : 1, t: a && now - a.t < WINDOW ? a.t : now });
      all.n++;
      if (attempts.size > 5000) attempts.clear();
    },
    ok() {
      attempts.delete(ip);
    },
  };
}
