"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { AppData, CategoryDTO, CategoryKind } from "@/lib/types";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { ToastProvider, useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/input";
import { DownIcon, TrashIcon, UpIcon } from "./Icons";
import { BrandOrb } from "./NoctaApp";
import { Tile } from "./Cards";

type Config = { publicMode: boolean; publicMonitors: boolean; aiEnabled: boolean; aiModel: string; aiBaseUrl: string; allowPrivateMonitors: boolean; retentionDays: number; scheduler: boolean };
type Section = "dash" | "cats" | "items" | "sys";

export function AdminApp(props: { initial: AppData; config: Config }) {
  return (
    <ToastProvider>
      <Admin {...props} />
    </ToastProvider>
  );
}

function Admin({ initial, config }: { initial: AppData; config: Config }) {
  const [data, setData] = useState(initial);
  const [sec, setSec] = useState<Section>("dash");
  const refresh = useCallback(async () => setData(await api<AppData>("/api/data")), []);
  const S: { id: Section; label: string }[] = [
    { id: "dash", label: "概览" },
    { id: "cats", label: "分类管理" },
    { id: "items", label: "书签管理" },
    { id: "sys", label: "系统设置" },
  ];
  return (
    <>
      <Starfield />
      <header className="topbar glass">
        <Link className="brand" href="/admin">
          <BrandOrb />
          <span>夜航后台</span>
          <span className="brand-tag">Nocta</span>
        </Link>
        <span />
        <div className="actions">
          <ThemeToggle />
          <Link className="btn" href="/">← 返回首页</Link>
        </div>
      </header>
      <div className="admin-page">
        <div className="x-tabbar">
          <div className="x-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${S.length},1fr)`, width: "min(640px,100%)" }}>
            {S.map((t) => (
              <button key={t.id} className="x-tab" role="tab" aria-selected={sec === t.id} onClick={() => setSec(t.id)}>
                {sec === t.id && <motion.span layoutId="admin-pill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <motion.div key={sec} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {sec === "dash" && <Dash data={data} />}
          {sec === "cats" && (
            <div className="grid gap-6 md:grid-cols-2">
              <CatEditor kind="site" title="站点分类" cats={data.categories.filter((c) => c.kind === "site")} refresh={refresh} />
              <CatEditor kind="content" title="内容分类" cats={data.categories.filter((c) => c.kind === "content")} refresh={refresh} />
            </div>
          )}
          {sec === "items" && <Items data={data} refresh={refresh} />}
          {sec === "sys" && <Sys config={config} />}
        </motion.div>
      </div>
    </>
  );
}

function Dash({ data }: { data: AppData }) {
  const week = Date.now() - 7 * 86400000;
  const tiles = [
    { label: "站点", v: data.sites.length, d: `${data.categories.filter((c) => c.kind === "site").length} 个分类` },
    { label: "收藏内容", v: data.contents.length, d: `本周新增 ${data.contents.filter((c) => new Date(c.createdAt).getTime() > week).length}` },
    { label: "未读", v: data.contents.filter((c) => !c.read).length, d: "收藏后还没打开" },
    { label: "监控", v: data.monitors.length, d: `${data.monitors.filter((m) => m.status === "down" || m.status === "warn").length} 个异常`, bad: data.monitors.some((m) => m.status === "down") },
  ];
  return (
    <>
      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile-stat" key={t.label}>
            <small>{t.label}</small>
            <b className="big">{t.v}</b>
            <span className={cn("delta", t.bad && "bad")}>{t.d}</span>
          </div>
        ))}
      </div>
      <div className="panel mt-4">
        <div className="ph"><h3>最近收藏</h3><small>最新 8 条</small></div>
        <div className="grid gap-2 mt-3">
          {data.contents.slice(0, 8).map((c) => (
            <a key={c.id} className="res-row" href={c.url} target="_blank" rel="noopener noreferrer">
              <Tile src={c.favicon} name={c.domain} size="sm" />
              <span className="truncate flex-1">{c.title}</span>
              <small style={{ color: "var(--text3)" }}>{c.domain}</small>
            </a>
          ))}
          {!data.contents.length && <p className="empty">还没有收藏。</p>}
        </div>
      </div>
    </>
  );
}

function CatEditor({ kind, title, cats, refresh }: { kind: CategoryKind; title: string; cats: CategoryDTO[]; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [edits, setEdits] = useState<Record<string, { name: string; icon: string }>>({});
  const call = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "失败", "!");
    }
  };
  return (
    <div className="panel">
      <div className="ph"><h3>{title}</h3><small>{cats.length} 个</small></div>
      <div className="grid gap-2 mt-3">
        {cats.map((c, i) => {
          const e = edits[c.id] ?? { name: c.name, icon: c.icon };
          const dirty = e.name !== c.name || e.icon !== c.icon;
          return (
            <div className="cat-row" key={c.id}>
              <Input className="icon-inp" value={e.icon} maxLength={4} aria-label="图标" onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, icon: ev.target.value } })} />
              <Input value={e.name} aria-label="名称" onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, name: ev.target.value } })} onKeyDown={(ev) => ev.key === "Enter" && dirty && call(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: e }), "已保存")} />
              <small style={{ color: "var(--text3)", minWidth: 28, textAlign: "right" }}>{c.count}</small>
              {dirty && <Button variant="primary" onClick={() => call(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: e }), "已保存")}>保存</Button>}
              <button className="icon-btn" aria-label="上移" disabled={i === 0} onClick={() => call(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: { move: "up" } }))}><UpIcon /></button>
              <button className="icon-btn" aria-label="下移" disabled={i === cats.length - 1} onClick={() => call(() => api(`/api/categories/${c.id}`, { method: "PATCH", body: { move: "down" } }))}><DownIcon /></button>
              <button className="icon-btn" aria-label="删除" onClick={() => confirm(`删除分类「${c.name}」？其中的 ${c.count} 项会变为未分类。`) && call(() => api(`/api/categories/${c.id}`, { method: "DELETE" }), "已删除")}><TrashIcon /></button>
            </div>
          );
        })}
        <form
          className="cat-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void call(() => api("/api/categories", { body: { kind, name, icon } }), "已添加").then(() => { setName(""); setIcon(""); });
          }}
        >
          <Input className="icon-inp" value={icon} maxLength={4} placeholder="✦" aria-label="新分类图标" onChange={(e) => setIcon(e.target.value)} />
          <Input value={name} placeholder="新分类名称" aria-label="新分类名称" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary">添加</Button>
        </form>
      </div>
    </div>
  );
}

function Items({ data, refresh }: { data: AppData; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "未分类";
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = [
      ...data.sites.map((x) => ({ id: x.id, kind: "site" as const, title: x.name, url: x.url, favicon: x.favicon, domain: x.url, categoryId: x.categoryId, tags: "", date: x.createdAt })),
      ...data.contents.map((x) => ({ id: x.id, kind: "content" as const, title: x.title, url: x.url, favicon: x.favicon, domain: x.domain, categoryId: x.categoryId, tags: x.tags.join(" · "), date: x.createdAt })),
    ];
    return all.filter((r) => !s || `${r.title} ${r.url} ${r.tags} ${catName(r.categoryId)}`.toLowerCase().includes(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q]);
  const move = async (kind: "site" | "content", id: string, categoryId: string) => {
    try {
      await api(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "PATCH", body: { categoryId: categoryId || null } });
      await refresh();
      toast("已移动");
    } catch (e) {
      toast(e instanceof Error ? e.message : "失败", "!");
    }
  };
  const del = async (kind: "site" | "content", id: string) => {
    if (!confirm("确定删除？")) return;
    await api(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "DELETE" });
    await refresh();
    toast("已删除");
  };
  return (
    <>
      <div className="a-h">
        <div><h2>书签管理</h2><p>{rows.length} 条</p></div>
        <label className="searchbox"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题、网址、标签、分类" aria-label="搜索" /></label>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>标题</th><th>类型</th><th>分类</th><th>标签</th><th>日期</th><th>操作</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind + r.id}>
                <td><a className="tt" href={r.url} target="_blank" rel="noopener noreferrer"><Tile src={r.favicon} name={r.title} size="xs" /><span>{r.title}</span></a></td>
                <td><span className="tag">{r.kind === "site" ? "站点" : "内容"}</span></td>
                <td>
                  <Select value={r.categoryId ?? ""} onChange={(e) => move(r.kind, r.id, e.target.value)} style={{ height: 34, minWidth: 110, fontSize: 13 }} aria-label="分类">
                    <option value="">未分类</option>
                    {data.categories.filter((c) => c.kind === r.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </td>
                <td style={{ color: "var(--text3)", fontSize: 12 }}>{r.tags}</td>
                <td style={{ color: "var(--text3)", fontSize: 12, whiteSpace: "nowrap" }}>{r.date.slice(0, 10)}</td>
                <td><div className="ops"><button aria-label="删除" onClick={() => del(r.kind, r.id)}><TrashIcon /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty" style={{ margin: 16 }}>没有匹配的书签</p>}
      </div>
    </>
  );
}

function Sys({ config }: { config: Config }) {
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/";
  };
  const yes = (b: boolean) => (b ? "开启" : "关闭");
  return (
    <div className="form" style={{ maxWidth: 720 }}>
      <div className="panel">
        <div className="ph"><h3>运行配置</h3><small>通过环境变量修改，重启生效</small></div>
        <div className="kv-list mt-3">
          <div><span>PUBLIC_MODE 访客可浏览导航</span><b>{yes(config.publicMode)}</b></div>
          <div><span>PUBLIC_MONITORS 访客可见监控</span><b>{yes(config.publicMonitors)}</b></div>
          <div><span>AI</span><b>{config.aiEnabled ? `${config.aiModel} @ ${config.aiBaseUrl}` : "未配置（规则模式）"}</b></div>
          <div><span>监控调度器</span><b>{yes(config.scheduler)}</b></div>
          <div><span>允许监控内网地址</span><b>{yes(config.allowPrivateMonitors)}</b></div>
          <div><span>监控数据保留</span><b>{config.retentionDays} 天</b></div>
        </div>
      </div>
      <div className="field">
        <div className="fl"><b>退出登录</b><small>清除当前浏览器的管理员会话</small></div>
        <Button variant="danger" onClick={logout}>退出登录</Button>
      </div>
    </div>
  );
}
