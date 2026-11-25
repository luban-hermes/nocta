import { requireAdmin } from "@/lib/auth";
import { chat } from "@/lib/ai";
import { body, fail, json } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** one tiny completion with the values currently in the form (an empty key = the saved one) */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ aiBaseUrl?: string; aiApiKey?: string; aiModel?: string }>(req);
  const saved = await getSettings();
  const config = {
    aiBaseUrl: String(b.aiBaseUrl ?? saved.aiBaseUrl).trim().replace(/\/+$/, ""),
    aiApiKey: b.aiApiKey ? String(b.aiApiKey) : saved.aiApiKey,
    aiModel: String(b.aiModel ?? saved.aiModel).trim(),
  };
  if (config.aiBaseUrl && !/^https?:\/\/\S+$/i.test(config.aiBaseUrl)) return fail("AI Base URL 需以 http(s):// 开头");
  const t0 = Date.now();
  try {
    const out = await chat([{ role: "user", content: "只回复两个字：你好" }], { maxTokens: 10, timeoutMs: 20000, config });
    return json({ ok: true, ms: Date.now() - t0, reply: out.slice(0, 40) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "连接失败", 502);
  }
}
