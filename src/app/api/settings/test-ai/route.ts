import { requireAdmin } from "@/lib/auth";
import { chat } from "@/lib/ai";
import { fail, json } from "@/lib/http";

/** one tiny completion with the saved AI settings */
export async function POST() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const t0 = Date.now();
  try {
    const out = await chat([{ role: "user", content: "只回复两个字：你好" }], { maxTokens: 10, timeoutMs: 20000 });
    return json({ ok: true, ms: Date.now() - t0, reply: out.slice(0, 40) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "连接失败", 502);
  }
}
