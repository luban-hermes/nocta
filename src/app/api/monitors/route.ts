import { requireAdmin } from "@/lib/auth";
import { monitorDTO } from "@/lib/data";
import { body, fail, json } from "@/lib/http";
import { createHttpMonitor, createServerMonitor, parseSsh } from "@/lib/monitor";
import { normalizeUrl } from "@/lib/utils";

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = await body<{ kind?: string; url?: string; name?: string; interval?: number; method?: string; expectStatus?: number; timeoutMs?: number; ssh?: string; host?: string; port?: number; user?: string }>(req);
  try {
    if (b.kind === "server") {
      const parsed = b.ssh ? parseSsh(b.ssh) : b.host ? { host: b.host, port: b.port ?? 22, user: b.user ?? "root" } : null;
      if (!parsed) return fail("无法识别 SSH 地址，例如：ssh root@203.0.113.50 -p 2222");
      const m = await createServerMonitor({ ...parsed, name: b.name, interval: b.interval });
      return json(monitorDTO(m, {}, true), 201);
    }
    const u = normalizeUrl(b.url ?? "");
    if (!u) return fail("请输入有效的 http(s) 地址");
    const m = await createHttpMonitor({ url: u.toString(), name: b.name, interval: b.interval, method: b.method, expectStatus: b.expectStatus, timeoutMs: b.timeoutMs });
    return json(monitorDTO(m, {}, true), 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "创建失败");
  }
}
