import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(input: string): URL | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost" && !/^\[/.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** a bare domain (no meaningful path / query) is treated as a site; anything deeper is content */
export function isBareDomain(u: URL) {
  return (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
}

export function splitTags(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinTags(tags: unknown): string {
  const arr = Array.isArray(tags) ? tags : typeof tags === "string" ? splitTags(tags) : [];
  return [...new Set(arr.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean))].slice(0, 6).join(",");
}

export function clip(s: string, n: number) {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
