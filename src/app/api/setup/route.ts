import { NextResponse } from "next/server";
import { cookieOptions, createSession, needsSetup, SESSION_COOKIE, setPassword } from "@/lib/auth";
import { body, fail } from "@/lib/http";
import { saveSettings } from "@/lib/settings";

/** first-run wizard: only works while no admin password exists */
export async function POST(req: Request) {
  if (!(await needsSetup())) return fail("已经初始化过了", 409);
  const b = await body<{ password?: string; publicMode?: boolean }>(req);
  try {
    await setPassword(b.password ?? "");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "设置失败");
  }
  if (typeof b.publicMode === "boolean") await saveSettings({ publicMode: b.publicMode });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions(req));
  return res;
}
