"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { AppData, CategoryDTO, CategoryKind } from "@/lib/types";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./ui/toast";
import { UIProvider, useDialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Select, type SelectOption } from "./ui/input";
import { SortItem, SortList } from "./ui/sortable";
import { ArrowLeftIcon, CATEGORY_ICONS, CATEGORY_ICON_LABELS, CatIcon, GripIcon, LEGACY_GLYPHS, TrashIcon } from "./Icons";
import { BrandOrb } from "./NoctaApp";
import { Tile } from "./Cards";
import { SettingsPanel } from "./SettingsPanel";

type Section = "dash" | "cats" | "items" | "sys";

export function AdminApp(props: { initial: AppData }) {
  return (
    <UIProvider>
      <Admin {...props} />
    </UIProvider>
  );
}

function Admin({ initial }: { initial: AppData }) {
  const [data, setData] = useState(initial);
  const [sec, setSec] = useState<Section>("dash");
  const refresh = useCallback(async () => setData(await api<AppData>("/api/data")), []);
  const setCatOrder = (kind: CategoryKind, ids: string[]) =>
    setData((d) => {
      const at = new Map(ids.map((id, i) => [id, i]));
      const mine = d.categories.filter((c) => c.kind === kind).map((c) => ({ ...c, sort: at.get(c.id) ?? c.sort })).sort((a, b) => a.sort - b.sort);
      return { ...d, categories: [...d.categories.filter((c) => c.kind !== kind), ...mine] };
    });
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
          <Link className="btn" href="/"><ArrowLeftIcon /> 返回首页</Link>
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
              <CatEditor kind="site" title="站点分类" cats={data.categories.filter((c) => c.kind === "site")} refresh={refresh} setCats={(ids) => setCatOrder("site", ids)} />
              <CatEditor kind="content" title="内容分类" cats={data.categories.filter((c) => c.kind === "content")} refresh={refresh} setCats={(ids) => setCatOrder("content", ids)} />
            </div>
          )}
          {sec === "items" && <Items data={data} refresh={refresh} />}
          {sec === "sys" && <SettingsPanel />}
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
              <Tile src={c.icon} name={c.domain} size="sm" />
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

const ICON_OPTIONS: SelectOption[] = Object.keys(CATEGORY_ICONS)
  .filter((k) => !["layers", "inbox", "arrow-left-right", "triangle-alert"].includes(k))
  .map((k) => ({ value: k, label: CATEGORY_ICON_LABELS[k] ?? k, icon: <CatIcon name={k} /> }));
const normIcon = (v: string) => (CATEGORY_ICONS[v] ? v : LEGACY_GLYPHS[v] ?? "folder");

function CatEditor({ kind, title, cats, refresh, setCats }: { kind: CategoryKind; title: string; cats: CategoryDTO[]; refresh: () => Promise<void>; setCats: (ids: string[]) => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [edits, setEdits] = useState<Record<string, { name: string; icon: string }>>({});
  const call = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "失败", "error");
      return false;
    }
  };
  const save = (id: string, e: { name: string; icon: string }) =>
    call(() => api(`/api/categories/${id}`, { method: "PATCH", body: e }), "已保存").then((ok) => ok && setEdits(({ [id]: _, ...rest }) => rest));
  const reorder = (ids: string[]) => {
    setCats(ids);
    void api("/api/reorder", { body: { kind: "category", ids } }).catch((e) => {
      toast(e instanceof Error ? e.message : "排序保存失败", "error");
      void refresh();
    });
  };
  return (
    <div className="panel">
      <div className="ph"><h3>{title}</h3><small>{cats.length} 个 · 按住左侧把手拖动排序</small></div>
      <ul className="cat-list mt-3">
        <SortList ids={cats.map((c) => c.id)} enabled axis="y" onReorder={reorder}>
          {cats.map((c) => {
            const e = edits[c.id] ?? { name: c.name, icon: normIcon(c.icon) };
            const dirty = e.name !== c.name || e.icon !== c.icon;
            return (
              <SortItem key={c.id} id={c.id} as="li">
                {(h, dragging) => (
                  <div className={cn("cat-row", dragging && "lifted")}>
                    <button type="button" className="grip" aria-label={`拖动排序：${c.name}`} {...h}><GripIcon /></button>
                    <Select size="sm" className="icon-sel" ariaLabel="图标" value={e.icon} options={ICON_OPTIONS} onChange={(v) => setEdits({ ...edits, [c.id]: { ...e, icon: v } })} />
                    <Input value={e.name} aria-label="名称" onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, name: ev.target.value } })} onKeyDown={(ev) => ev.key === "Enter" && dirty && save(c.id, e)} />
                    <small className="cat-n">{c.count}</small>
                    {dirty && <Button variant="primary" onClick={() => save(c.id, e)}>保存</Button>}
                    <button
                      className="icon-btn"
                      aria-label={`删除分类 ${c.name}`}
                      onClick={async () =>
                        (await dialog.confirm({ title: `删除分类「${c.name}」？`, message: c.count ? `其中的 ${c.count} 项会变为「未分类」，不会被删除。` : "这个分类是空的。", danger: true })) &&
                        call(() => api(`/api/categories/${c.id}`, { method: "DELETE" }), "已删除")
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </SortItem>
            );
          })}
        </SortList>
      </ul>
      <form
        className="cat-row add mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void call(() => api("/api/categories", { body: { kind, name, icon } }), "已添加").then((ok) => ok && (setName(""), setIcon("folder")));
        }}
      >
        <span className="grip ghost" aria-hidden="true" />
        <Select size="sm" className="icon-sel" ariaLabel="新分类图标" value={icon} options={ICON_OPTIONS} onChange={setIcon} />
        <Input value={name} placeholder="新分类名称" aria-label="新分类名称" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary">添加</Button>
      </form>
    </div>
  );
}

function Items({ data, refresh }: { data: AppData; refresh: () => Promise<void> }) {
  const toast = useToast();
  const dialog = useDialog();
  const [q, setQ] = useState("");
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "未分类";
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = [
      ...data.sites.map((x) => ({ id: x.id, kind: "site" as const, title: x.name, url: x.url, icon: x.icon, domain: x.url, categoryId: x.categoryId, tags: "", date: x.createdAt })),
      ...data.contents.map((x) => ({ id: x.id, kind: "content" as const, title: x.title, url: x.url, icon: x.icon, domain: x.domain, categoryId: x.categoryId, tags: x.tags.join(" · "), date: x.createdAt })),
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
      toast(e instanceof Error ? e.message : "失败", "error");
    }
  };
  const del = async (kind: "site" | "content", id: string, title: string) => {
    if (!(await dialog.confirm({ title: `删除${kind === "site" ? "站点" : "收藏"}「${title}」？`, message: "删除后无法恢复。", danger: true }))) return;
    try {
      await api(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "DELETE" });
      await refresh();
      toast("已删除");
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "error");
    }
  };
  const catOpts = (kind: "site" | "content"): SelectOption[] => [{ value: "", label: "未分类", icon: <CatIcon name="inbox" /> }, ...data.categories.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name, icon: <CatIcon name={c.icon} /> }))];
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
                <td><a className="tt" href={r.url} target="_blank" rel="noopener noreferrer"><Tile src={r.icon} name={r.title} size="xs" /><span>{r.title}</span></a></td>
                <td><span className="tag">{r.kind === "site" ? "站点" : "内容"}</span></td>
                <td>
                  <Select size="sm" ariaLabel="分类" value={r.categoryId ?? ""} onChange={(v) => move(r.kind, r.id, v)} options={catOpts(r.kind)} />
                </td>
                <td style={{ color: "var(--text3)", fontSize: 12 }}>{r.tags}</td>
                <td style={{ color: "var(--text3)", fontSize: 12, whiteSpace: "nowrap" }}>{r.date.slice(0, 10)}</td>
                <td><div className="ops"><button aria-label={`删除 ${r.title}`} onClick={() => del(r.kind, r.id, r.title)}><TrashIcon /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty" style={{ margin: 16 }}>没有匹配的书签</p>}
      </div>
    </>
  );
}
