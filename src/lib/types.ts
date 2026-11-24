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
  url: string;
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

export interface AppData {
  admin: boolean;
  publicMode: boolean;
  showMonitors: boolean;
  aiEnabled: boolean;
  categories: CategoryDTO[];
  sites: SiteDTO[];
  contents: ContentDTO[];
  monitors: MonitorDTO[];
}

export interface MonitorDetail {
  monitor: MonitorDTO;
  checks: { ok: boolean; status: number | null; latency: number | null; error: string; createdAt: string }[];
  metrics: { cpu: number; mem: number; disk: number; rxRate: number; txRate: number; createdAt: string }[];
}
