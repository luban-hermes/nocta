import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { chatJSON } from "@/lib/ai";
import { addByUrl } from "@/lib/bookmarks";
import { contentDTO, monitorDTO, siteDTO } from "@/lib/data";
import { env } from "@/lib/env";
import { body, fail, json } from "@/lib/http";
import { createHttpMonitor, createServerMonitor, parseSsh } from "@/lib/monitor";
import { normalizeUrl } from "@/lib/utils";

type Action = "add_site" | "add_content" | "add_bookmark" | "monitor_http" | "monitor_server" | "search" | "chat";
interface Plan {
  action: Action;
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  name?: string;
  interval?: number;
  query?: string;
  reply?: string;
}

const URL_RE = /(https?:\/\/[^\s"'<>，。]+)|((?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>，。]*)?)/i;
const MONITOR_WORDS = /(监控|监测|盯着|探活|心跳|可用性|健康检查|monitor|uptime|ping)/i;
const MONITOR_PATH = /(\/api(\/|$)|\/health|\/healthz|\/status|\/ping|\/ready|\/live|\/v\d+\/)/i;

/** regex fallback when no AI is configured (or the AI answer is unusable) */
function rulePlan(text: string): Plan {
  const t = text.trim();
  if (/^ssh\s/i.test(t) || /^[\w.-]+@[\w.-]+(:\d+)?$/.test(t) || /(服务器|server).*@/i.test(t)) {
    const p = parseSsh(t);
    if (p) return { action: "monitor_server", host: p.host, port: p.port, user: p.user };
  }
  const ipOnly = t.match(/(?:服务器|server|主机)\D*(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/i);
  if (ipOnly) return { action: "monitor_server", host: ipOnly[1], port: Number(ipOnly[2] ?? 22), user: "root" };
  const m = t.match(URL_RE);
  if (m) {
    const url = m[0].replace(/[),.;!?]+$/, "");
    const u = normalizeUrl(url);
    if (u) {
      const sec = t.match(/(\d+)\s*(秒|s\b|sec)/i);
      const min = t.match(/(\d+)\s*(分钟|min)/i);
      const interval = sec ? Number(sec[1]) : min ? Number(min[1]) * 60 : undefined;
      if (MONITOR_WORDS.test(t) || MONITOR_PATH.test(u.pathname) || /^(api|status|health)\./i.test(u.hostname)) return { action: "monitor_http", url: u.toString(), interval };
      if (/(作为|当作|加到|放到).*(站点|导航)/.test(t)) return { action: "add_site", url: u.toString() };
      if (/(稍后读|收藏这篇|文章|内容)/.test(t)) return { action: "add_content", url: u.toString() };
      return { action: "add_bookmark", url: u.toString() };
    }
  }
  const q = t.replace(/^(搜索|查找|找一下|找|search|find)\s*/i, "").trim();
  return { action: "search", query: q };
}

async function aiPlan(text: string): Promise<Plan | null> {
  const out = await chatJSON<Plan>(
    `你是「夜航书签」的 AI 助手，负责把用户的一句话转换成一个操作。可选 action：\n` +
      `- add_site：把一个网站加入站点导航（通常是首页/裸域名）\n` +
      `- add_content：收藏一篇文章/视频/仓库/帖子（带路径的具体页面）\n` +
      `- add_bookmark：不确定是站点还是内容时使用\n` +
      `- monitor_http：监控一个网址或 API 的可用性（health、status、api 地址或用户说“监控”）\n` +
      `- monitor_server：监控一台服务器（SSH 字符串，如 ssh root@1.2.3.4 -p 2222），提取 host/port/user，绝不要输出密码\n` +
      `- search：在已有书签和监控里搜索，提取 query\n` +
      `- chat：其他闲聊或问题，用 reply 简短回答（中文，≤80 字），并说明你能做什么\n` +
      `输出 JSON：{"action":string,"url"?:string,"host"?:string,"port"?:number,"user"?:string,"name"?:string,"interval"?:number,"query"?:string,"reply"?:string}`,
    text,
    300,
  );
  if (!out || typeof out.action !== "string") return null;
  return out;
}

async function search(q: string) {
  if (!q) return { sites: [], contents: [], monitors: [] };
  const [sites, contents, monitors] = await Promise.all([
    prisma.site.findMany({ where: { OR: [{ name: { contains: q } }, { url: { contains: q } }, { description: { contains: q } }] }, take: 5 }),
    prisma.content.findMany({ where: { OR: [{ title: { contains: q } }, { summary: { contains: q } }, { tags: { contains: q } }, { domain: { contains: q } }] }, take: 5 }),
    prisma.monitor.findMany({ where: { OR: [{ name: { contains: q } }, { url: { contains: q } }, { host: { contains: q } }] }, take: 5 }),
  ]);
  return { sites: sites.map(siteDTO), contents: contents.map(contentDTO), monitors: monitors.map((m) => monitorDTO(m)) };
}

const HELP = "我可以帮你：\n· 粘贴网址 → 自动收藏为站点或内容\n· 粘贴 SSH 命令（如 ssh root@203.0.113.50 -p 2222）→ 添加服务器监控\n· 粘贴 API / health 地址 → 添加 HTTP 监控\n· 输入关键词 → 搜索已有书签";

export async function POST(req: Request) {
  const { message } = await body<{ message?: string }>(req);
  const text = (message ?? "").trim().slice(0, 2000);
  if (!text) return fail("说点什么吧");
  const admin = await isAdmin();

  let plan = env.aiEnabled ? await aiPlan(text) : null;
  const rules = rulePlan(text);
  // trust the rules for unambiguous inputs (SSH strings / bare URLs); otherwise prefer the AI
  if (!plan || ((rules.action === "monitor_server" || rules.action === "monitor_http") && plan.action !== rules.action && !plan.host && !plan.url)) plan = rules;
  if (plan.action === "monitor_server" && !plan.host) plan = rules.action === "monitor_server" ? rules : { ...plan, ...(parseSsh(text) ?? {}) };
  if (["add_site", "add_content", "add_bookmark", "monitor_http"].includes(plan.action) && !plan.url) plan.url = rules.url;

  const needsAdmin = !["search", "chat"].includes(plan.action);
  if (needsAdmin && !admin) return json({ action: plan.action, reply: "添加和监控需要管理员权限，请先登录夜航后台。" });

  try {
    switch (plan.action) {
      case "add_site":
      case "add_content":
      case "add_bookmark": {
        if (!plan.url) break;
        const force = plan.action === "add_site" ? "site" : plan.action === "add_content" ? "content" : undefined;
        const r = await addByUrl(plan.url, force);
        if (r.kind === "site") {
          return json({ action: "add_site", reply: `已添加到「站点导航」：${r.site.name}${r.fetched ? "" : "（页面抓取失败，已用域名代替，可稍后编辑）"}`, created: { kind: "site", item: siteDTO(r.site) } });
        }
        const c = contentDTO(r.content);
        return json({ action: "add_content", reply: `已收藏到「收藏内容」：${c.title}${c.tags.length ? `\n标签：${c.tags.join(" · ")}` : ""}${c.summary ? `\n${r.usedAi ? "AI 摘要" : "摘要"}：${c.summary}` : ""}`, created: { kind: "content", item: c } });
      }
      case "monitor_http": {
        if (!plan.url) break;
        const u = normalizeUrl(plan.url);
        if (!u) break;
        const m = await createHttpMonitor({ url: u.toString(), name: plan.name, interval: plan.interval });
        return json({ action: "monitor_http", reply: `已添加 HTTP 监控：${m.name}\n每 ${m.interval} 秒检查一次状态码、响应时间${u.protocol === "https:" ? "和 SSL 证书" : ""}。`, created: { kind: "monitor", item: monitorDTO(m, {}, true) } });
      }
      case "monitor_server": {
        if (!plan.host) break;
        const m = await createServerMonitor({ host: plan.host, port: plan.port, user: plan.user, name: plan.name, interval: plan.interval });
        return json({
          action: "monitor_server",
          reply: `已添加服务器：${m.name}（${m.sshUser}@${m.host}:${m.port}）\n夜航不会保存任何密码。登录服务器后运行下面这一行安装探针，数据就会开始上报：`,
          created: { kind: "monitor", item: monitorDTO(m, {}, true) },
          install: true,
        });
      }
      case "search": {
        const q = plan.query || text;
        const r = await search(q);
        const n = r.sites.length + r.contents.length + r.monitors.length;
        return json({ action: "search", reply: n ? `找到 ${n} 条与「${q}」相关的记录：` : `没有找到与「${q}」相关的记录。\n\n${HELP}`, results: r });
      }
      case "chat":
        return json({ action: "chat", reply: plan.reply ? `${plan.reply}` : HELP });
    }
  } catch (e) {
    return json({ action: plan.action, reply: `没能完成：${e instanceof Error ? e.message : String(e)}` });
  }
  return json({ action: "chat", reply: HELP });
}
