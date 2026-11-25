"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppData, CategoryDTO, ContentDTO, SiteDTO } from "@/lib/types";
import { api, copyText } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { UIProvider, useDialog } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { ContextMenu, type MenuItem, type MenuState } from "./ui/context-menu";
import { SortItem, SortList, type HandleProps } from "./ui/sortable";
import { ContentCard, LinkDot, LinkLatency, MonitorCard, SiteCard } from "./Cards";
import { Drawer, type DrawerTarget } from "./Drawer";
import { CommandPalette } from "./CommandPalette";
import { AddDialog } from "./AddDialog";
import { Assistant } from "./Assistant";
import { ArrowUpIcon, CatIcon, CopyIcon, EditIcon, ExternalIcon, LinkIcon, MoveIcon, OpenIcon, PinIcon, PinOffIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from "./Icons";
import { probeAll, siteLinks } from "@/lib/linkprobe";

type Tab = "sites" | "contents" | "monitors";
type RailItem = { id: string; name: string; icon: string; n: number; sortable?: boolean };

export function BrandOrb() {
  return (
    <span className="orb">
      <i />
    </span>
  );
}

export function NoctaApp({ initial }: { initial: AppData }) {
  return (
    <UIProvider>
      <App initial={initial} />
    </UIProvider>
  );
}

const shortUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** keep the relative order of the items outside `subset` and put the subset's new order into its old slots */
function mergeOrder(all: string[], subsetNew: string[]) {
  const set = new Set(subsetNew);
  let k = 0;
  return all.map((id) => (set.has(id) ? subsetNew[k++] : id));
}
function applyOrder<T extends { id: string; sort: number; pinned?: boolean }>(list: T[], ids: string[]) {
  const at = new Map(ids.map((id, i) => [id, i]));
  return list
    .map((x) => ({ ...x, sort: at.get(x.id) ?? x.sort }))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.sort - b.sort);
}

/** masonry in reading order: items go round-robin into as many columns as fit (no empty columns on wide screens) */
function Masonry({ count, min = 290, gap = 16, children }: { count: number; min?: number; gap?: number; children: (i: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setCols(Math.max(1, Math.floor((el.clientWidth + gap) / (min + gap))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min, gap]);
  return (
    <div ref={ref} className="masonry" style={{ gap }}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} className="mcol" style={{ gap }}>
          {Array.from({ length: Math.ceil((count - c) / cols) }, (_, r) => children(r * cols + c))}
        </div>
      ))}
    </div>
  );
}

/**
 * site grid (item 12): normal auto-fill grid; when there are fewer cards than columns, the row keeps the
 * same card size and is centred instead of leaving empty columns on the right.
 */
function SiteGrid({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [few, setFew] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const narrow = matchMedia("(max-width:640px)").matches;
      const min = narrow ? 88 : 118, gap = narrow ? 10 : 14;
      const w = el.clientWidth;
      const cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
      setFew(count < cols ? Math.floor((w - (cols - 1) * gap) / cols) : null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  return (
    <div ref={ref} className="sites" style={few ? { gridTemplateColumns: `repeat(${count},${few}px)`, justifyContent: "center" } : undefined}>
      {children}
    </div>
  );
}

function App({ initial }: { initial: AppData }) {
  const toast = useToast();
  const dialog = useDialog();
  const [data, setData] = useState<AppData>(initial);
  const [tab, setTab] = useState<Tab>("sites");
  const [cat, setCat] = useState<Record<Tab, string>>({ sites: "all", contents: "all", monitors: "all" });
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const [palette, setPalette] = useState(false);
  const [adding, setAdding] = useState(false);
  const [chat, setChat] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [menu, setMenu] = useState<MenuState>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const admin = data.admin;

  const refresh = useCallback(async () => {
    try {
      setData(await api<AppData>("/api/data"));
    } catch {
      /* keep the last good data */
    }
  }, []);

  // polling: monitors every 15s while that tab is visible, everything else every 60s
  useEffect(() => {
    const ms = tab === "monitors" ? 15000 : 60000;
    const t = setInterval(() => !document.hidden && !document.body.classList.contains("is-sorting") && refresh(), ms);
    const onVis = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab, refresh]);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    const onScroll = () => setShowTop(scrollY > 400);
    addEventListener("keydown", onKey);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  // multi-link sites (item 13): when the browser is idle, check which links answer from this network
  const linkKey = data.sites.filter((s) => s.backups.length).map((s) => siteLinks(s).map((l) => l.url).join(" ")).join("\n");
  useEffect(() => {
    if (!linkKey) return;
    const urls = linkKey.split(/\s+/).filter(Boolean);
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(() => void probeAll(urls), { timeout: 4000 }) : window.setTimeout(() => void probeAll(urls), 1500);
    const again = window.setInterval(() => !document.hidden && void probeAll(urls), 5 * 60_000 + 1000);
    return () => {
      (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id);
      clearTimeout(id);
      clearInterval(again);
    };
  }, [linkKey]);

  useEffect(() => {
    document.body.classList.toggle("x-chat-open", chat);
    document.body.classList.toggle("x-drawer-open", !!drawer);
  }, [chat, drawer]);

  const openItem = useCallback((type: "content" | "monitor", id: string) => {
    setTab(type === "content" ? "contents" : "monitors");
    setDrawer({ type, id });
  }, []);

  const siteCats = data.categories.filter((c) => c.kind === "site");
  const contentCats = data.categories.filter((c) => c.kind === "content");

  const rail: RailItem[] = useMemo(() => {
    const mk = (cats: CategoryDTO[], total: number, uncategorized: number): RailItem[] => [
      { id: "all", name: "全部", icon: "layers", n: total },
      ...cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, n: c.count, sortable: true })),
      ...(uncategorized ? [{ id: "none", name: "未分类", icon: "inbox", n: uncategorized }] : []),
    ];
    if (tab === "sites") return mk(siteCats, data.sites.length, data.sites.filter((s) => !s.categoryId).length);
    if (tab === "contents") return mk(contentCats, data.contents.length, data.contents.filter((s) => !s.categoryId).length);
    const ms = data.monitors;
    return [
      { id: "all", name: "全部", icon: "layers", n: ms.length },
      { id: "server", name: "服务器", icon: "server", n: ms.filter((m) => m.kind === "server").length },
      { id: "http", name: "API · 服务", icon: "globe", n: ms.filter((m) => m.kind === "http").length },
      { id: "bad", name: "异常", icon: "triangle-alert", n: ms.filter((m) => m.status === "down" || m.status === "warn").length },
    ];
  }, [tab, data, siteCats, contentCats]);

  const current = cat[tab];
  const byCat = <T extends { categoryId: string | null }>(list: T[]) => (current === "all" ? list : current === "none" ? list.filter((x) => !x.categoryId) : list.filter((x) => x.categoryId === current));
  const sites = byCat(data.sites);
  const contents = byCat(data.contents);
  const monitors = current === "all" ? data.monitors : current === "bad" ? data.monitors.filter((m) => m.status === "down" || m.status === "warn") : data.monitors.filter((m) => m.kind === current);

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "sites", label: "站点导航", n: data.sites.length },
    { id: "contents", label: "收藏内容", n: data.contents.length },
    ...(data.showMonitors ? [{ id: "monitors" as Tab, label: "服务监控", n: data.monitors.length }] : []),
  ];
  const sum = {
    up: data.monitors.filter((m) => m.status === "up").length,
    warn: data.monitors.filter((m) => m.status === "warn").length,
    down: data.monitors.filter((m) => m.status === "down").length,
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    const el = document.getElementById("tabs");
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth" });
  };
  const pickCat = (id: string) => {
    setCat((c) => ({ ...c, [tab]: id }));
    const el = document.getElementById("content-top");
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth" });
  };

  /* ---------- drag to reorder (admin): optimistic, then persisted ---------- */
  const persist = async (kind: "site" | "content" | "category", ids: string[]) => {
    try {
      await api("/api/reorder", { body: { kind, ids } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "排序保存失败", "error");
      await refresh();
    }
  };
  const reorderSites = (subset: string[]) => {
    const ids = mergeOrder(data.sites.map((x) => x.id), subset);
    setData((d) => ({ ...d, sites: applyOrder(d.sites, ids) }));
    void persist("site", ids);
  };
  const reorderContents = (subset: string[]) => {
    const ids = mergeOrder(data.contents.map((x) => x.id), subset);
    setData((d) => ({ ...d, contents: applyOrder(d.contents, ids) }));
    void persist("content", ids);
  };
  const reorderCats = (kind: "site" | "content", ids: string[]) => {
    setData((d) => {
      const mine = applyOrder(d.categories.filter((c) => c.kind === kind), ids);
      const other = d.categories.filter((c) => c.kind !== kind);
      return { ...d, categories: kind === "site" ? [...other, ...mine] : [...mine, ...other] };
    });
    void persist("category", ids);
  };

  /* ---------- context menu ---------- */
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "操作失败", "error");
    }
  };
  const copyLink = (url: string) => copyText(url).then((ok) => toast(ok ? "链接已复制" : "复制失败", ok ? "ok" : "error"));
  const moveItems = (kind: "site" | "content", id: string, currentCat: string | null): MenuItem => ({
    key: "move",
    label: "移动到分类",
    icon: <MoveIcon />,
    submenu: {
      title: "移动到分类",
      items: [
        ...(kind === "site" ? siteCats : contentCats).map((c) => ({
          key: c.id,
          label: c.name,
          icon: <CatIcon name={c.icon} size={15} />,
          checked: currentCat === c.id,
          onSelect: () => currentCat !== c.id && act(() => api(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "PATCH", body: { categoryId: c.id } }), `已移动到「${c.name}」`),
        })),
        { key: "none", label: "未分类", icon: <CatIcon name="inbox" size={15} />, checked: !currentCat, onSelect: () => currentCat && act(() => api(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "PATCH", body: { categoryId: null } }), "已移到未分类") },
      ],
    },
  });
  const addBackup = async (s: SiteDTO) => {
    const url = await dialog.prompt({ title: `给「${s.name}」添加备用链接`, placeholder: "https://", confirmText: "添加", validate: (v) => (v.trim() ? null : "请输入链接") });
    if (url) await act(() => api(`/api/sites/${s.id}/links`, { body: { url } }), "已添加备用链接");
  };
  const siteMenu = (s: SiteDTO) => (x: number, y: number) => {
    const links = siteLinks(s);
    if (links.length > 1) void probeAll(links.map((l) => l.url));
    const items: MenuItem[] = [
      links.length > 1
        ? {
            key: "open",
            label: "打开",
            icon: <OpenIcon />,
            submenu: {
              title: "打开",
              items: links.map((l, i) => ({
                key: `l${i}`,
                label: l.note || shortUrl(l.url),
                icon: <LinkDot url={l.url} />,
                hint: <LinkLatency url={l.url} />,
                onSelect: () => window.open(l.url, "_blank", "noopener"),
              })),
            },
          }
        : { key: "open", label: "打开", icon: <OpenIcon />, onSelect: () => location.assign(s.url) },
      { key: "tab", label: "在新标签页打开", icon: <ExternalIcon />, onSelect: () => window.open(s.url, "_blank", "noopener") },
      { key: "copy", label: "复制链接", icon: <CopyIcon />, onSelect: () => copyLink(s.url) },
    ];
    if (admin)
      items.push(
        { sep: true, key: "s1" },
        { key: "edit", label: "编辑", icon: <EditIcon />, onSelect: () => setDrawer({ type: "site", id: s.id, edit: true }) },
        { key: "pin", label: s.pinned ? "取消置顶" : "置顶", icon: s.pinned ? <PinOffIcon /> : <PinIcon size={15} />, onSelect: () => act(() => api(`/api/sites/${s.id}`, { method: "PATCH", body: { pinned: !s.pinned } }), s.pinned ? "已取消置顶" : "已置顶") },
        moveItems("site", s.id, s.categoryId),
        { key: "backup", label: "添加备用链接", icon: <LinkIcon />, onSelect: () => void addBackup(s) },
        { key: "icon", label: "重新抓取图标", icon: <RefreshIcon />, onSelect: () => act(() => api(`/api/icon/site/${s.id}`, { body: { refetch: true } }), "已重新抓取图标") },
        { sep: true, key: "s2" },
        { key: "del", label: "删除", icon: <TrashIcon />, danger: true, onSelect: async () => (await dialog.confirm({ title: `删除站点「${s.name}」？`, message: "删除后无法恢复。", danger: true })) && act(() => api(`/api/sites/${s.id}`, { method: "DELETE" }), "已删除") },
      );
    setMenu({ x, y, title: s.name, items });
  };
  const contentMenu = (c: ContentDTO) => (x: number, y: number) => {
    const items: MenuItem[] = [
      { key: "open", label: "打开原文", icon: <OpenIcon />, onSelect: () => location.assign(c.url) },
      { key: "tab", label: "在新标签页打开", icon: <ExternalIcon />, onSelect: () => window.open(c.url, "_blank", "noopener") },
      { key: "copy", label: "复制链接", icon: <CopyIcon />, onSelect: () => copyLink(c.url) },
    ];
    if (admin)
      items.push(
        { sep: true, key: "s1" },
        { key: "edit", label: "编辑", icon: <EditIcon />, onSelect: () => setDrawer({ type: "content", id: c.id, edit: true }) },
        { key: "pin", label: c.pinned ? "取消置顶" : "置顶", icon: c.pinned ? <PinOffIcon /> : <PinIcon size={15} />, onSelect: () => act(() => api(`/api/contents/${c.id}`, { method: "PATCH", body: { pinned: !c.pinned } }), c.pinned ? "已取消置顶" : "已置顶") },
        moveItems("content", c.id, c.categoryId),
        { key: "icon", label: "重新抓取图标", icon: <RefreshIcon />, onSelect: () => act(() => api(`/api/icon/content/${c.id}`, { body: { refetch: true } }), "已重新抓取图标") },
        { sep: true, key: "s2" },
        { key: "del", label: "删除", icon: <TrashIcon />, danger: true, onSelect: async () => (await dialog.confirm({ title: "删除这条收藏？", message: c.title, danger: true })) && act(() => api(`/api/contents/${c.id}`, { method: "DELETE" }), "已删除") },
      );
    setMenu({ x, y, title: c.title, items });
  };

  const railCats = rail.filter((r) => r.sortable);
  const railBtn = (r: RailItem, h: HandleProps = {}) => (
    <button {...h} key={r.id} className={cn("rail-item", current === r.id && "on")} onClick={() => pickCat(r.id)} aria-current={current === r.id}>
      {current === r.id && <motion.span layoutId={`rail-${tab}`} className="rail-hl" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
      <span className="ri" aria-hidden="true"><CatIcon name={r.icon} /></span>
      <span className="rn">{r.name}</span>
      <span className="n">{r.n}</span>
    </button>
  );

  return (
    <>
      <Starfield />
      <header className="topbar glass">
        <Link className="brand" href="/" aria-label="夜航书签 首页">
          <BrandOrb />
          <span>夜航书签</span>
          <span className="brand-tag">Nocta</span>
        </Link>
        <button className="search-pill" onClick={() => setPalette(true)} aria-label="搜索">
          <SearchIcon size={16} />
          <span className="sp-l">搜索站点、收藏和监控…</span>
          <span className="sp-s">搜索</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <div className="actions">
          <ThemeToggle />
          {admin && (
            <button className="add-btn" onClick={() => setAdding(true)} aria-label="添加">
              <span><PlusIcon size={15} /> <em>添加</em></span>
            </button>
          )}
          <Link className="avatar-btn" href={admin ? "/admin" : "/login"} aria-label={admin ? "夜航后台" : "登录"}>
            <span className="avatar">夜</span>
            <span>{admin ? "后台" : "登录"}</span>
          </Link>
        </div>
      </header>

      <main className="app">
        <div className="x-tabbar">
          <div className="x-tabs" role="tablist" aria-label="切换视图" id="tabs" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)`, width: `min(${tabs.length * 200}px,100%)` }}>
            {tabs.map((t) => (
              <button key={t.id} className="x-tab" role="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => switchTab(t.id)}>
                {tab === t.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                {t.label} <span className="x-tab__n">{t.n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="layout" id="content-top">
          <aside className="rail glass" aria-label="分类">
            <p className="rail-title">{tab === "sites" ? "站点分类" : tab === "contents" ? "内容分类" : "监控筛选"}</p>
            <nav className="rail-list">
              {rail.filter((r) => !r.sortable && r.id === "all").map((r) => railBtn(r))}
              <SortList key={tab} ids={railCats.map((r) => r.id)} enabled={admin && tab !== "monitors"} onReorder={(ids) => reorderCats(tab === "sites" ? "site" : "content", ids)} overlay={(id) => { const r = railCats.find((x) => x.id === id); return r ? <div className="rail-sort">{railBtn(r)}</div> : null; }}>
                {railCats.map((r) => (
                  <SortItem key={r.id} id={r.id} className="rail-sort">
                    {(h) => railBtn(r, h)}
                  </SortItem>
                ))}
              </SortList>
              {rail.filter((r) => !r.sortable && r.id !== "all").map((r) => railBtn(r))}
            </nav>
          </aside>

          <div className="content" style={{ minWidth: 0 }}>
            {tab === "sites" && (
              <section className="block" role="tabpanel">
                {sites.length ? (
                  <SortList ids={sites.map((s) => s.id)} enabled={admin} onReorder={reorderSites} overlay={(id) => { const s = sites.find((x) => x.id === id); return s ? <SiteCard site={s} index={0} overlay /> : null; }}>
                    <SiteGrid count={sites.length}>
                      {sites.map((s, i) => (
                        <SortItem key={s.id} id={s.id}>
                          {(h) => <SiteCard site={s} index={i} handle={h} onMenu={siteMenu(s)} failover={data.siteFailover} />}
                        </SortItem>
                      ))}
                    </SiteGrid>
                  </SortList>
                ) : (
                  <p className="empty">还没有站点</p>
                )}
              </section>
            )}
            {tab === "contents" && (
              <section className="block" role="tabpanel">
                {contents.length ? (
                  <SortList ids={contents.map((c) => c.id)} enabled={admin} onReorder={reorderContents} overlay={(id) => { const c = contents.find((x) => x.id === id); return c ? <ContentCard c={c} index={0} overlay onOpen={() => {}} /> : null; }}>
                    <Masonry count={contents.length}>
                      {(i) => {
                        const c = contents[i];
                        return (
                          <SortItem key={c.id} id={c.id}>
                            {(h) => <ContentCard c={c} index={i} handle={h} onMenu={contentMenu(c)} onOpen={() => setDrawer({ type: "content", id: c.id })} />}
                          </SortItem>
                        );
                      }}
                    </Masonry>
                  </SortList>
                ) : (
                  <p className="empty">还没有收藏</p>
                )}
              </section>
            )}
            {tab === "monitors" && (
              <section className="block" role="tabpanel">
                <p className="x-msum">
                  <span><i className="x-sd" />在线 {sum.up}</span>
                  <span><i className="x-sd warn" />告警 {sum.warn}</span>
                  <span><i className="x-sd bad" />离线 {sum.down}</span>
                </p>
                {monitors.length ? (
                  <div className="x-mgrid">
                    {monitors.map((m, i) => (
                      <MonitorCard key={m.id} m={m} index={i} onOpen={() => setDrawer({ type: "monitor", id: m.id })} />
                    ))}
                  </div>
                ) : (
                  <p className="empty">{current === "bad" ? "一切正常" : "还没有监控"}</p>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      <button className={cn("x-top", showTop && "on")} onClick={() => scrollTo({ top: 0, behavior: "smooth" })} aria-label="回到顶部" tabIndex={showTop ? 0 : -1}>
        <ArrowUpIcon />
      </button>

      <ContextMenu state={menu} onClose={closeMenu} />
      <Drawer target={drawer} data={data} onClose={() => setDrawer(null)} refresh={refresh} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} data={data} onOpenItem={openItem} />
      {admin && <AddDialog open={adding} onClose={() => setAdding(false)} refresh={refresh} aiEnabled={data.aiEnabled} />}
      <Assistant open={chat} setOpen={setChat} admin={admin} aiEnabled={data.aiEnabled} refresh={refresh} onOpenItem={openItem} />
    </>
  );
}
