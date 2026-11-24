import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin, needsSetup } from "@/lib/auth";
import { loadAppData } from "@/lib/data";
import { AdminApp } from "@/components/AdminApp";

export const metadata: Metadata = { title: "夜航后台" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (await needsSetup()) redirect("/setup");
  if (!(await isAdmin())) redirect("/login?next=/admin");
  return <AdminApp initial={await loadAppData()} />;
}
