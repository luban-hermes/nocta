import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

/** true for loopback, private, link-local, CGNAT, multicast, reserved and metadata ranges */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true;
}

export class BlockedHostError extends Error {}

/** resolve a hostname and throw when any of its addresses is private */
export async function assertPublicHost(hostname: string) {
  const h = hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(h)) throw new BlockedHostError(`拒绝访问内网地址：${h}`);
  const addrs = net.isIP(h) ? [{ address: h }] : await lookup(h, { all: true, verbatim: true });
  if (!addrs.length) throw new BlockedHostError(`无法解析：${h}`);
  for (const a of addrs) if (isPrivateIp(a.address)) throw new BlockedHostError(`拒绝访问内网地址：${h} → ${a.address}`);
}

/**
 * fetch with an SSRF guard: every hop of a redirect chain is resolved and checked,
 * the whole request is bounded by `timeoutMs`, and the body is capped at `maxBytes`.
 */
export async function safeFetch(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string>; maxRedirects?: number; allowPrivate?: boolean } = {},
) {
  const { timeoutMs = 8000, maxBytes = 768 * 1024, maxRedirects = 5 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const u = new URL(current);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedHostError("只支持 http/https");
      if (!opts.allowPrivate) await assertPublicHost(u.hostname);
      const res = await fetch(u, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; NoctaBot/0.1; +https://github.com/luban-hermes/nocta)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
          ...opts.headers,
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, u).toString();
        await res.body?.cancel();
        continue;
      }
      const buf = await readCapped(res, maxBytes);
      return { url: current, status: res.status, headers: res.headers, buf, get text() { return decodeText(buf, res.headers); } };
    }
    throw new Error("重定向次数过多");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes);
}

function decodeText(buf: Buffer, headers: Headers) {
  const ct = headers.get("content-type") ?? "";
  const m = ct.match(/charset=([\w-]+)/i) ?? buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i);
  const charset = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}
