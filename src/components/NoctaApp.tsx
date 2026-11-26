"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, CategoryDTO, ContentDTO, MonitorDTO, SiteDTO, Versions } from "@/lib/types";
import { api, apiZ, copyText } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { UIProvider, useDialog } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { ContextMenu, type MenuItem, type MenuState } from "./ui/context-menu";
import { SortItem, SortList, type HandleProps } from "./ui/sortable";
import { ContentCard, LinkDot, LinkLatency, MonitorCard, SiteCard } from "./Cards";
import { Drawer, type DrawerTarget } from "./Drawer";
import { CommandPalette, prefetchSearch } from "./CommandPalette";
import { AddDialog } from "./AddDialog";
import { Assistant } from "./Assistant";
import { ArrowUpIcon, CatIcon, CopyIcon, EditIcon, ExternalIcon, LinkIcon, MoveIcon, OpenIcon, PinIcon, PinOffIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from "./Icons";
import { probeAll, siteLinks } from "@/lib/linkprobe";
import { VirtualGrid, VirtualMasonry, useEntrance } from "./ui/virtual";

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

/** list order of the server: pinned first, then `sort`, then age (sites oldest first, contents newest first) */
const cmpSite = (a: SiteDTO, b: SiteDTO) => Number(b.pinned) - Number(a.pinned) || a.sort - b.sort || a.createdAt.localeCompare(b.createdAt);
const cmpContent = (a: ContentDTO, b: ContentDTO) => Number(b.pinned) - Number(a.pinned) || a.sort - b.sort || b.createdAt.localeCompare(a.createdAt);
function upsert<T extends { id: string }>(list: T[], item: T, cmp: (a: T, b: T) => number) {
  const out = list.filter((x) => x.id !== item.id);
  out.push(item);
  return out.sort(cmp);
}

/**
 * optimistic single move (v0.4.0): put `id` right after `prev` (or right before `next`) in the full list —
 * the same rule /api/reorder applies on the server. Neighbours on the other side of the pinned boundary are ignored.
 */
function moveAfter<T extends { id: string; sort: number; pinned: boolean }>(list: T[], id: string, prev: string | null, next: string | null) {
  const me = list.find((x) => x.id === id);
  if (!me) return list;
  const others = list.filter((x) => x.id !== id);
  const ok = (n: string | null) => (n ? others.find((x) => x.id === n && x.pinned === me.pinned) : undefined);
  const a = ok(prev), z = a ? undefined : ok(next);
  if (!a && !z) return list;
  const pos = a ? others.indexOf(a) + 1 : others.indexOf(z!);
  const lo = others[pos - 1]?.pinned === me.pinned ? others[pos - 1].sort : undefined;
  const hi = others[pos]?.pinned === me.pinned ? others[pos].sort : undefined;
  const sort = lo != null && hi != null ? (lo + hi) / 2 : lo != null ? lo + 1024 : hi != null ? hi - 1024 : me.sort;
  others.splice(pos, 0, { ...me, sort });
  return others;
}

type MenuFor<T> = (item: T, x: number, y: number) => void;

/** the site grid of one category; remounted per category so its first cards play the entrance */
function SitesBlock({ sites, total, sortable, onReorder, menu, failover }: { sites: SiteDTO[]; total: number; sortable: boolean; onReorder: (ids: string[], moved: { id: string }) => void; menu: MenuFor<SiteDTO>; failover: boolean }) {
  const ent = useEntrance();
  const ids = useMemo(() => sites.map((s) => s.id), [sites]);
  const overlay = useCallback((id: string) => {
    const s = sites.find((x) => x.id === id);
    return s ? <SiteCard site={s} index={0} overlay /> : null;
  }, [sites]);
  const render = useCallback(
    (s: SiteDTO, i: number) => (
      <SortItem key={s.id} id={s.id}>
        {(h) => <SiteCard site={s} index={i} anim={ent(i)} handle={h} menu={menu} failover={failover} />}
      </SortItem>
    ),
    [ent, menu, failover],
  );
  return (
    <SortList virtual ids={ids} enabled={sortable} onReorder={onReorder} overlay={overlay}>
      <VirtualGrid items={sites} total={total} render={render} />
    </SortList>
  );
}

function ContentsBlock({ contents, sortable, onReorder, menu, open, jump }: { contents: ContentDTO[]; sortable: boolean; onReorder: (ids: string[], moved: { id: string }) => void; menu: MenuFor<ContentDTO>; open: (c: ContentDTO) => void; jump: { id: string; n: number } | null }) {
  const ent = useEntrance();
  const ids = useMemo(() => contents.map((c) => c.id), [contents]);
  const overlay = useCallback((id: string) => {
    const c = contents.find((x) => x.id === id);
    return c ? <ContentCard c={c} index={0} overlay /> : null;
  }, [contents]);
  const render = useCallback(
    (c: ContentDTO, i: number) => (
      <SortItem key={c.id} id={c.id}>
        {(h) => <ContentCard c={c} index={i} anim={ent(i)} handle={h} menu={menu} open={open} />}
      </SortItem>
    ),
    [ent, menu, open],
  );
  return (
    <SortList virtual ids={ids} enabled={sortable} onReorder={onReorder} overlay={overlay}>
      <VirtualMasonry items={contents} jump={jump} render={render} />
    </SortList>
  );
}

type ListKind = "site" | "content" | "category";

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
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const admin = data.admin;
  const dataRef = useRef(data);
  dataRef.current = data;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  /* ---------- data: first view from the server, full lists after hydration, then only what changed (v0.4.0) ---------- */
  const ver = useRef<Versions | undefined>(initial.version);
  const loading = useRef<Partial<Record<ListKind, Promise<void>>>>({});
  const loadList = useCallback((kind: ListKind) => {
    const running = loading.current[kind];
    if (running) return running;
    const job = apiZ<{ items: unknown[]; version: Versions }>(`/api/items?kind=${kind}`)
      .then((r) => {
        setData((d) => {
          const partial = { sites: d.partial?.sites ?? false, contents: d.partial?.contents ?? false };
          if (kind === "site") return { ...d, sites: r.items as SiteDTO[], partial: { ...partial, sites: false } };
          if (kind === "content") return { ...d, contents: r.items as ContentDTO[], partial: { ...partial, contents: false } };
          return { ...d, categories: r.items as CategoryDTO[] };
        });
        const key = kind === "site" ? "s" : kind === "content" ? "c" : "k";
        ver.current = { ...(ver.current ?? r.version), [key]: r.version[key] };
      })
      .catch(() => {
        /* keep what we have; the next sync retries */
      })
      .finally(() => {
        delete loading.current[kind];
      });
    loading.current[kind] = job;
    return job;
  }, []);
  const loadAll = useCallback(() => {
    const p = dataRef.current.partial;
    return Promise.all([p?.sites ? loadList("site") : null, p?.contents ? loadList("content") : null]);
  }, [loadList]);

  /** the small poll: change markers (+ monitor cards); re-download a list only when it changed */
  const sync = useCallback(
    async (withMonitors: boolean) => {
      const r = await api<{ version: Versions; monitors?: MonitorDTO[] }>(`/api/sync${withMonitors ? "?m=1" : ""}`);
      if (r.monitors) setData((d) => ({ ...d, monitors: r.monitors! }));
      const v = ver.current, p = dataRef.current.partial;
      const jobs: Promise<void>[] = [];
      // the contents list is only downloaded once the 收藏内容 tab has been opened (v0.4.1)
      const wantContents = !p?.contents || tabRef.current === "contents";
      if (!v || r.version.k !== v.k) jobs.push(loadList("category"), loadList("site"), ...(wantContents ? [loadList("content")] : [])); // deleting a category un-files its items
      else {
        if (p?.sites || r.version.s !== v.s) jobs.push(loadList("site"));
        if (wantContents && (p?.contents || r.version.c !== v.c)) jobs.push(loadList("content"));
      }
      await Promise.all(jobs);
      ver.current = r.version;
    },
    [loadList],
  );
  const refresh = useCallback(async () => {
    try {
      await sync(dataRef.current.showMonitors);
    } catch {
      /* keep the last good data */
    }
  }, [sync]);
  /** after a change applied locally from the server's answer: remember the new markers, download nothing */
  const adopt = useCallback(() => {
    void api<{ version: Versions }>("/api/sync").then((r) => (ver.current = r.version)).catch(() => {});
  }, []);

  useEffect(() => {
    // the sites list is being looked at; contents wait for their tab, ⌘K asks the server (v0.4.1)
    if (initial.partial?.sites) void loadList("site");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polling: monitor cards + change markers, every 15s on the monitors tab, every 60s otherwise
  useEffect(() => {
    const ms = tab === "monitors" ? 15000 : 60000;
    const tick = () => !document.hidden && !document.body.classList.contains("is-sorting") && void refresh();
    const t = setInterval(tick, ms);
    const onVis = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVis);
    if (tab === "monitors") tick();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tab, refresh]);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") prefetchSearch();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    let top = false;
    const onScroll = () => {
      const v = scrollY > 400;
      if (v !== top) setShowTop((top = v));
    };
    addEventListener("keydown", onKey);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("x-chat-open", chat);
    document.body.classList.toggle("x-drawer-open", !!drawer);
  }, [chat, drawer]);

  const openItem = useCallback((type: "content" | "monitor", id: string) => {
    if (type === "content" && dataRef.current.partial?.contents) void loadList("content");
    setTab(type === "content" ? "contents" : "monitors");
    setDrawer({ type, id });
    if (type === "content") {
      // ⌘K / assistant: bring the card into view behind the drawer
      const c = dataRef.current.contents.find((x) => x.id === id);
      setCat((cc) => (cc.contents === "all" || cc.contents === (c?.categoryId ?? "none") ? cc : { ...cc, contents: "all" }));
      setJump((j) => ({ id, n: (j?.n ?? 0) + 1 }));
    }
  }, [loadList]);

  const siteCats = useMemo(() => data.categories.filter((c) => c.kind === "site"), [data.categories]);
  const contentCats = useMemo(() => data.categories.filter((c) => c.kind === "content"), [data.categories]);
  const sitesLoaded = !data.partial?.sites, contentsLoaded = !data.partial?.contents;
  const totals = data.totals;
  const nSites = sitesLoaded ? data.sites.length : totals?.sites ?? data.sites.length;
  const nContents = contentsLoaded ? data.contents.length : totals?.contents ?? data.contents.length;

  const rail: RailItem[] = useMemo(() => {
    const counts = (list: { categoryId: string | null }[]) => {
      const m = new Map<string | null, number>();
      for (const x of list) m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + 1);
      return m;
    };
    const mk = (cats: CategoryDTO[], total: number, by: Map<string | null, number> | null, none: number): RailItem[] => {
      const un = by ? by.get(null) ?? 0 : none;
      return [
        { id: "all", name: "全部", icon: "layers", n: total },
        ...cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon, n: by ? by.get(c.id) ?? 0 : c.count, sortable: true })),
        ...(un ? [{ id: "none", name: "未分类", icon: "inbox", n: un }] : []),
      ];
    };
    if (tab === "sites") return mk(siteCats, nSites, sitesLoaded ? counts(data.sites) : null, totals?.sitesNone ?? 0);
    if (tab === "contents") return mk(contentCats, nContents, contentsLoaded ? counts(data.contents) : null, totals?.contentsNone ?? 0);
    const ms = data.monitors;
    return [
      { id: "all", name: "全部", icon: "layers", n: ms.length },
      { id: "server", name: "服务器", icon: "server", n: ms.filter((m) => m.kind === "server").length },
      { id: "http", name: "API · 服务", icon: "globe", n: ms.filter((m) => m.kind === "http").length },
      { id: "bad", name: "异常", icon: "triangle-alert", n: ms.filter((m) => m.status === "down" || m.status === "warn").length },
    ];
  }, [tab, data.sites, data.contents, data.monitors, siteCats, contentCats, sitesLoaded, contentsLoaded, nSites, nContents, totals]);

  const current = cat[tab];
  const sites = useMemo(() => (cat.sites === "all" ? data.sites : cat.sites === "none" ? data.sites.filter((x) => !x.categoryId) : data.sites.filter((x) => x.categoryId === cat.sites)), [data.sites, cat.sites]);
  const contents = useMemo(() => (cat.contents === "all" ? data.contents : cat.contents === "none" ? data.contents.filter((x) => !x.categoryId) : data.contents.filter((x) => x.categoryId === cat.contents)), [data.contents, cat.contents]);
  const monitors = current === "all" ? data.monitors : current === "bad" ? data.monitors.filter((m) => m.status === "down" || m.status === "warn") : data.monitors.filter((m) => m.kind === current);
  // while only the first sites are here, keep the page as tall as the whole category will be
  const sitesTotal = sitesLoaded ? sites.length : tab === "sites" ? rail.find((r) => r.id === current)?.n ?? sites.length : sites.length;

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "sites", label: "站点导航", n: nSites },
    { id: "contents", label: "收藏内容", n: nContents },
    ...(data.showMonitors ? [{ id: "monitors" as Tab, label: "服务监控", n: data.monitors.length }] : []),
  ];
  const sum = {
    up: data.monitors.filter((m) => m.status === "up").length,
    warn: data.monitors.filter((m) => m.status === "warn").length,
    down: data.monitors.filter((m) => m.status === "down").length,
  };

  /** intent: the pointer is on the 收藏内容 tab — start its download before the click */
  const prefetchContents = () => {
    if (dataRef.current.partial?.contents) void loadList("content");
  };
  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === "contents") void loadAll();
    const el = document.getElementById("tabs");
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth" });
  };
  const pickCat = (id: string) => {
    setCat((c) => ({ ...c, [tab]: id }));
    const el = document.getElementById("content-top");
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth" });
  };

  /* ---------- drag to reorder (admin): optimistic; only the moved row is saved (v0.4.0) ---------- */
  const persistMove = useCallback(
    async (kind: "site" | "content", id: string, after: string | null, before: string | null) => {
      try {
        const r = await api<{ sort: number; sorts?: [string, number][] }>("/api/reorder", { body: { kind, id, after, before } });
        setData((d) => {
          if (r.sorts) {
            const at = new Map(r.sorts);
            return kind === "site"
              ? { ...d, sites: d.sites.map((x) => ({ ...x, sort: at.get(x.id) ?? x.sort })).sort(cmpSite) }
              : { ...d, contents: d.contents.map((x) => ({ ...x, sort: at.get(x.id) ?? x.sort })).sort(cmpContent) };
          }
          return kind === "site" ? { ...d, sites: d.sites.map((x) => (x.id === id ? { ...x, sort: r.sort } : x)) } : { ...d, contents: d.contents.map((x) => (x.id === id ? { ...x, sort: r.sort } : x)) };
        });
        adopt();
      } catch (e) {
        toast(e instanceof Error ? e.message : "排序保存失败", "error");
        await loadList(kind);
      }
    },
    [adopt, loadList, toast],
  );
  const reorderSites = useCallback(
    (subset: string[], moved: { id: string }) => {
      const k = subset.indexOf(moved.id);
      const prev = subset[k - 1] ?? null, next = subset[k + 1] ?? null;
      setData((d) => ({ ...d, sites: moveAfter(d.sites, moved.id, prev, next) }));
      void persistMove("site", moved.id, prev, next);
    },
    [persistMove],
  );
  const reorderContents = useCallback(
    (subset: string[], moved: { id: string }) => {
      const k = subset.indexOf(moved.id);
      const prev = subset[k - 1] ?? null, next = subset[k + 1] ?? null;
      setData((d) => ({ ...d, contents: moveAfter(d.contents, moved.id, prev, next) }));
      void persistMove("content", moved.id, prev, next);
    },
    [persistMove],
  );
  const reorderCats = (kind: "site" | "content", ids: string[]) => {
    setData((d) => {
      const at = new Map(ids.map((id, i) => [id, i]));
      const mine = d.categories.filter((c) => c.kind === kind).map((c) => ({ ...c, sort: at.get(c.id) ?? c.sort })).sort((a, b) => a.sort - b.sort);
      const other = d.categories.filter((c) => c.kind !== kind);
      return { ...d, categories: kind === "site" ? [...other, ...mine] : [...mine, ...other] };
    });
    void api("/api/reorder", { body: { kind: "category", ids } }).then(adopt, async (e) => {
      toast(e instanceof Error ? e.message : "排序保存失败", "error");
      await loadList("category");
    });
  };

  /* ---------- local updates from the server's answer instead of downloading everything again ---------- */
  const putSite = useCallback((s: SiteDTO) => setData((d) => ({ ...d, sites: upsert(d.sites, s, cmpSite) })), []);
  const putContent = useCallback((c: ContentDTO) => setData((d) => ({ ...d, contents: upsert(d.contents, c, cmpContent) })), []);
  const dropItem = useCallback((kind: "site" | "content", id: string) => setData((d) => (kind === "site" ? { ...d, sites: d.sites.filter((x) => x.id !== id) } : { ...d, contents: d.contents.filter((x) => x.id !== id) })), []);

  /* ---------- context menu ---------- */
  const act = async <R,>(fn: () => Promise<R>, ok: string, apply?: (r: R) => void) => {
    try {
      const r = await fn();
      if (apply) {
        apply(r);
        adopt();
      } else await refresh();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "操作失败", "error");
    }
  };
  const copyLink = (url: string) => copyText(url).then((ok) => toast(ok ? "链接已复制" : "复制失败", ok ? "ok" : "error"));
  const moveItems = (kind: "site" | "content", id: string, currentCat: string | null): MenuItem => {
    const patch = (categoryId: string | null, ok: string) =>
      act(() => api<SiteDTO & ContentDTO>(`/api/${kind === "site" ? "sites" : "contents"}/${id}`, { method: "PATCH", body: { categoryId } }), ok, (r) => (kind === "site" ? putSite(r) : putContent(r)));
    return {
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
            onSelect: () => currentCat !== c.id && patch(c.id, `已移动到「${c.name}」`),
          })),
          { key: "none", label: "未分类", icon: <CatIcon name="inbox" size={15} />, checked: !currentCat, onSelect: () => currentCat && patch(null, "已移到未分类") },
        ],
      },
    };
  };
  const addBackup = async (s: SiteDTO) => {
    const url = await dialog.prompt({ title: `给「${s.name}」添加备用链接`, placeholder: "https://", confirmText: "添加", validate: (v) => (v.trim() ? null : "请输入链接") });
    if (url) await act(() => api<SiteDTO>(`/api/sites/${s.id}/links`, { body: { url } }), "已添加备用链接", putSite);
  };
  const siteMenu = (s: SiteDTO, x: number, y: number) => {
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
        { key: "pin", label: s.pinned ? "取消置顶" : "置顶", icon: s.pinned ? <PinOffIcon /> : <PinIcon size={15} />, onSelect: () => act(() => api<SiteDTO>(`/api/sites/${s.id}`, { method: "PATCH", body: { pinned: !s.pinned } }), s.pinned ? "已取消置顶" : "已置顶", putSite) },
        moveItems("site", s.id, s.categoryId),
        { key: "backup", label: "添加备用链接", icon: <LinkIcon />, onSelect: () => void addBackup(s) },
        { key: "icon", label: "重新抓取图标", icon: <RefreshIcon />, onSelect: () => act(() => api<SiteDTO>(`/api/icon/site/${s.id}`, { body: { refetch: true } }), "已重新抓取图标", putSite) },
        { sep: true, key: "s2" },
        { key: "del", label: "删除", icon: <TrashIcon />, danger: true, onSelect: async () => (await dialog.confirm({ title: `删除站点「${s.name}」？`, message: "删除后无法恢复。", danger: true })) && act(() => api(`/api/sites/${s.id}`, { method: "DELETE" }), "已删除", () => dropItem("site", s.id)) },
      );
    setMenu({ x, y, title: s.name, items });
  };
  const contentMenu = (c: ContentDTO, x: number, y: number) => {
    const items: MenuItem[] = [
      { key: "open", label: "打开原文", icon: <OpenIcon />, onSelect: () => location.assign(c.url) },
      { key: "tab", label: "在新标签页打开", icon: <ExternalIcon />, onSelect: () => window.open(c.url, "_blank", "noopener") },
      { key: "copy", label: "复制链接", icon: <CopyIcon />, onSelect: () => copyLink(c.url) },
    ];
    if (admin)
      items.push(
        { sep: true, key: "s1" },
        { key: "edit", label: "编辑", icon: <EditIcon />, onSelect: () => setDrawer({ type: "content", id: c.id, edit: true }) },
        { key: "pin", label: c.pinned ? "取消置顶" : "置顶", icon: c.pinned ? <PinOffIcon /> : <PinIcon size={15} />, onSelect: () => act(() => api<ContentDTO>(`/api/contents/${c.id}`, { method: "PATCH", body: { pinned: !c.pinned } }), c.pinned ? "已取消置顶" : "已置顶", putContent) },
        moveItems("content", c.id, c.categoryId),
        { key: "icon", label: "重新抓取图标", icon: <RefreshIcon />, onSelect: () => act(() => api<ContentDTO>(`/api/icon/content/${c.id}`, { body: { refetch: true } }), "已重新抓取图标", putContent) },
        { sep: true, key: "s2" },
        { key: "del", label: "删除", icon: <TrashIcon />, danger: true, onSelect: async () => (await dialog.confirm({ title: "删除这条收藏？", message: c.title, danger: true })) && act(() => api(`/api/contents/${c.id}`, { method: "DELETE" }), "已删除", () => dropItem("content", c.id)) },
      );
    setMenu({ x, y, title: c.title, items });
  };
  // stable callbacks for the (memoised) cards; they always call the latest menu builders
  const menus = useRef({ siteMenu, contentMenu });
  menus.current = { siteMenu, contentMenu };
  const onSiteMenu = useCallback((s: SiteDTO, x: number, y: number) => menus.current.siteMenu(s, x, y), []);
  const onContentMenu = useCallback((c: ContentDTO, x: number, y: number) => menus.current.contentMenu(c, x, y), []);
  const onContentOpen = useCallback((c: ContentDTO) => setDrawer({ type: "content", id: c.id }), []);
  const onAdded = useCallback(
    (r: { kind: "site"; site: SiteDTO; mergedFrom?: string } | { kind: "content"; content: ContentDTO }) => {
      if (r.kind === "site") {
        if (r.mergedFrom) dropItem("site", r.mergedFrom);
        putSite(r.site);
      } else putContent(r.content);
      adopt();
    },
    [adopt, dropItem, putContent, putSite],
  );

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
        <button className="search-pill" onClick={() => setPalette(true)} onPointerEnter={prefetchSearch} onPointerDown={prefetchSearch} onFocus={prefetchSearch} aria-label="搜索">
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
              <button key={t.id} className="x-tab" role="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => switchTab(t.id)} onPointerEnter={t.id === "contents" ? prefetchContents : undefined} onTouchStart={t.id === "contents" ? prefetchContents : undefined} onFocus={t.id === "contents" ? prefetchContents : undefined}>
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
                {sites.length || !sitesLoaded ? (
                  <SitesBlock key={cat.sites} sites={sites} total={sitesTotal} sortable={admin && sitesLoaded} onReorder={reorderSites} menu={onSiteMenu} failover={data.siteFailover} />
                ) : (
                  <p className="empty">还没有站点</p>
                )}
              </section>
            )}
            {tab === "contents" && (
              <section className="block" role="tabpanel">
                {!contentsLoaded ? null : contents.length ? (
                  <ContentsBlock key={cat.contents} contents={contents} sortable={admin} onReorder={reorderContents} menu={onContentMenu} open={onContentOpen} jump={jump} />
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
      <CommandPalette open={palette} onClose={() => setPalette(false)} monitors={data.monitors} onOpenItem={openItem} />
      {admin && <AddDialog open={adding} onClose={() => setAdding(false)} refresh={refresh} onAdded={onAdded} aiEnabled={data.aiEnabled} />}
      <Assistant open={chat} setOpen={setChat} admin={admin} aiEnabled={data.aiEnabled} refresh={refresh} onOpenItem={openItem} />
    </>
  );
}
