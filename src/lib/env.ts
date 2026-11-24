/** Runtime configuration (read on every call so `docker run -e` changes need no rebuild). */
const bool = (v: string | undefined, d: boolean) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(v));

export const env = {
  /** the admin password; the placeholder from .env.example counts as "not set" so it can never be used to sign in */
  get adminPassword() {
    const v = process.env.ADMIN_PASSWORD ?? "";
    return v === "change-me" ? "" : v;
  },
  get adminPasswordIsPlaceholder() {
    return process.env.ADMIN_PASSWORD === "change-me";
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET ?? "";
  },
  /** visitors may browse the navigation without signing in */
  get publicMode() {
    return bool(process.env.PUBLIC_MODE, true);
  },
  /** visitors may also see the monitoring tab (hosts/URLs included) */
  get publicMonitors() {
    return bool(process.env.PUBLIC_MONITORS, false);
  },
  get aiBaseUrl() {
    return (process.env.AI_BASE_URL ?? "").replace(/\/+$/, "");
  },
  get aiApiKey() {
    return process.env.AI_API_KEY ?? "";
  },
  get aiModel() {
    return process.env.AI_MODEL ?? "";
  },
  get aiEnabled() {
    return !!(this.aiBaseUrl && this.aiModel && (this.aiApiKey || /localhost|127\.0\.0\.1|ollama|host\.docker\.internal/.test(this.aiBaseUrl)));
  },
  /** allow HTTP monitors to target private / LAN addresses (homelab). Bookmark fetching is always guarded. */
  get allowPrivateMonitors() {
    return bool(process.env.ALLOW_PRIVATE_MONITORS, true);
  },
  get schedulerEnabled() {
    return bool(process.env.MONITOR_SCHEDULER, true);
  },
  get retentionDays() {
    return Math.max(1, Number(process.env.MONITOR_RETENTION_DAYS ?? 7) || 7);
  },
};
