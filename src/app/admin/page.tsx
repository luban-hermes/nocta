import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { loadAppData } from "@/lib/data";
import { env } from "@/lib/env";
import { AdminApp } from "@/components/AdminApp";

export const metadata: Metadata = { title: "夜航后台" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/login?next=/admin");
  const data = await loadAppData();
  return (
    <AdminApp
      initial={data}
      config={{
        publicMode: env.publicMode,
        publicMonitors: env.publicMonitors,
        aiEnabled: env.aiEnabled,
        aiModel: env.aiModel,
        aiBaseUrl: env.aiBaseUrl.replace(/\/\/([^/@]+)@/, "//***@"),
        allowPrivateMonitors: env.allowPrivateMonitors,
        retentionDays: env.retentionDays,
        scheduler: env.schedulerEnabled,
      }}
    />
  );
}
