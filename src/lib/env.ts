/**
 * Environment variables are optional since batch-1: every setting lives in the database and is edited
 * in 夜航后台 → 设置. A variable that is set still works as the *default* for a setting that was never
 * saved in the UI (back-compat for existing docker-compose files). Read on every call.
 */
export const bool = (v: string | undefined, d: boolean) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(v));

export const envRaw = (name: string) => {
  const v = process.env[name];
  return v == null || v === "" ? undefined : v;
};

/** legacy ADMIN_PASSWORD (the .env.example placeholder counts as "not set") */
export const legacyAdminPassword = () => {
  const v = process.env.ADMIN_PASSWORD ?? "";
  return v === "change-me" ? "" : v;
};
