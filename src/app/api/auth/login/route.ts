import { NextResponse } from "next/server";
import { checkPassword, cookieOptions, createSession, SESSION_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";
import { body, fail } from "@/lib/http";

// naive in-memory brute-force guard: 10 attempts / 10 min per client, plus a global cap so a
// client that rotates a spoofed X-Forwarded-For header still cannot guess without limit
const attempts = new Map<string, { n: number; t: number }>();
const WINDOW = 600_000;
const GLOBAL_MAX = 100;
let all = { n: 0, t: 0 };

export async function POST(req: Request) {
  if (!env.adminPassword)
    return fail(env.adminPasswordIsPlaceholder ? "ADMIN_PASSWORD 仍是示例值 change-me，请在 .env 中改成你自己的密码后重启容器" : "服务器未设置 ADMIN_PASSWORD，无法登录", 503);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (now - all.t >= WINDOW) all = { n: 0, t: now };
  if ((a && now - a.t < WINDOW && a.n >= 10) || all.n >= GLOBAL_MAX) return fail("尝试次数过多，请 10 分钟后再试", 429);
  const { password } = await body<{ password?: string }>(req);
  if (!password || !checkPassword(password)) {
    attempts.set(ip, { n: a && now - a.t < WINDOW ? a.n + 1 : 1, t: a && now - a.t < WINDOW ? a.t : now });
    all.n++;
    if (attempts.size > 5000) attempts.clear();
    return fail("密码不正确", 401);
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions(req));
  return res;
}
