import { requireAdmin } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { body, fail, json } from "@/lib/http";

/** replace all data with the given backup (a safety backup of the current state is made first) */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { key } = await body<{ key?: string }>(req);
  if (!key) return fail("缺少备份文件");
  try {
    return json({ ok: true, stats: await restoreBackup(key) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "恢复失败", 502);
  }
}
