import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { SetupForm } from "@/components/SetupForm";

export const metadata: Metadata = { title: "初始化" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return <SetupForm />;
}
