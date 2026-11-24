"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Select, Switch, type SelectOption } from "./ui/input";
import { useDialog } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { CloudIcon, KeyIcon, LogoutIcon, RefreshIcon, RestoreIcon, ShieldIcon, SparkIcon } from "./Icons";

/* 夜航后台 → 系统设置: every runtime option lives in the database now (item 4) + S3 backups (item 5) */

type Secret = { set: boolean; mask: string };
type Values = {
  publicMode: boolean; publicMonitors: boolean; timezone: string;
  aiBaseUrl: string; aiApiKey: Secret; aiModel: string;
  monitorScheduler: boolean; allowPrivateMonitors: boolean; retentionDays: number;
  s3Endpoint: string; s3Region: string; s3Bucket: string; s3AccessKey: string; s3SecretKey: Secret; s3Prefix: string; s3PathStyle: boolean;
  backupSchedule: "off" | "daily" | "weekly"; backupHour: number; backupKeep: number;
};
type SettingsRes = { values: Values; sources: Record<string, "db" | "env" | "default">; aiEnabled: boolean; password: "hash" | "env" | "none" };
type BackupItem = { key: string; size: number; at: string };
type BackupRes = { items: BackupItem[]; last: { at: string; ok: boolean; key?: string; size?: number; error?: string; trigger: string } | null; error?: string };

const TZ: SelectOption[] = [
  { value: "", label: "跟随服务器系统" },
  ...["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"].map((z) => ({ value: z, label: z })),
];
const AI_PRESETS: { id: string; label: string; base: string; model: string }[] = [
  { id: "deepseek", label: "DeepSeek", base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "qwen", label: "通义千问", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "moonshot", label: "Moonshot / Kimi", base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "openai", label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "ollama", label: "Ollama（本机，无需 Key）", base: "http://host.docker.internal:11434/v1", model: "qwen2.5:7b" },
];
const S3_PRESETS = [
  { id: "r2", label: "Cloudflare R2", endpoint: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com", region: "auto", pathStyle: true },
  { id: "aws", label: "AWS S3", endpoint: "", region: "us-east-1", pathStyle: false },
  { id: "minio", label: "MinIO（自建）", endpoint: "http://192.168.1.10:9000", region: "us-east-1", pathStyle: true },
  { id: "b2", label: "Backblaze B2", endpoint: "https://s3.us-west-004.backblazeb2.com", region: "us-west-004", pathStyle: true },
];
const HOURS: SelectOption[] = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtTime = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

function Row({ title, desc, children, src }: { title: string; desc?: ReactNode; children: ReactNode; src?: string }) {
  return (
    <div className="set-row">
      <div className="set-l">
        <b>
          {title}
          {src === "env" && <span className="set-src" title="来自环境变量；在这里保存后以设置为准">环境变量</span>}
        </b>
        {desc && <small>{desc}</small>}
      </div>
      <div className="set-c">{children}</div>
    </div>
  );
}

function Panel({ icon, title, sub, children, foot }: { icon: ReactNode; title: string; sub?: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <section className="panel set-panel">
      <div className="ph">
        <h3><span className="set-ic">{icon}</span>{title}</h3>
        {sub && <small>{sub}</small>}
      </div>
      <div className="set-body">{children}</div>
      {foot && <div className="set-foot">{foot}</div>}
    </section>
  );
}

export function SettingsPanel() {
  const toast = useToast();
  const dialog = useDialog();
  const [res, setRes] = useState<SettingsRes | null>(null);
  const [v, setV] = useState<Values | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [busy, setBusy] = useState("");
  const [backups, setBackups] = useState<BackupRes | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", again: "" });

  const load = useCallback(async () => {
    const r = await api<SettingsRes>("/api/settings");
    setRes(r);
    setV(r.values);
  }, []);
  const loadBackups = useCallback(() => api<BackupRes>("/api/backup").then(setBackups).catch((e) => setBackups({ items: [], last: null, error: e.message })), []);
  useEffect(() => {
    void load().catch((e) => toast(e.message, "error"));
    void loadBackups();
  }, [load, loadBackups, toast]);

  if (!v || !res) return <p className="empty">正在加载设置…</p>;
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV({ ...v, [k]: val });
  const src = res.sources;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "操作失败", "error");
      return false;
    } finally {
      setBusy("");
    }
  };
  const save = (key: string, keys: (keyof Values)[], extra: Record<string, unknown> = {}) =>
    run(key, async () => {
      const body: Record<string, unknown> = { ...extra };
      for (const k of keys) body[k] = v[k];
      const r = await api<SettingsRes>("/api/settings", { method: "PATCH", body });
      setRes(r);
      setV(r.values);
    }, "设置已保存，立即生效");

  const s3Body = () => ({ s3Endpoint: v.s3Endpoint, s3Region: v.s3Region, s3Bucket: v.s3Bucket, s3AccessKey: v.s3AccessKey, s3Prefix: v.s3Prefix, s3PathStyle: v.s3PathStyle, ...(s3Secret ? { s3SecretKey: s3Secret } : {}) });
  const s3Configured = !!(v.s3Bucket && v.s3AccessKey && v.s3SecretKey.set);

  return (
    <div className="settings">
      <Panel icon={<ShieldIcon />} title="访问与显示" sub="保存后立即生效">
        <Row title="访客可浏览导航" desc="关闭后，首页与所有数据都需要登录才能查看" src={src.publicMode}>
          <Switch checked={v.publicMode} onChange={(b) => set("publicMode", b)} label="访客可浏览导航" />
        </Row>
        <Row title="访客可见服务监控" desc="开启后访客能看到监控卡片（含主机名 / 地址）" src={src.publicMonitors}>
          <Switch checked={v.publicMonitors} onChange={(b) => set("publicMonitors", b)} label="访客可见服务监控" />
        </Row>
        <Row title="时区" desc="用于定时备份的时间与服务器日志" src={src.timezone}>
          <Select ariaLabel="时区" value={v.timezone} onChange={(x) => set("timezone", x)} options={TZ.some((o) => o.value === v.timezone) ? TZ : [...TZ, { value: v.timezone, label: v.timezone }]} />
        </Row>
        <div className="set-actions">
          <Button variant="primary" loading={busy === "access"} onClick={() => save("access", ["publicMode", "publicMonitors", "timezone"])}>保存</Button>
        </div>
      </Panel>

      <Panel icon={<SparkIcon />} title="AI" sub={res.aiEnabled ? "已启用" : "未配置 · 使用规则模式"}>
        <Row title="快速填写" desc="任意 OpenAI 兼容的 Chat Completions 接口">
          <Select ariaLabel="AI 服务商" value="" placeholder="选择服务商…" onChange={(id) => { const p = AI_PRESETS.find((x) => x.id === id); if (p) setV({ ...v, aiBaseUrl: p.base, aiModel: p.model }); }} options={AI_PRESETS.map((p) => ({ value: p.id, label: p.label, hint: p.model }))} />
        </Row>
        <Row title="Base URL" src={src.aiBaseUrl}>
          <Input value={v.aiBaseUrl} onChange={(e) => set("aiBaseUrl", e.target.value)} placeholder="https://api.deepseek.com/v1" spellCheck={false} aria-label="AI Base URL" />
        </Row>
        <Row title="API Key" desc={v.aiApiKey.set ? <>已保存（{v.aiApiKey.mask}），留空则不修改</> : "加密保存在数据库中，界面只显示掩码"} src={src.aiApiKey}>
          <div className="set-inline">
            <Input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder={v.aiApiKey.set ? v.aiApiKey.mask : "sk-…"} autoComplete="off" aria-label="AI API Key" />
            {v.aiApiKey.set && <Button onClick={async () => (await dialog.confirm({ title: "清除 AI API Key？", danger: true, confirmText: "清除" })) && save("aikey", [], { aiApiKey: "" })}>清除</Button>}
          </div>
        </Row>
        <Row title="模型" src={src.aiModel}>
          <Input value={v.aiModel} onChange={(e) => set("aiModel", e.target.value)} placeholder="deepseek-chat" spellCheck={false} aria-label="AI 模型" />
        </Row>
        <div className="set-actions">
          <Button loading={busy === "aitest"} onClick={() => run("aitest", async () => { const r = await api<{ ms: number; reply: string }>("/api/settings/test-ai", { method: "POST" }); toast(`AI 连接正常 · ${r.ms}ms · “${r.reply}”`); })}>测试连接</Button>
          <Button variant="primary" loading={busy === "ai"} onClick={() => save("ai", ["aiBaseUrl", "aiModel"], aiKey ? { aiApiKey: aiKey } : {}).then((ok) => ok && setAiKey(""))}>保存</Button>
        </div>
        <p className="set-note">「测试连接」使用已保存的配置，修改后请先保存。</p>
      </Panel>

      <Panel icon={<RefreshIcon />} title="服务监控">
        <Row title="自动检查" desc="关闭后 HTTP 监控暂停定时检查（服务器探针仍会上报）" src={src.monitorScheduler}>
          <Switch checked={v.monitorScheduler} onChange={(b) => set("monitorScheduler", b)} label="自动检查" />
        </Row>
        <Row title="允许监控内网地址" desc="家庭实验室 / 内网服务需要开启；书签抓取始终禁止访问内网" src={src.allowPrivateMonitors}>
          <Switch checked={v.allowPrivateMonitors} onChange={(b) => set("allowPrivateMonitors", b)} label="允许监控内网地址" />
        </Row>
        <Row title="历史数据保留" desc="单位：天（1–365）" src={src.retentionDays}>
          <Input type="number" min={1} max={365} value={v.retentionDays} onChange={(e) => set("retentionDays", Number(e.target.value))} aria-label="保留天数" style={{ maxWidth: 140 }} />
        </Row>
        <div className="set-actions">
          <Button variant="primary" loading={busy === "mon"} onClick={() => save("mon", ["monitorScheduler", "allowPrivateMonitors", "retentionDays"])}>保存</Button>
        </div>
      </Panel>

      <Panel icon={<CloudIcon />} title="备份到 S3" sub="兼容 AWS S3 / Cloudflare R2 / MinIO / B2 等">
        <Row title="快速填写">
          <Select ariaLabel="S3 服务商" value="" placeholder="选择服务商…" onChange={(id) => { const p = S3_PRESETS.find((x) => x.id === id); if (p) setV({ ...v, s3Endpoint: p.endpoint, s3Region: p.region, s3PathStyle: p.pathStyle }); }} options={S3_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        </Row>
        <Row title="Endpoint" desc="AWS 留空；其他服务填它们的 S3 API 地址">
          <Input value={v.s3Endpoint} onChange={(e) => set("s3Endpoint", e.target.value)} placeholder="https://<account>.r2.cloudflarestorage.com" spellCheck={false} aria-label="S3 Endpoint" />
        </Row>
        <div className="set-grid">
          <Row title="Region"><Input value={v.s3Region} onChange={(e) => set("s3Region", e.target.value)} placeholder="auto" aria-label="Region" /></Row>
          <Row title="Bucket"><Input value={v.s3Bucket} onChange={(e) => set("s3Bucket", e.target.value)} placeholder="my-backups" aria-label="Bucket" /></Row>
          <Row title="Access Key"><Input value={v.s3AccessKey} onChange={(e) => set("s3AccessKey", e.target.value)} autoComplete="off" spellCheck={false} aria-label="Access Key" /></Row>
          <Row title="Secret Key" desc={v.s3SecretKey.set ? `已保存（${v.s3SecretKey.mask}）` : undefined}>
            <Input type="password" value={s3Secret} onChange={(e) => setS3Secret(e.target.value)} placeholder={v.s3SecretKey.set ? "留空则不修改" : ""} autoComplete="off" aria-label="Secret Key" />
          </Row>
          <Row title="路径前缀"><Input value={v.s3Prefix} onChange={(e) => set("s3Prefix", e.target.value)} placeholder="nocta-backups" aria-label="路径前缀" /></Row>
          <Row title="Path-style 访问" desc="MinIO / R2 通常开启"><Switch checked={v.s3PathStyle} onChange={(b) => set("s3PathStyle", b)} label="Path-style" /></Row>
        </div>
        <div className="set-actions">
          <Button loading={busy === "s3test"} onClick={() => run("s3test", async () => { const r = await api<{ ms: number }>("/api/backup/test", { body: s3Body() }); toast(`连接成功，可读写 · ${r.ms}ms`); })}>测试连接</Button>
          <Button variant="primary" loading={busy === "s3"} onClick={() => save("s3", ["s3Endpoint", "s3Region", "s3Bucket", "s3AccessKey", "s3Prefix", "s3PathStyle"], s3Secret ? { s3SecretKey: s3Secret } : {}).then((ok) => { if (ok) { setS3Secret(""); void loadBackups(); } })}>保存</Button>
        </div>

        <h4 className="set-h">自动备份</h4>
        <div className="set-grid three">
          <Row title="频率">
            <Select ariaLabel="备份频率" value={v.backupSchedule} onChange={(x) => set("backupSchedule", x as Values["backupSchedule"])} options={[{ value: "off", label: "关闭" }, { value: "daily", label: "每天" }, { value: "weekly", label: "每周一" }]} />
          </Row>
          <Row title="时间">
            <Select ariaLabel="备份时间" value={String(v.backupHour)} onChange={(x) => set("backupHour", Number(x))} options={HOURS} disabled={v.backupSchedule === "off"} />
          </Row>
          <Row title="保留份数">
            <Input type="number" min={1} max={365} value={v.backupKeep} onChange={(e) => set("backupKeep", Number(e.target.value))} aria-label="保留份数" />
          </Row>
        </div>
        <div className="set-actions">
          <Button variant="primary" loading={busy === "sched"} onClick={() => save("sched", ["backupSchedule", "backupHour", "backupKeep"])}>保存</Button>
        </div>

        <h4 className="set-h">
          备份列表
          <Button className="sm" loading={busy === "list"} onClick={() => run("list", loadBackups)}>刷新</Button>
          <Button className="sm" variant="primary" disabled={!s3Configured} loading={busy === "now"} onClick={() => run("now", async () => { await api("/api/backup", { method: "POST" }); await loadBackups(); }, "备份完成")}>立即备份</Button>
        </h4>
        {backups?.last && (
          <p className={cn("set-note", !backups.last.ok && "bad")}>
            上次{backups.last.trigger === "scheduled" ? "自动" : backups.last.trigger === "pre-restore" ? "恢复前" : "手动"}备份：{fmtTime(backups.last.at)} · {backups.last.ok ? `成功（${fmtSize(backups.last.size ?? 0)}）` : `失败：${backups.last.error}`}
          </p>
        )}
        {!s3Configured ? (
          <p className="set-note">填写并保存 S3 配置后即可备份。备份内容：系统设置（不含密钥和密码）+ 全部站点、收藏、分类、监控及监控历史 + 图标。</p>
        ) : backups?.error ? (
          <p className="set-note bad">{backups.error}</p>
        ) : backups && !backups.items.length ? (
          <p className="set-note">还没有备份。</p>
        ) : (
          <ul className="bk-list">
            {backups?.items.map((b) => (
              <li key={b.key}>
                <span className="bk-n">
                  <b>{fmtTime(b.at)}</b>
                  <small>{b.key.split("/").pop()}{b.key.includes("pre-restore") ? " · 恢复前自动备份" : ""}</small>
                </span>
                <span className="bk-s">{fmtSize(b.size)}</span>
                <Button
                  className="sm"
                  loading={busy === "restore:" + b.key}
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "用这个备份覆盖当前数据？",
                      message: <>将恢复 {fmtTime(b.at)} 的备份：当前所有站点、收藏、分类、监控和监控历史都会被替换。恢复前会自动再做一次备份，可随时恢复回来。密码、AI Key 与 S3 配置保持不变。</>,
                      confirmText: "恢复",
                      danger: true,
                    });
                    if (!ok) return;
                    await run("restore:" + b.key, async () => {
                      const r = await api<{ stats: Record<string, number> }>("/api/backup/restore", { body: { key: b.key } });
                      toast(`已恢复：${r.stats.sites} 个站点、${r.stats.contents} 条收藏、${r.stats.monitors} 个监控`);
                      setTimeout(() => location.reload(), 1200);
                    });
                  }}
                >
                  <RestoreIcon /> 恢复
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel icon={<KeyIcon />} title="管理员密码" sub={res.password === "env" ? "当前使用环境变量 ADMIN_PASSWORD，在这里设置后以此为准" : undefined}>
        <form
          className="set-pw"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next.length < 8) return toast("新密码至少 8 位", "error");
            if (pw.next !== pw.again) return toast("两次输入的新密码不一致", "error");
            void run("pw", async () => {
              await api("/api/auth/password", { body: { current: pw.current, next: pw.next } });
              setPw({ current: "", next: "", again: "" });
              void load();
            }, "密码已修改，其他设备需要重新登录");
          }}
        >
          <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="当前密码" autoComplete="current-password" aria-label="当前密码" />
          <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="新密码（至少 8 位）" autoComplete="new-password" aria-label="新密码" />
          <Input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} placeholder="再输入一次新密码" autoComplete="new-password" aria-label="确认新密码" />
          <Button type="submit" variant="primary" loading={busy === "pw"} disabled={!pw.current || !pw.next}>修改密码</Button>
        </form>
      </Panel>

      <div className="field">
        <div className="fl"><b>退出登录</b><small>清除当前浏览器的管理员会话</small></div>
        <Button variant="danger" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/"; }}><LogoutIcon /> 退出登录</Button>
      </div>
    </div>
  );
}
