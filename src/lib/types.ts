export type CategoryKind = "site" | "content";
export type MonitorStatus = "pending" | "up" | "warn" | "down" | "paused";

export interface CategoryDTO {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  sort: number;
  count: number;
}

export interface SiteDTO {
  id: string;
  name: string;
  /** primary link */
  url: string;
  urlNote: string;
  /** backup links, in order (item 13) */
  backups: SiteLinkDTO[];
  description: string;
  favicon: string;
  /** cached icon served by /api/icon/site/:id ("" = none yet → letter tile) */
  icon: string;
  iconCustom: boolean;
  pinned: boolean;
  sort: number;
  categoryId: string | null;
  createdAt: string;
}

export interface SiteLinkDTO {
  id?: string;
  url: string;
  note: string;
}

export interface ContentDTO {
  id: string;
  url: string;
  title: string;
  summary: string;
  cover: string;
  favicon: string;
  icon: string;
  iconCustom: boolean;
  pinned: boolean;
  sort: number;
  domain: string;
  type: "article" | "video" | "repo" | "post";
  tags: string[];
  note: string;
  read: boolean;
  aiSummary: boolean;
  categoryId: string | null;
  createdAt: string;
}

export type Tick = "ok" | "warn" | "bad" | "off";

export interface MonitorDTO {
  id: string;
  kind: "http" | "server";
  name: string;
  status: MonitorStatus;
  alert: string;
  paused: boolean;
  interval: number;
  // http
  url: string;
  method: string;
  expectStatus: number | null;
  timeoutMs: number;
  lastStatus: number | null;
  lastLatency: number | null;
  sslDays: number | null;
  lastError: string;
  lastCheckedAt: string | null;
  // server
  host: string;
  port: number;
  sshUser: string;
  hostname: string;
  os: string;
  uptime: number | null;
  cpu: number | null;
  mem: number | null;
  memTotal: number | null;
  disk: number | null;
  diskTotal: number | null;
  load: string;
  rxRate: number | null;
  txRate: number | null;
  lastReportAt: string | null;
  token?: string;
  // derived
  uptime24h: number | null;
  ticks: Tick[];
  spark: number[];
}

/** change markers of the three bookmark tables (v0.4.0): the client re-downloads a list only when its marker moved */
export interface Versions {
  s: string;
  c: string;
  k: string;
}

export interface Totals {
  sites: number;
  contents: number;
  sitesNone: number;
  contentsNone: number;
}

export interface AppData {
  admin: boolean;
  publicMode: boolean;
  showMonitors: boolean;
  aiEnabled: boolean;
  /** open the first reachable backup link when the primary one is down */
  siteFailover: boolean;
  categories: CategoryDTO[];
  sites: SiteDTO[];
  contents: ContentDTO[];
  monitors: MonitorDTO[];
  /** v0.4.0: the home page ships only the first sites; the full lists are fetched after hydration */
  partial?: { sites: boolean; contents: boolean };
  totals?: Totals;
  version?: Versions;
}

/** 后台 (v0.4.0): counts + the latest few items; the bookmark table is paged by the server */
export interface AdminData {
  categories: CategoryDTO[];
  stats: { sites: number; contents: number; weekNew: number; unread: number; monitors: number; bad: number; down: number };
  recent: ContentDTO[];
}

export interface AdminRow {
  id: string;
  kind: "site" | "content";
  title: string;
  url: string;
  icon: string;
  domain: string;
  categoryId: string | null;
  tags: string;
  date: string;
}

export interface MonitorDetail {
  monitor: MonitorDTO;
  checks: { ok: boolean; status: number | null; latency: number | null; error: string; createdAt: string }[];
  metrics: { cpu: number; mem: number; disk: number; rxRate: number; txRate: number; createdAt: string }[];
}
