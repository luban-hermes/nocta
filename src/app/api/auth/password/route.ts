import { NextResponse } from "next/server";
import { checkPassword, cookieOptions, createSession, rateLimit, requireAdmin, setPassword, SESSION_COOKIE } from "@/lib/auth";
import { body, fail } from "@/lib/http";

/** change the admin password (needs the current one); the caller gets a fresh session, all others are signed out */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const rl = rateLimit(req);
  if (rl.blocked) return fail("尝试次数过多，请 10 分钟后再试", 429);
  const { current, next } = await body<{ current?: string; next?: string }>(req);
  if (!current || !(await checkPassword(current))) {
    rl.fail();
    return fail("当前密码不正确", 401);
  }
  try {
    await setPassword(next ?? "");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "修改失败");
  }
  rl.ok();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions(req));
  return res;
}
