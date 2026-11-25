import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin, needsSetup } from "@/lib/auth";
import { loadAdminData } from "@/lib/data";
import { AdminApp } from "@/components/AdminApp";

export const metadata: Metadata = { title: "夜航后台" };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (await needsSetup()) redirect("/setup");
  if (!(await isAdmin())) redirect(`/login?next=${encodeURIComponent("/admin" + (q.tab ? `?tab=${one(q.tab)}` : q.sec ? `?sec=${one(q.sec)}` : ""))}`);
  return <AdminApp initial={await loadAdminData()} view={{ sec: one(q.sec), tab: one(q.tab) }} />;
}
