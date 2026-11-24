import { requireAdmin } from "@/lib/auth";
import { lastStatus, listBackups, runBackup } from "@/lib/backup";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** backup list (from the bucket) + the last run's status */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const last = await lastStatus();
  try {
    return json({ items: await listBackups(), last }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return json({ items: [], last, error: e instanceof Error ? e.message : "无法读取备份列表" });
  }
}

/** back up now */
export async function POST() {
  const deny = await requireAdmin();
  if (deny) return deny;
  try {
    return json(await runBackup("manual"));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "备份失败", 502);
  }
}
