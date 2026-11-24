import { requireAdmin, passwordSource } from "@/lib/auth";
import { body, fail, json } from "@/lib/http";
import { DEFS, publicSettings, saveSettings, type SettingKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  return json({ ...(await publicSettings()), password: await passwordSource() }, { headers: { "cache-control": "no-store" } });
}

/** partial update; secret fields: omit = keep, "" = clear */
export async function PATCH(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<Record<string, unknown>>(req);
  const patch: Partial<Record<SettingKey, unknown>> = {};
  for (const k of Object.keys(DEFS) as SettingKey[]) if (k in b) patch[k] = b[k];
  try {
    await saveSettings(patch);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "保存失败");
  }
  return json({ ...(await publicSettings()), password: await passwordSource() });
}
