import { NextResponse } from "next/server";
import { checkPassword, cookieOptions, createSession, SESSION_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";
import { body, fail } from "@/lib/http";

// naive in-memory brute-force guard: 10 attempts / 10 min per IP
const attempts = new Map<string, { n: number; t: number }>();

export async function POST(req: Request) {
  if (!env.adminPassword) return fail("服务器未设置 ADMIN_PASSWORD，无法登录", 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && now - a.t < 600_000 && a.n >= 10) return fail("尝试次数过多，请 10 分钟后再试", 429);
  const { password } = await body<{ password?: string }>(req);
  if (!password || !checkPassword(password)) {
    attempts.set(ip, { n: a && now - a.t < 600_000 ? a.n + 1 : 1, t: a && now - a.t < 600_000 ? a.t : now });
    return fail("密码不正确", 401);
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions(req));
  return res;
}
