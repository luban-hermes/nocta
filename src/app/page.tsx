import { redirect } from "next/navigation";
import { canView, needsSetup } from "@/lib/auth";
import { loadHomeData } from "@/lib/data";
import { NoctaApp } from "@/components/NoctaApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await needsSetup()) redirect("/setup");
  if (!(await canView())) redirect("/login");
  const data = await loadHomeData();
  return <NoctaApp initial={data} />;
}
