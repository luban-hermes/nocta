import "server-only";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { dataSubdir } from "./paths";

/*
 * Icon URLs are per file (v0.4.0): /api/icon/f/<file>?v=<version>. Bookmarks on the same host share one
 * h_* file, so they share one URL and one browser cache entry; the version (file mtime) changes when the
 * file is rewritten, so the response can be cached as immutable.
 */
type G = { __noctaIconVer?: Map<string, string>; __noctaIconHash?: Map<string, string> };
const g = globalThis as unknown as G;
const vers = () => (g.__noctaIconVer ??= new Map());
const hashes = () => (g.__noctaIconHash ??= new Map());
const dir = () => dataSubdir("icons");

export function iconVersion(file: string) {
  const m = vers();
  let v = m.get(file);
  if (v === undefined) {
    try {
      v = Math.round(statSync(path.join(dir(), path.basename(file))).mtimeMs).toString(36);
    } catch {
      v = "0";
    }
    m.set(file, v);
  }
  return v;
}

export const iconFileUrl = (file: string) => (file ? `/api/icon/f/${encodeURIComponent(file)}?v=${iconVersion(file)}` : "");

/** content hash of an icon file (cached until the file is rewritten) */
export function iconContentHash(file: string) {
  if (!file) return "";
  const m = hashes();
  let h = m.get(file);
  if (h === undefined) {
    try {
      h = createHash("sha1").update(readFileSync(path.join(dir(), path.basename(file)))).digest("hex");
    } catch {
      h = "";
    }
    m.set(file, h);
  }
  return h;
}

/** forget what we know about one file (it was written / removed), or about all of them (restore) */
export function iconChanged(file?: string) {
  if (file) {
    vers().delete(file);
    hashes().delete(file);
  } else {
    vers().clear();
    hashes().clear();
  }
}
