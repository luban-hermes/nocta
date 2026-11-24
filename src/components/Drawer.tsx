"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AppData, CategoryDTO, ContentDTO, MonitorDetail, MonitorDTO, SiteDTO } from "@/lib/types";
import { ago, api, copyText, fmtBytes, fmtRate, fmtUptime, hm, installCommand } from "@/lib/client";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/input";
import { useToast } from "./ui/toast";
import { Cover, Gauge, STATUS_LABEL, StatusDot, Ticks, Tile } from "./Cards";
import { CloseIcon, CopyIcon } from "./Icons";

export type DrawerTarget = { type: "site" | "content" | "monitor"; id: string } | null;

export function Drawer({ target, data, onClose, refresh }: { target: DrawerTarget; data: AppData; onClose: () => void; refresh: () => Promise<void> }) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const site = target?.type === "site" ? data.sites.find((s) => s.id === target.id) : undefined;
  const content = target?.type === "content" ? data.contents.find((s) => s.id === target.id) : undefined;
  const monitor = target?.type === "monitor" ? data.monitors.find((s) => s.id === target.id) : undefined;
  const open = !!(site || content || monitor);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="scrim on" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside
            key="drawer"
            className="drawer glass"
            role="dialog"
            aria-modal="true"
            aria-label="详情"
            initial={{ x: "calc(100% + 40px)" }}
            animate={{ x: 0 }}
            exit={{ x: "calc(100% + 40px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <button className="d-close" onClick={onClose} aria-label="关闭">
              <CloseIcon />
            </button>
            {site && <SiteView key={site.id} s={site} cats={data.categories.filter((c) => c.kind === "site")} admin={data.admin} onClose={onClose} refresh={refresh} />}
            {content && <ContentView key={content.id} c={content} cats={data.categories.filter((c) => c.kind === "content")} admin={data.admin} onClose={onClose} refresh={refresh} />}
            {monitor && <MonitorView key={monitor.id} m={monitor} admin={data.admin} onClose={onClose} refresh={refresh} />}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h4 className="d-h">{title}</h4>
      {children}
    </>
  );
}

function useAction(refresh: () => Promise<void>) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, ok?: string) => {
      setBusy(key);
      try {
        await fn();
        await refresh();
        if (ok) toast(ok);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "操作失败", "!");
        return false;
      } finally {
        setBusy("");
      }
    },
    [refresh, toast],
  );
  return { busy, run };
}

/* ---------------- site ---------------- */
function SiteView({ s, cats, admin, onClose, refresh }: { s: SiteDTO; cats: CategoryDTO[]; admin: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const { busy, run } = useAction(refresh);
  const [f, setF] = useState({ name: s.name, url: s.url, description: s.description, favicon: s.favicon, categoryId: s.categoryId ?? "", pinned: s.pinned });
  return (
    <>
      <div className="d-scroll">
        <div className="flex items-center gap-3 px-1 pt-2 pr-14">
          <Tile src={s.favicon} name={s.name} />
          <div className="min-w-0">
            <h2 className="d-title" style={{ margin: 0 }}>{s.name}</h2>
            <p className="d-src truncate" style={{ margin: 0 }}>{s.url}</p>
          </div>
        </div>
        {admin ? (
          <form className="f-grid mt-6" onSubmit={(e) => { e.preventDefault(); void run("save", () => api(`/api/sites/${s.id}`, { method: "PATCH", body: f }), "已保存"); }}>
            <Field label="名称"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="网址"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
            <Field label="描述"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="图标地址"><Input value={f.favicon} onChange={(e) => setF({ ...f, favicon: e.target.value })} placeholder="https://…/favicon.ico" /></Field>
            <div className="f-2">
              <Field label="分类">
                <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                  <option value="">未分类</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="置顶">
                <Select value={f.pinned ? "1" : "0"} onChange={(e) => setF({ ...f, pinned: e.target.value === "1" })}>
                  <option value="0">否</option>
                  <option value="1">是</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={busy === "save"}>保存修改</Button>
          </form>
        ) : (
          s.description && <p className="d-ai mt-4"><span>{s.description}</span></p>
        )}
      </div>
      <div className="d-actions" style={{ gridTemplateColumns: admin ? "1fr 1fr" : "1fr" }}>
        <a className="btn pri" href={s.url} target="_blank" rel="noopener noreferrer">打开网站</a>
        {admin && (
          <Button variant="danger" loading={busy === "del"} onClick={() => confirm(`删除站点「${s.name}」？`) && run("del", () => api(`/api/sites/${s.id}`, { method: "DELETE" }), "已删除").then((ok) => ok && onClose())}>删除</Button>
        )}
      </div>
    </>
  );
}

/* ---------------- content ---------------- */
function ContentView({ c, cats, admin, onClose, refresh }: { c: ContentDTO; cats: CategoryDTO[]; admin: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const { busy, run } = useAction(refresh);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: c.title, summary: c.summary, tags: c.tags.join(", "), categoryId: c.categoryId ?? "", cover: c.cover });
  const [note, setNote] = useState(c.note);
  const [saved, setSaved] = useState("");
  return (
    <>
      <div className="d-scroll">
        <Cover c={c} className="d-cover" />
        <h2 className="d-title">{c.title}</h2>
        <p className="d-src"><Tile src={c.favicon} name={c.domain} size="xs" /> {c.domain} · 收藏于 {ago(c.createdAt)}</p>
        {editing && admin ? (
          <form className="f-grid mt-5" onSubmit={(e) => { e.preventDefault(); void run("save", () => api(`/api/contents/${c.id}`, { method: "PATCH", body: f }), "已保存").then((ok) => ok && setEditing(false)); }}>
            <Field label="标题"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="摘要"><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
            <Field label="标签（逗号分隔）"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
            <Field label="封面图地址"><Input value={f.cover} onChange={(e) => setF({ ...f, cover: e.target.value })} /></Field>
            <Field label="分类">
              <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                <option value="">未分类</option>
                {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <div className="f-2">
              <Button type="button" onClick={() => setEditing(false)}>取消</Button>
              <Button type="submit" variant="primary" loading={busy === "save"}>保存</Button>
            </div>
          </form>
        ) : (
          <>
            {c.summary && (
              <div className="d-ai">
                {c.aiSummary && <span className="ai-label" style={{ marginTop: 0 }}>AI 摘要</span>}
                <p>{c.summary}</p>
              </div>
            )}
            {c.tags.length > 0 && <div className="tags">{c.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}</div>}
            {admin && (
              <Section title="笔记">
                <textarea className="d-note" value={note} placeholder="写点想法…（失焦自动保存）" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== c.note && api(`/api/contents/${c.id}`, { method: "PATCH", body: { note } }).then(() => { setSaved("已保存"); void refresh(); })} />
                <p className="d-saved">{saved}</p>
              </Section>
            )}
          </>
        )}
      </div>
      <div className="d-actions" style={{ gridTemplateColumns: admin ? undefined : "1fr" }}>
        <a className="btn pri" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => admin && !c.read && api(`/api/contents/${c.id}`, { method: "PATCH", body: { read: true } }).then(refresh)}>打开原文</a>
        {admin && (
          <>
            <Button loading={busy === "read"} onClick={() => run("read", () => api(`/api/contents/${c.id}`, { method: "PATCH", body: { read: !c.read } }), c.read ? "已标为未读" : "已标为已读")}>{c.read ? "标为未读" : "标记已读"}</Button>
            <Button onClick={() => setEditing((v) => !v)}>编辑</Button>
            <Button variant="danger" loading={busy === "del"} onClick={() => confirm("删除这条收藏？") && run("del", () => api(`/api/contents/${c.id}`, { method: "DELETE" }), "已删除").then((ok) => ok && onClose())}>删除</Button>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- monitor ---------------- */
function LineChart({ title, value, points, unit = "", max }: { title: string; value: string; points: { t: string; v: number }[]; unit?: string; max?: number }) {
  const W = 460, H = 120;
  if (points.length < 2)
    return (
      <div className="x-dchart">
        <p><span>{title}</span><b>{value}</b></p>
        <div style={{ height: 60, display: "grid", placeItems: "center", fontSize: 12, color: "var(--text3)" }}>数据不足，稍后再看</div>
      </div>
    );
  const vmax = max ?? Math.max(...points.map((p) => p.v), 1) * 1.15;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 14 - (p.v / vmax) * (H - 24)] as const);
  const d = "M" + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
  return (
    <div className="x-dchart">
      <p><span>{title}</span><b>{value}</b></p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[0.25, 0.5, 0.75].map((k) => <line key={k} className="gl" x1="0" x2={W} y1={(H - 14) * k} y2={(H - 14) * k} />)}
        <path className="ar" d={`${d}L${W},${H - 14}L0,${H - 14}Z`} />
        <path className="ln" d={d} />
        <text className="lb" x="0" y={H - 1}>{hm(points[0].t)}</text>
        <text className="lb" x={W} y={H - 1} textAnchor="end">{hm(points[points.length - 1].t)}</text>
        <text className="lb" x={W} y="10" textAnchor="end">{Math.round(vmax)}{unit}</text>
      </svg>
    </div>
  );
}

function downsample<T>(arr: T[], n = 120) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

function MonitorView({ m, admin, onClose, refresh }: { m: MonitorDTO; admin: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const toast = useToast();
  const { busy, run } = useAction(refresh);
  const [detail, setDetail] = useState<MonitorDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: m.name, url: m.url, interval: m.interval, expectStatus: m.expectStatus ?? "", timeoutMs: m.timeoutMs, method: m.method, host: m.host, port: m.port, sshUser: m.sshUser });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);

  const load = useCallback(() => api<MonitorDetail>(`/api/monitors/${m.id}`).then(setDetail).catch(() => {}), [m.id]);
  useEffect(() => {
    void load();
    const t = setInterval(() => !document.hidden && load(), 15000);
    return () => clearInterval(t);
  }, [load, m.lastCheckedAt, m.lastReportAt]);

  const events = (detail?.checks ?? []).filter((c, i, a) => i === 0 || c.ok !== a[i - 1].ok).slice(-12).reverse();
  const cmd = m.token && origin ? installCommand(origin, m.token) : "";
  const sshCmd = `ssh ${m.sshUser}@${m.host}${m.port !== 22 ? ` -p ${m.port}` : ""}`;

  return (
    <>
      <div className="d-scroll">
        <div className="px-1 pt-2 pr-14">
          <p className="d-src"><StatusDot status={m.status} /> {STATUS_LABEL[m.status]} · {m.kind === "server" ? "服务器" : "HTTP 监控"}</p>
          <h2 className="d-title" style={{ marginTop: 8 }}>{m.name}</h2>
          <p className="d-src truncate">{m.kind === "server" ? `${m.sshUser}@${m.host}:${m.port}` : m.url}</p>
          {m.alert && <p className="x-mon__alert" style={{ margin: "10px 4px 0" }}>⚠ {m.alert}</p>}
        </div>

        {editing && admin ? (
          <form
            className="f-grid mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              const body = m.kind === "server" ? { name: f.name, interval: Number(f.interval), host: f.host, port: Number(f.port), sshUser: f.sshUser } : { name: f.name, url: f.url, interval: Number(f.interval), expectStatus: f.expectStatus === "" ? null : Number(f.expectStatus), timeoutMs: Number(f.timeoutMs), method: f.method };
              void run("save", () => api(`/api/monitors/${m.id}`, { method: "PATCH", body }), "已保存").then((ok) => ok && setEditing(false));
            }}
          >
            <Field label="名称"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            {m.kind === "http" ? (
              <>
                <Field label="地址"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
                <div className="f-2">
                  <Field label="检查间隔（秒）"><Input type="number" min={10} value={f.interval} onChange={(e) => setF({ ...f, interval: Number(e.target.value) })} /></Field>
                  <Field label="超时（毫秒）"><Input type="number" min={1000} value={f.timeoutMs} onChange={(e) => setF({ ...f, timeoutMs: Number(e.target.value) })} /></Field>
                  <Field label="期望状态码（留空 = <400）"><Input type="number" value={f.expectStatus} onChange={(e) => setF({ ...f, expectStatus: e.target.value })} /></Field>
                  <Field label="方法"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>GET</option><option>HEAD</option></Select></Field>
                </div>
              </>
            ) : (
              <div className="f-2">
                <Field label="主机"><Input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} /></Field>
                <Field label="SSH 端口"><Input type="number" value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value) })} /></Field>
                <Field label="SSH 用户"><Input value={f.sshUser} onChange={(e) => setF({ ...f, sshUser: e.target.value })} /></Field>
                <Field label="上报间隔（秒）"><Input type="number" min={10} value={f.interval} onChange={(e) => setF({ ...f, interval: Number(e.target.value) })} /></Field>
              </div>
            )}
            <div className="f-2">
              <Button type="button" onClick={() => setEditing(false)}>取消</Button>
              <Button type="submit" variant="primary" loading={busy === "save"}>保存</Button>
            </div>
          </form>
        ) : m.kind === "server" ? (
          <>
            <div className="x-gauges" style={{ justifyContent: "space-around", marginTop: 20 }}>
              <Gauge label="CPU" value={m.cpu} />
              <Gauge label={`内存 ${m.memTotal ? fmtBytes(m.memTotal, 0) : ""}`} value={m.mem} />
              <Gauge label={`磁盘 ${m.diskTotal ? fmtBytes(m.diskTotal, 0) : ""}`} value={m.disk} />
            </div>
            <Section title="近 24 小时">
              <div className="grid gap-3">
                <LineChart title="CPU" value={m.cpu != null ? `${m.cpu}%` : "—"} unit="%" max={100} points={downsample(detail?.metrics ?? []).map((x) => ({ t: x.createdAt, v: x.cpu }))} />
                <LineChart title="内存" value={m.mem != null ? `${m.mem}%` : "—"} unit="%" max={100} points={downsample(detail?.metrics ?? []).map((x) => ({ t: x.createdAt, v: x.mem }))} />
                <LineChart title="网络下行" value={fmtRate(m.rxRate)} points={downsample(detail?.metrics ?? []).map((x) => ({ t: x.createdAt, v: x.rxRate / 1024 }))} unit="K" />
              </div>
            </Section>
            <Section title="主机信息">
              <div className="kv-list">
                <div><span>主机名</span><b>{m.hostname || "—"}</b></div>
                <div><span>系统</span><b>{m.os || "—"}</b></div>
                <div><span>运行时间</span><b>{fmtUptime(m.uptime)}</b></div>
                <div><span>负载</span><b>{m.load || "—"}</b></div>
                <div><span>网络</span><b>↓ {fmtRate(m.rxRate)} · ↑ {fmtRate(m.txRate)}</b></div>
                <div><span>最后上报</span><b>{ago(m.lastReportAt)}</b></div>
              </div>
            </Section>
            {admin && (
              <Section title="安装探针（在服务器上执行）">
                <p style={{ fontSize: 13, color: "var(--text3)", margin: "0 4px 8px" }}>先 <code>{sshCmd}</code> 登录服务器，再运行下面这一行。夜航不保存任何密码，探针只用一次性令牌推送数据。</p>
                <pre className="code">{cmd || "加载中…"}</pre>
                <div className="f-2 mt-2">
                  <Button onClick={() => copyText(cmd).then(() => toast("已复制安装命令"))}><CopyIcon /> 复制安装命令</Button>
                  <Button loading={busy === "rot"} onClick={() => confirm("重置令牌后旧探针将无法上报，确定？") && run("rot", () => api(`/api/monitors/${m.id}`, { method: "PATCH", body: { rotateToken: true } }), "已重置令牌")}>重置令牌</Button>
                </div>
              </Section>
            )}
          </>
        ) : (
          <>
            <div className="x-kv" style={{ marginTop: 18 }}>
              <div><small>状态码</small><b className={m.lastStatus != null && m.lastStatus < 400 ? "ok" : "bad"}>{m.lastStatus ?? "—"}</b></div>
              <div><small>响应</small><b>{m.lastLatency != null ? `${m.lastLatency}ms` : "—"}</b></div>
              <div><small>SSL 剩余</small><b>{m.sslDays != null ? `${m.sslDays} 天` : "—"}</b></div>
            </div>
            <Section title="24 小时可用性">
              <Ticks ticks={m.ticks} />
              <div className="x-tickcap"><span>{m.uptime24h != null ? `可用率 ${m.uptime24h}%` : "暂无数据"}</span><b>每 {m.interval} 秒 · 上次 {ago(m.lastCheckedAt)}</b></div>
            </Section>
            <Section title="响应时间">
              <LineChart title="毫秒" value={m.lastLatency != null ? `${m.lastLatency}ms` : "—"} unit="ms" points={downsample((detail?.checks ?? []).filter((c) => c.latency != null)).map((c) => ({ t: c.createdAt, v: c.latency! }))} />
            </Section>
            <Section title="状态变化">
              {events.length ? (
                <ul className="x-events">
                  {events.map((e, i) => (
                    <li key={i}><time>{hm(e.createdAt)}</time><StatusDot status={e.ok ? "up" : "down"} /> {e.ok ? `恢复正常 · ${e.status}` : `故障 · ${e.error || e.status}`}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text3)", margin: "0 4px" }}>暂无记录</p>
              )}
            </Section>
          </>
        )}
      </div>
      {admin && (
        <div className="d-actions">
          {m.kind === "http" ? (
            <Button variant="primary" loading={busy === "check"} onClick={() => run("check", () => api(`/api/monitors/${m.id}/check`, { method: "POST" }).then(load), "检查完成")}>立即检查</Button>
          ) : (
            <Button variant="primary" onClick={() => copyText(sshCmd).then(() => toast("已复制 SSH 命令"))}>复制 SSH</Button>
          )}
          <Button loading={busy === "pause"} onClick={() => run("pause", () => api(`/api/monitors/${m.id}`, { method: "PATCH", body: { paused: !m.paused } }), m.paused ? "已恢复监控" : "已暂停监控")}>{m.paused ? "恢复监控" : "暂停监控"}</Button>
          <Button onClick={() => setEditing((v) => !v)}>编辑</Button>
          <Button variant="danger" loading={busy === "del"} onClick={() => confirm(`删除监控「${m.name}」及其历史数据？`) && run("del", () => api(`/api/monitors/${m.id}`, { method: "DELETE" }), "已删除").then((ok) => ok && onClose())}>删除</Button>
        </div>
      )}
    </>
  );
}
