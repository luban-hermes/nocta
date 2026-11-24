import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin, needsSetup } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await needsSetup()) redirect("/setup");
  if (await isAdmin()) redirect(next?.startsWith("/") ? next : "/");
  return <LoginForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"} publicMode={(await getSettings()).publicMode} />;
}
