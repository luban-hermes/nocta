import { NextResponse } from "next/server";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

export const json = (data: unknown, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

const gz = promisify(gzip);

/**
 * Large JSON, gzip-compressed (v0.4.0). Next.js drops `Content-Encoding` from route-handler responses and does
 * not compress them itself, so a client that asks with `?z=1` (it can decompress with DecompressionStream) gets
 * the gzip bytes as application/octet-stream plus `x-nocta-z: gzip`; everybody else gets plain JSON.
 */
export async function jsonz(req: Request, data: unknown, init: ResponseInit = {}) {
  const text = JSON.stringify(data);
  const headers = new Headers(init.headers);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  const z = new URL(req.url).searchParams.get("z") === "1";
  if (z && text.length >= 2048) {
    headers.set("content-type", "application/octet-stream");
    headers.set("x-nocta-z", "gzip");
    return new Response(new Uint8Array(await gz(Buffer.from(text), { level: 6 })), { ...init, headers });
  }
  headers.set("content-type", "application/json");
  return new Response(text, { ...init, headers });
}
