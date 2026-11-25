"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminData, AdminRow, CategoryDTO, CategoryKind } from "@/lib/types";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./ui/toast";
import { UIProvider, useDialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Select, SelectTrigger, SharedSelect, type SelectOption } from "./ui/input";
import { useViewWindow } from "./ui/virtual";
import { SortItem, SortList } from "./ui/sortable";
import { ArrowLeftIcon, CATEGORY_ICONS, CATEGORY_ICON_LABELS, CatIcon, GripIcon, LEGACY_GLYPHS, TrashIcon } from "./Icons";
import { BrandOrb } from "./NoctaApp";
import { Tile } from "./Cards";
import { SettingsPanel, isSettingTab, type SettingTab } from "./SettingsPanel";

type Section = "dash" | "cats" | "items" | "sys";

const SECTIONS = ["dash", "cats", "items", "sys"] as const;
export type AdminView = { sec?: string; tab?: string };

export function AdminApp(props: { initial: AdminData; view?: AdminView }) {
  return (
    <UIProvider>
      <Admin {...props} />
    </UIProvider>
  );
}

/** admin section + settings tab live in the URL (?sec=cats, ?tab=ai) so reload / share keeps them */
function Admin({ initial, view }: { initial: AdminData; view?: AdminView }) {
  const [data, setData] = useState(initial);
  const [sec, setSecState] = useState<Section>(isSettingTab(view?.tab) ? "sys" : (SECTIONS as readonly string[]).includes(view?.sec ?? "") ? (view!.sec as Section) : "dash");
  const [tab, setTabState] = useState<SettingTab>(isSettingTab(view?.tab) ? view!.tab : "access");
  const syncUrl = (s: Section, t: SettingTab) => {
    const q = s === "sys" ? `?tab=${t}` : s === "dash" ? "" : `?sec=${s}`;
    history.replaceState(history.state, "", location.pathname + q);
  };
  const setSec = (s: Section) => {
    setSecState(s);
    syncUrl(s, tab);
  };
  const setTab = (t: SettingTab) => {
    setTabState(t);
    syncUrl("sys", t);
  };
  const refresh = useCallback(async () => setData(await api<AdminData>("/api/admin/data")), []);
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
          {sec === "sys" && <SettingsPanel tab={tab} onTab={setTab} />}
        </motion.div>
      </div>
    </>
  );
}

function Dash({ data }: { data: AdminData }) {
  const st = data.stats;
  const tiles = [
    { label: "站点", v: st.sites, d: `${data.categories.filter((c) => c.kind === "site").length} 个分类` },
    { label: "收藏内容", v: st.contents, d: `本周新增 ${st.weekNew}` },
    { label: "未读", v: st.unread, d: "收藏后还没打开" },
    { label: "监控", v: st.monitors, d: `${st.bad} 个异常`, bad: st.down > 0 },
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
          {data.recent.map((c) => (
            <a key={c.id} className="res-row" href={c.url} target="_blank" rel="noopener noreferrer">
              <Tile src={c.icon} name={c.domain} size="sm" />
              <span className="truncate flex-1">{c.title}</span>
              <small style={{ color: "var(--text3)" }}>{c.domain}</small>
            </a>
          ))}
          {!data.recent.length && <p className="empty">还没有收藏。</p>}
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
      <div className="ph"><h3>{title}</h3><small>{cats.length} 个</small></div>
      <ul className="cat-list mt-3">
        <SortList ids={cats.map((c) => c.id)} enabled axis="y" onReorder={reorder} overlay={(id) => { const c = cats.find((x) => x.id === id); return c ? (
          <div className="cat-row">
            <span className="grip"><GripIcon /></span>
            <Select size="sm" className="icon-sel" ariaLabel="图标" value={(edits[c.id] ?? { icon: normIcon(c.icon) }).icon} options={ICON_OPTIONS} onChange={() => {}} />
            <Input value={(edits[c.id] ?? { name: c.name }).name} aria-label="名称" readOnly />
            <small className="cat-n">{c.count}</small>
            <span className="icon-btn"><TrashIcon /></span>
          </div>
        ) : null; }}>
          {cats.map((c) => {
            const e = edits[c.id] ?? { name: c.name, icon: normIcon(c.icon) };
            const dirty = e.name !== c.name || e.icon !== c.icon;
            return (
              <SortItem key={c.id} id={c.id} as="li">
                {(h) => (
                  <div className="cat-row">
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

const PAGE = 100;
type SortKey = "default" | "title" | "kind" | "category" | "date";

/**
 * 书签管理 (v0.4.0): searched, sorted and paged by the server; only the rows near the viewport are rendered
 * (pages are fetched as they scroll into view), and one dropdown is shared by all rows.
 */
function Items({ data, refresh }: { data: AdminData; refresh: () => Promise<void> }) {
  const toast = useToast();
  const dialog = useDialog();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "default", dir: "asc" });
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState<Map<number, AdminRow[]>>(new Map());
  const [gen, setGen] = useState(0);
  const genRef = useRef(0);
  genRef.current = gen;
  const inflight = useRef(new Set<string>());
  const [rowH, setRowH] = useState(53);
  const body = useRef<HTMLTableSectionElement>(null);
  const [pick, setPick] = useState<{ el: HTMLElement; row: AdminRow } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  // new query / order → start over
  useEffect(() => {
    setPages(new Map());
    inflight.current.clear();
    setGen((g) => g + 1);
  }, [dq, sort]);

  const fetchPage = useCallback(
    async (p: number, g: number) => {
      const key = `${g}:${p}`;
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      try {
        const r = await api<{ rows: AdminRow[]; total: number }>(`/api/admin/items?q=${encodeURIComponent(dq)}&sort=${sort.key}&dir=${sort.dir}&offset=${p * PAGE}&limit=${PAGE}`);
        if (genRef.current === g) {
          setTotal(r.total);
          setPages((m) => new Map(m).set(p, r.rows));
        }
      } catch (e) {
        inflight.current.delete(key);
        toast(e instanceof Error ? e.message : "加载失败", "error");
      }
    },
    [dq, sort, toast],
  );

  const win = useViewWindow(body, rowH * 10);
  const n = total ?? 0;
  const over = typeof window === "undefined" ? 0 : innerHeight;
  const i0 = total == null || !win ? 0 : Math.max(0, Math.floor((win[0] - over) / rowH));
  const i1 = total == null ? 0 : !win ? Math.min(n, 40) : Math.min(n, Math.ceil((win[1] + over) / rowH));
  useEffect(() => {
    if (total == null) return void fetchPage(0, gen);
    for (let p = Math.floor(i0 / PAGE); p <= Math.floor(Math.max(i0, i1 - 1) / PAGE); p++) if (!pages.has(p)) void fetchPage(p, gen);
  }, [i0, i1, total, pages, gen, fetchPage]);
  // row pitch: measured once from the first rendered rows (and again when the width changes). Rows can differ a
  // little (wrapping on narrow screens); re-measuring on every render would chase that and never settle.
  const measuredW = useRef(0);
  useEffect(() => {
    const tb = body.current;
    if (!tb) return;
    const w = tb.getBoundingClientRect().width;
    if (measuredW.current && Math.abs(measuredW.current - w) < 1) return;
    const trs = [...tb.querySelectorAll("tr[data-row]")].slice(0, 20) as HTMLElement[];
    if (trs.length < Math.min(5, total ?? 0)) return;
    measuredW.current = w;
    const h = trs.reduce((a, tr) => a + tr.getBoundingClientRect().height, 0) / trs.length;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
  });

  const reload = () => {
    setPages(new Map());
    inflight.current.clear();
    setGen((g) => g + 1);
    void refresh();
  };
  const patchRow = (id: string, f: (r: AdminRow) => AdminRow) => setPages((m) => new Map([...m].map(([k, rows]) => [k, rows.map((r) => (r.id === id ? f(r) : r))])));
  const move = async (r: AdminRow, categoryId: string) => {
    try {
      await api(`/api/${r.kind === "site" ? "sites" : "contents"}/${r.id}`, { method: "PATCH", body: { categoryId: categoryId || null } });
      if (sort.key === "category" || dq) reload();
      else {
        patchRow(r.id, (x) => ({ ...x, categoryId: categoryId || null }));
        void refresh();
      }
      toast("已移动");
    } catch (e) {
      toast(e instanceof Error ? e.message : "失败", "error");
    }
  };
  const del = async (r: AdminRow) => {
    if (!(await dialog.confirm({ title: `删除${r.kind === "site" ? "站点" : "收藏"}「${r.title}」？`, message: "删除后无法恢复。", danger: true }))) return;
    try {
      await api(`/api/${r.kind === "site" ? "sites" : "contents"}/${r.id}`, { method: "DELETE" });
      reload();
      toast("已删除");
    } catch (e) {
      toast(e instanceof Error ? e.message : "删除失败", "error");
    }
  };
  const catOpts = useMemo(() => {
    const mk = (kind: "site" | "content"): SelectOption[] => [{ value: "", label: "未分类", icon: <CatIcon name="inbox" /> }, ...data.categories.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name, icon: <CatIcon name={c.icon} /> }))];
    return { site: mk("site"), content: mk("content") };
  }, [data.categories]);

  const th = (key: SortKey, label: string) => {
    const on = sort.key === key;
    return (
      <th aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setSort(on ? (sort.dir === "asc" ? { key, dir: "desc" } : { key: "default", dir: "asc" }) : { key, dir: key === "date" ? "desc" : "asc" })}>
        {label}
        {on ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };
  const rows: (AdminRow | null)[] = [];
  for (let i = i0; i < i1; i++) rows.push(pages.get(Math.floor(i / PAGE))?.[i % PAGE] ?? null);
  return (
    <>
      <div className="a-h">
        <div><h2>书签管理</h2><p>{total ?? "…"} 条</p></div>
        <label className="searchbox"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题、网址、标签、分类" aria-label="搜索" /></label>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>{th("title", "标题")}{th("kind", "类型")}{th("category", "分类")}<th>标签</th>{th("date", "日期")}<th>操作</th></tr>
          </thead>
          <tbody ref={body}>
            {i0 > 0 && <tr aria-hidden="true" style={{ height: i0 * rowH }}><td colSpan={6} style={{ padding: 0, border: 0 }} /></tr>}
            {rows.map((r, k) =>
              r ? (
                <tr key={r.kind + r.id} data-row>
                  <td><a className="tt" href={r.url} target="_blank" rel="noopener noreferrer"><Tile src={r.icon} name={r.title} size="xs" /><span>{r.title}</span></a></td>
                  <td><span className="tag">{r.kind === "site" ? "站点" : "内容"}</span></td>
                  <td>
                    <SelectTrigger size="sm" ariaLabel="分类" value={r.categoryId ?? ""} options={catOpts[r.kind]} open={pick?.row.id === r.id} onOpen={(el) => setPick(pick?.row.id === r.id ? null : { el, row: r })} />
                  </td>
                  <td style={{ color: "var(--text3)", fontSize: 12 }}>{r.tags}</td>
                  <td style={{ color: "var(--text3)", fontSize: 12, whiteSpace: "nowrap" }}>{r.date.slice(0, 10)}</td>
                  <td><div className="ops"><button aria-label={`删除 ${r.title}`} onClick={() => del(r)}><TrashIcon /></button></div></td>
                </tr>
              ) : (
                <tr key={`ph${i0 + k}`} aria-hidden="true" style={{ height: rowH }}><td colSpan={6} /></tr>
              ),
            )}
            {i1 < n && <tr aria-hidden="true" style={{ height: (n - i1) * rowH }}><td colSpan={6} style={{ padding: 0, border: 0 }} /></tr>}
          </tbody>
        </table>
        {total === 0 && <p className="empty" style={{ margin: 16 }}>没有匹配的书签</p>}
      </div>
      <SharedSelect anchor={pick?.el ?? null} value={pick?.row.categoryId ?? ""} options={pick ? catOpts[pick.row.kind] : []} ariaLabel="分类" onPick={(v) => pick && move(pick.row, v)} onClose={() => setPick(null)} />
    </>
  );
}
