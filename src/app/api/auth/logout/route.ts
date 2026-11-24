import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
  return res;
}
