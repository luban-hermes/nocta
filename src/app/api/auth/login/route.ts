import { NextResponse } from "next/server";
import { checkPassword, cookieOptions, createSession, needsSetup, rateLimit, SESSION_COOKIE } from "@/lib/auth";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  if (await needsSetup()) return fail("还没有设置管理员密码，请先完成初始化", 409);
  const rl = rateLimit(req);
  if (rl.blocked) return fail("尝试次数过多，请 10 分钟后再试", 429);
  const { password } = await body<{ password?: string }>(req);
  if (!password || !(await checkPassword(password))) {
    rl.fail();
    return fail("密码不正确", 401);
  }
  rl.ok();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions(req));
  return res;
}
