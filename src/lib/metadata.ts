import "server-only";
import { safeFetch } from "./ssrf";
import { clip, domainOf } from "./utils";

export interface PageMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  favicon: string;
  siteName: string;
  type: string; // og:type
  text: string; // a little body text for the AI
  ok: boolean;
  error?: string;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

export function parseHtml(html: string, baseUrl: string): Omit<PageMeta, "ok" | "url"> {
  const head = html.slice(0, 300_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content.trim();
  }
  const icons: { href: string; score: number }[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (!a.href || !/icon/.test(rel)) continue;
    const size = Number((a.sizes || "").split("x")[0]) || 16;
    const score = (rel.includes("apple-touch") ? 180 : size) + (a.type?.includes("svg") ? 200 : 0);
    icons.push({ href: a.href, score });
  }
  const abs = (u: string) => {
    if (!u) return "";
    try {
      const r = new URL(u, baseUrl);
      return r.protocol === "http:" || r.protocol === "https:" ? r.toString() : "";
    } catch {
      return "";
    }
  };
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  icons.sort((a, b) => b.score - a.score);
  const origin = new URL(baseUrl).origin;
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(script|style)[\s\S]*$/i, " ")
    .replace(/<[^>]+>/g, " ");
  return {
    title: clip(decodeEntities(meta["og:title"] || meta["twitter:title"] || titleTag || ""), 200),
    description: clip(decodeEntities(meta["og:description"] || meta["description"] || meta["twitter:description"] || ""), 500),
    image: abs(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || ""),
    favicon: abs(icons[0]?.href || "") || `${origin}/favicon.ico`,
    siteName: clip(decodeEntities(meta["og:site_name"] || meta["application-name"] || ""), 80),
    type: (meta["og:type"] || "").toLowerCase(),
    text: clip(decodeEntities(body), 2000),
  };
}

const OEMBED: [RegExp, (u: string) => string][] = [
  [/(^|\.)youtube\.com$|^youtu\.be$/, (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`],
  [/(^|\.)vimeo\.com$/, (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`],
];

/** video sites often hide metadata from bots; their oEmbed endpoints don't */
async function oembed(url: string): Promise<Partial<PageMeta> | null> {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  const hit = OEMBED.find(([re]) => re.test(host));
  if (!hit) return null;
  try {
    const r = await safeFetch(hit[1](url), { timeoutMs: 6000, headers: { accept: "application/json" } });
    if (r.status >= 400) return null;
    const j = JSON.parse(r.text) as { title?: string; author_name?: string; thumbnail_url?: string; provider_name?: string };
    return { title: j.title ?? "", image: j.thumbnail_url ?? "", siteName: j.provider_name ?? "", description: j.author_name ? `${j.provider_name ?? ""} · ${j.author_name}` : "", type: "video" };
  } catch {
    return null;
  }
}

/** fetch a page's title / description / og:image / favicon with timeout + SSRF guard */
export async function fetchMeta(url: string): Promise<PageMeta> {
  const [page, oe] = await Promise.all([fetchPage(url), oembed(url)]);
  if (!oe) return page;
  return { ...page, title: oe.title || page.title, image: oe.image || page.image, siteName: oe.siteName || page.siteName, description: page.description || oe.description || "", type: "video", ok: page.ok || !!oe.title, error: oe.title ? undefined : page.error };
}

async function fetchPage(url: string): Promise<PageMeta> {
  try {
    const res = await safeFetch(url, { timeoutMs: 8000 });
    const ct = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(ct) && !/^\s*</.test(res.text)) {
      return { url: res.url, title: domainOf(res.url), description: "", image: /image\//.test(ct) ? res.url : "", favicon: `${new URL(res.url).origin}/favicon.ico`, siteName: "", type: "", text: "", ok: res.status < 400 };
    }
    return { url: res.url, ...parseHtml(res.text, res.url), ok: res.status < 400 };
  } catch (e) {
    const u = new URL(url);
    return {
      url,
      title: "",
      description: "",
      image: "",
      favicon: `${u.origin}/favicon.ico`,
      siteName: "",
      type: "",
      text: "",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
