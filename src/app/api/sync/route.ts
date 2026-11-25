import { canView, isAdmin } from "@/lib/auth";
import { loadMonitors, loadVersions } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { fail, jsonz } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * the small poll (v0.4.0): change markers of the bookmark lists, plus the monitor cards with ?m=1.
 * The client re-downloads a list only when its marker moved.
 */
export async function GET(req: Request) {
  if (!(await canView())) return fail("需要登录", 401);
  const wantMon = new URL(req.url).searchParams.get("m") === "1";
  const admin = await isAdmin();
  const showMonitors = admin || (await getSettings()).publicMonitors;
  const [version, monitors] = await Promise.all([loadVersions(), wantMon && showMonitors ? loadMonitors(admin) : Promise.resolve(undefined)]);
  return jsonz(req, { version, ...(monitors ? { monitors } : {}) });
}
