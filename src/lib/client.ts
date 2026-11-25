"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  return data as T;
}

/** GET a large JSON list compressed (see jsonz on the server); falls back to plain JSON */
export async function apiZ<T = unknown>(path: string): Promise<T> {
  const can = typeof DecompressionStream !== "undefined";
  const res = await fetch(can ? path + (path.includes("?") ? "&" : "?") + "z=1" : path, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError((data as { error?: string }).error ?? `请求失败（${res.status}）`, res.status);
  }
  if (can && res.headers.get("x-nocta-z") === "gzip" && res.body) return (await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json()) as T;
  return (await res.json()) as T;
}

export const fmtBytes = (n: number | null | undefined, digits = 1) => {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
};
export const fmtRate = (n: number | null | undefined) => (n == null ? "—" : `${fmtBytes(n)}/s`);

export function ago(iso: string | null | undefined) {
  if (!iso) return "从未";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)} 秒前`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return `${Math.round(s / 86400)} 天前`;
}

export function fmtUptime(sec: number | null | undefined) {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}

export function hm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function installCommand(origin: string, token: string) {
  return `curl -fsSL ${origin}/api/agent/script | sudo bash -s -- install --server ${origin} --token ${token}`;
}

export async function copyText(s: string) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
