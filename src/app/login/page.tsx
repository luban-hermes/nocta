import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await isAdmin()) redirect(next?.startsWith("/") ? next : "/");
  return <LoginForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} configured={!!env.adminPassword} publicMode={env.publicMode} />;
}
