import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";

/** the data volume: NOCTA_DATA_DIR, else the folder holding the SQLite file, else ./data */
export function dataDir() {
  if (process.env.NOCTA_DATA_DIR) return path.resolve(process.env.NOCTA_DATA_DIR);
  const u = process.env.DATABASE_URL ?? "";
  if (u.startsWith("file:")) {
    const f = u.slice(5).split("?")[0];
    return path.dirname(path.isAbsolute(f) ? f : path.resolve(process.cwd(), "prisma", f));
  }
  return path.resolve(process.cwd(), "data");
}

export function dataSubdir(name: string) {
  const d = path.join(dataDir(), name);
  mkdirSync(d, { recursive: true });
  return d;
}
