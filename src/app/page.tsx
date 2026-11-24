import { redirect } from "next/navigation";
import { canView } from "@/lib/auth";
import { loadAppData } from "@/lib/data";
import { NoctaApp } from "@/components/NoctaApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await canView())) redirect("/login");
  const data = await loadAppData();
  return <NoctaApp initial={data} />;
}
