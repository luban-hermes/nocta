"use client";
import { useSyncExternalStore } from "react";
import type { SiteDTO } from "./types";

/*
 * Multi-link sites (item 13): is a link reachable *from this browser*? The server's network is not the
 * visitor's network, so the check runs here: fetch(url, { mode: "no-cors", method: "HEAD" }) with a
 * 1.5s timeout. An opaque answer = something answered (ok); DNS failure / refused / timeout = down.
 * no-cors cannot see 5xx, but "cannot be opened" is almost always "cannot connect".
 * http:// links on an https:// page cannot be probed (mixed content) → status "unknown".
 * Results are cached for 5 minutes.
 */

export type LinkState = { status: "ok" | "down" | "unknown" | "checking"; ms: number | null; at: number };
const TTL = 5 * 60_000;
const TIMEOUT = 1500;

const cache = new Map<string, LinkState>();
const inflight = new Map<string, Promise<LinkState>>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

export const siteLinks = (s: Pick<SiteDTO, "url" | "urlNote" | "backups">) => [{ url: s.url, note: s.urlNote }, ...s.backups];

export function linkState(url: string): LinkState | undefined {
  const st = cache.get(url);
  return st && (st.status === "checking" || Date.now() - st.at < TTL) ? st : undefined;
}

const unprobeable = (url: string) => typeof location !== "undefined" && location.protocol === "https:" && url.startsWith("http:");

export function probe(url: string, force = false): Promise<LinkState> {
  const fresh = linkState(url);
  if (!force && fresh && fresh.status !== "checking") return Promise.resolve(fresh);
  const running = inflight.get(url);
  if (running) return running;
  if (unprobeable(url)) {
    const st: LinkState = { status: "unknown", ms: null, at: Date.now() };
    cache.set(url, st);
    emit();
    return Promise.resolve(st);
  }
  cache.set(url, { status: "checking", ms: null, at: Date.now() });
  emit();
  const ctrl = new AbortController();
  const t0 = performance.now();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const job = fetch(url, { mode: "no-cors", method: "HEAD", cache: "no-store", credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", signal: ctrl.signal })
    .then((): LinkState => ({ status: "ok", ms: Math.round(performance.now() - t0), at: Date.now() }))
    .catch((): LinkState => ({ status: "down", ms: null, at: Date.now() }))
    .then((st) => {
      clearTimeout(timer);
      cache.set(url, st);
      inflight.delete(url);
      emit();
      return st;
    });
  inflight.set(url, job);
  return job;
}

/** probe many URLs, at most `limit` at a time */
export async function probeAll(urls: string[], limit = 6) {
  const queue = [...new Set(urls)];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) await probe(u);
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

/** first reachable link (primary first); unknown ones next; all down → the primary */
export function pickLink(urls: string[]) {
  const st = urls.map((u) => linkState(u)?.status);
  const i = st.indexOf("ok");
  if (i >= 0) return urls[i];
  const j = st.indexOf("unknown");
  return j >= 0 ? urls[j] : urls[0];
}
export const anyTested = (urls: string[]) => urls.some((u) => {
  const s = linkState(u)?.status;
  return s === "ok" || s === "down" || s === "unknown";
});

/**
 * open a multi-link site in a new tab. Primary reachable → primary; else the first reachable backup.
 * Nothing tested yet → open a blank tab synchronously (so no popup blocker), probe, then navigate it.
 */
export async function openSite(urls: string[]) {
  if (anyTested(urls) && !urls.some((u) => linkState(u)?.status === "checking")) {
    window.open(pickLink(urls), "_blank", "noopener");
    return;
  }
  const w = window.open("about:blank", "_blank");
  if (w) w.opener = null;
  // primary answers first → go right away; otherwise wait for the rest (each capped at 1.5s)
  const first = await probe(urls[0]);
  if (first.status !== "ok") await Promise.all(urls.slice(1).map((u) => probe(u)));
  const target = pickLink(urls);
  if (w && !w.closed) w.location.href = target;
  else window.open(target, "_blank", "noopener");
}

/** re-render when any probe result changes */
export function useProbes() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => version,
    () => 0,
  );
}
