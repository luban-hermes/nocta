import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";
import { fail } from "./http";

export const SESSION_COOKIE = "nocta_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const raw = env.sessionSecret || `nocta:${env.adminPassword}`;
  return new Uint8Array(createHash("sha256").update(raw).digest());
}

export function checkPassword(input: string) {
  const expected = env.adminPassword;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function createSession() {
  // the password fingerprint is embedded so changing ADMIN_PASSWORD invalidates old sessions
  const pv = createHash("sha256").update(env.adminPassword).digest("hex").slice(0, 12);
  return new SignJWT({ role: "admin", pv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined) {
  if (!token || !env.adminPassword) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const pv = createHash("sha256").update(env.adminPassword).digest("hex").slice(0, 12);
    return payload.role === "admin" && payload.pv === pv;
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
  return env.publicMode || (await isAdmin());
}

export function cookieOptions(req: Request) {
  // proxies may chain values ("https, http"): the first one is what the browser used
  const fwd = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const proto = fwd || new URL(req.url).protocol.replace(":", "");
  const secure = process.env.COOKIE_SECURE ? /^(1|true)$/i.test(process.env.COOKIE_SECURE) : proto === "https";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: MAX_AGE };
}
