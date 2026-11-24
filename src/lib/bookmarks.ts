import "server-only";
import type { Category } from "@prisma/client";
import { prisma } from "./db";
import { chatJSON } from "./ai";
import { fetchMeta, type PageMeta } from "./metadata";
import { clip, domainOf, isBareDomain, joinTags, normalizeUrl } from "./utils";

export const DEFAULT_CATEGORIES = {
  site: [
    { name: "常用", icon: "★" },
    { name: "开发", icon: "⌘" },
    { name: "设计", icon: "◐" },
    { name: "AI 工具", icon: "✦" },
    { name: "影音", icon: "▶" },
  ],
  content: [
    { name: "文章", icon: "¶" },
    { name: "视频", icon: "▶" },
    { name: "仓库", icon: "⌥" },
    { name: "帖子", icon: "❝" },
    { name: "稍后读", icon: "◷" },
  ],
} as const;

/** create the default categories the first time the app starts (idempotent) */
export async function ensureDefaultCategories() {
  for (const kind of ["site", "content"] as const) {
    const n = await prisma.category.count({ where: { kind } });
    if (n > 0) continue;
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES[kind].map((c, i) => ({ kind, name: c.name, icon: c.icon, sort: i })),
    });
  }
}

/* ---------------- rule-based classification (used when no AI key, or AI fails) ---------------- */

const SITE_RULES: [RegExp, string][] = [
  [/(openai|chatgpt|claude|anthropic|deepseek|kimi|moonshot|tongyi|qwen|gemini|perplexity|huggingface|midjourney|poe\.com|doubao|zhipu|chatglm|ollama|cursor\.)/i, "AI 工具"],
  [/(figma|dribbble|behance|sketch|framer|canva|pinterest|unsplash|iconfont|fonts\.google|coolors|spline|mobbin|pixso|zcool|huaban)/i, "设计"],
  [/(github|gitlab|gitee|stackoverflow|npmjs|vercel|netlify|cloudflare|docker|mdn|developer\.|devdocs|leetcode|juejin|segmentfault|csdn|v2ex|nextjs|react\.dev|vuejs|tailwind|supabase|railway|codepen|jsfiddle|regex101|crates\.io|pypi)/i, "开发"],
  [/(youtube|youtu\.be|bilibili|netflix|spotify|music\.|douyin|tiktok|twitch|vimeo|iqiyi|youku|v\.qq|disneyplus|primevideo|soundcloud|ximalaya)/i, "影音"],
];

export type ContentType = "article" | "video" | "repo" | "post";
const TYPE_CATEGORY: Record<ContentType, string> = { article: "文章", video: "视频", repo: "仓库", post: "帖子" };

export function guessContentType(u: URL, meta?: Partial<PageMeta>): ContentType {
  const h = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (/youtube\.com|youtu\.be|bilibili\.com|vimeo\.com|v\.qq\.com|douyin\.com|tiktok\.com|ixigua\.com/.test(h) || /video/.test(meta?.type ?? "")) return "video";
  if (/^(github\.com|gitlab\.com|gitee\.com|codeberg\.org)$/.test(h) && parts.length >= 2) return "repo";
  if (/^(x\.com|twitter\.com|weibo\.com|v2ex\.com|reddit\.com|news\.ycombinator\.com|mastodon|threads\.net|bsky\.app)/.test(h) || (h === "zhihu.com" && parts[0] === "question")) return "post";
  return "article";
}

export function guessSiteCategory(u: URL) {
  const h = u.hostname;
  for (const [re, name] of SITE_RULES) if (re.test(h)) return name;
  return "常用";
}

const STOP = new Set(["the", "and", "for", "with", "how", "you", "your", "are", "this", "that", "from", "what", "why", "into", "use", "using", "www", "com", "html"]);
function ruleTags(meta: Partial<PageMeta>, u: URL, type: ContentType): string[] {
  const tags = new Set<string>();
  const words = `${meta.title ?? ""} ${meta.description ?? ""}`.match(/[A-Za-z][A-Za-z0-9+.#-]{2,20}/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) {
    const k = w.replace(/[.]+$/, "");
    if (STOP.has(k.toLowerCase())) continue;
    freq.set(k, (freq.get(k) ?? 0) + (/^[A-Z]/.test(k) ? 2 : 1));
  }
  [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([w]) => tags.add(w));
  if (type === "repo") tags.add("开源");
  if (type === "video") tags.add("视频");
  const site = u.hostname.replace(/^www\./, "").split(".")[0];
  if (tags.size < 2 && site && !/^\d+$/.test(site)) tags.add(site);
  return [...tags].slice(0, 4);
}

function ruleSummary(meta: Partial<PageMeta>) {
  return clip(meta.description || "", 140);
}

/* ---------------- AI classification ---------------- */

interface AiSite { name?: string; category?: string; description?: string }
interface AiContent { title?: string; category?: string; tags?: string[]; summary?: string; type?: ContentType }

async function aiForSite(u: URL, meta: PageMeta, cats: Category[]): Promise<AiSite | null> {
  return chatJSON<AiSite>(
    `你是书签导航站的整理助手。根据网站信息，给出简短中文站点名（≤12字，优先使用品牌名）、一句话中文描述（≤40字），并从给定分类中选一个最合适的。` +
      `输出 JSON：{"name":string,"description":string,"category":string}`,
    `分类：${cats.map((c) => c.name).join("、")}\nURL：${u}\n标题：${meta.title}\n描述：${meta.description}\n站点名：${meta.siteName}`,
    300,
  );
}

async function aiForContent(u: URL, meta: PageMeta, cats: Category[]): Promise<AiContent | null> {
  return chatJSON<AiContent>(
    `你是收藏夹整理助手。阅读网页信息，输出：title（保留原标题，过长可精简），type（article/video/repo/post 之一），` +
      `category（从给定分类中选一个），tags（2-4 个中文或技术名词短标签），summary（中文摘要，2 句话，≤90 字，说清讲了什么、对读者有什么用）。` +
      `输出 JSON：{"title":string,"type":string,"category":string,"tags":string[],"summary":string}`,
    `分类：${cats.map((c) => c.name).join("、")}\nURL：${u}\n标题：${meta.title}\n描述：${meta.description}\n正文片段：${meta.text.slice(0, 1500)}`,
    500,
  );
}

const pickCat = (cats: Category[], name: string | undefined, fallback: string) =>
  cats.find((c) => c.name === name) ?? cats.find((c) => c.name === fallback) ?? cats[0] ?? null;

/* ---------------- public API ---------------- */

export async function createSiteFromUrl(u: URL, opts: { name?: string; categoryId?: string } = {}) {
  const meta = await fetchMeta(u.toString());
  const cats = await prisma.category.findMany({ where: { kind: "site" }, orderBy: { sort: "asc" } });
  const ai = await aiForSite(u, meta, cats);
  const cat = opts.categoryId ? cats.find((c) => c.id === opts.categoryId) ?? null : pickCat(cats, ai?.category, guessSiteCategory(u));
  const brand = meta.siteName || meta.title.split(/\s[-|–—·]\s|[|｜]/)[0];
  const site = await prisma.site.create({
    data: {
      name: clip(opts.name || ai?.name || brand || domainOf(u.toString()), 40),
      url: u.toString(),
      description: clip(ai?.description || meta.description || "", 200),
      favicon: meta.favicon,
      categoryId: cat?.id ?? null,
    },
  });
  return { site, usedAi: !!ai, fetched: meta.ok };
}

export async function createContentFromUrl(u: URL, opts: { categoryId?: string } = {}) {
  const meta = await fetchMeta(u.toString());
  const cats = await prisma.category.findMany({ where: { kind: "content" }, orderBy: { sort: "asc" } });
  const ai = await aiForContent(u, meta, cats);
  const ruleType = guessContentType(u, meta);
  // URL patterns (YouTube, GitHub repo …) are more reliable than the model for the type
  const type: ContentType = ruleType !== "article" ? ruleType : ai?.type && ai.type in TYPE_CATEGORY ? ai.type : ruleType;
  const cat = opts.categoryId ? cats.find((c) => c.id === opts.categoryId) ?? null : pickCat(cats, ai?.category, TYPE_CATEGORY[type]);
  const content = await prisma.content.create({
    data: {
      url: u.toString(),
      title: clip(ai?.title || meta.title || u.toString(), 200),
      summary: clip(ai?.summary || ruleSummary(meta), 300),
      aiSummary: !!ai?.summary,
      cover: meta.image,
      favicon: meta.favicon,
      domain: domainOf(u.toString()),
      type,
      tags: joinTags(ai?.tags?.length ? ai.tags : ruleTags(meta, u, type)),
      categoryId: cat?.id ?? null,
    },
  });
  return { content, usedAi: !!ai, fetched: meta.ok };
}

/** bare domain → 站点; URL with a path → 内容 */
export async function addByUrl(raw: string, force?: "site" | "content") {
  const u = normalizeUrl(raw);
  if (!u) throw new Error("这不是一个有效的网址");
  const kind = force ?? (isBareDomain(u) ? "site" : "content");
  if (kind === "site") {
    const r = await createSiteFromUrl(u);
    return { kind: "site" as const, ...r };
  }
  const r = await createContentFromUrl(u);
  return { kind: "content" as const, ...r };
}
