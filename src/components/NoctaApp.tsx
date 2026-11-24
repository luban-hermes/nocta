"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppData, CategoryDTO } from "@/lib/types";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Starfield } from "./Starfield";
import { ThemeToggle } from "./ThemeToggle";
import { ToastProvider } from "./ui/toast";
import { ContentCard, MonitorCard, SiteCard } from "./Cards";
import { Drawer, type DrawerTarget } from "./Drawer";
import { CommandPalette } from "./CommandPalette";
import { AddDialog } from "./AddDialog";
import { Assistant } from "./Assistant";
import { ArrowUpIcon, SearchIcon } from "./Icons";

type Tab = "sites" | "contents" | "monitors";
type RailItem = { id: string; name: string; icon: string; n: number };

export function BrandOrb() {
  return (
    <span className="orb">
      <i />
    </span>
  );
}

export function NoctaApp({ initial }: { initial: AppData }) {
  return (
    <ToastProvider>
      <App initial={initial} />
    </ToastProvider>
  );
}

function App({ initial }: { initial: AppData }) {
  const [data, setData] = useState<AppData>(initial);
  const [tab, setTab] = useState<Tab>("sites");
  const [cat, setCat] = useState<Record<Tab, string>>({ sites: "all", contents: "all", monitors: "all" });
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const [palette, setPalette] = useState(false);
  const [adding, setAdding] = useState(false);
  const [chat, setChat] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [isMac, setIsMac] = useState(true);

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
    const t = setInterval(() => !document.hidden && refresh(), ms);
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
      { id: "all", name: "全部", icon: "◎", n: total },
      ...cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon || "•", n: c.count })),
      ...(uncategorized ? [{ id: "none", name: "未分类", icon: "∅", n: uncategorized }] : []),
    ];
    if (tab === "sites") return mk(siteCats, data.sites.length, data.sites.filter((s) => !s.categoryId).length);
    if (tab === "contents") return mk(contentCats, data.contents.length, data.contents.filter((s) => !s.categoryId).length);
    const ms = data.monitors;
    return [
      { id: "all", name: "全部", icon: "◎", n: ms.length },
      { id: "server", name: "服务器", icon: "▤", n: ms.filter((m) => m.kind === "server").length },
      { id: "http", name: "API · 服务", icon: "⇄", n: ms.filter((m) => m.kind === "http").length },
      { id: "bad", name: "异常", icon: "⚠", n: ms.filter((m) => m.status === "down" || m.status === "warn").length },
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
          {data.admin && (
            <button className="add-btn" onClick={() => setAdding(true)}>
              <span>+ 添加</span>
            </button>
          )}
          <Link className="avatar-btn" href={data.admin ? "/admin" : "/login"} aria-label={data.admin ? "夜航后台" : "登录"}>
            <span className="avatar">夜</span>
            <span>{data.admin ? "后台" : "登录"}</span>
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
              {rail.map((r) => (
                <button key={r.id} className={cn("rail-item", current === r.id && "on")} onClick={() => pickCat(r.id)} aria-current={current === r.id}>
                  {current === r.id && <motion.span layoutId={`rail-${tab}`} className="rail-hl" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <span className="ri" aria-hidden="true">{r.icon}</span>
                  {r.name}
                  <span className="n">{r.n}</span>
                </button>
              ))}
            </nav>
            {tab !== "monitors" && data.admin && (
              <div className="rail-foot">
                <p><span className="spark">✦</span> {data.aiEnabled ? "AI 已连接" : "规则模式"}</p>
                <small>{data.aiEnabled ? "新链接会自动摘要、打标签、归类" : "设置 AI_BASE_URL / AI_API_KEY 启用 AI"}</small>
              </div>
            )}
          </aside>

          <div className="content" style={{ minWidth: 0 }}>
            {tab === "sites" && (
              <section className="block" role="tabpanel">
                {sites.length ? (
                  <div className="sites">
                    {sites.map((s, i) => (
                      <SiteCard key={s.id} site={s} index={i} admin={data.admin} onMore={() => setDrawer({ type: "site", id: s.id })} />
                    ))}
                  </div>
                ) : (
                  <p className="empty">{data.admin ? "这个分类还没有站点，点右上角「+ 添加」或让 AI 助手帮你添加。" : "这个分类还没有站点。"}</p>
                )}
              </section>
            )}
            {tab === "contents" && (
              <section className="block" role="tabpanel">
                {contents.length ? (
                  <div className="masonry">
                    {contents.map((c, i) => (
                      <ContentCard key={c.id} c={c} index={i} onOpen={() => setDrawer({ type: "content", id: c.id })} />
                    ))}
                  </div>
                ) : (
                  <p className="empty">{data.admin ? "这个分类还没有收藏，粘贴一个文章 / 视频 / 仓库链接试试。" : "这个分类还没有收藏。"}</p>
                )}
              </section>
            )}
            {tab === "monitors" && (
              <section className="block" role="tabpanel">
                <p className="x-msum">
                  <span><i className="x-sd" />在线 {sum.up}</span>
                  <span><i className="x-sd warn" />告警 {sum.warn}</span>
                  <span><i className="x-sd bad" />离线 {sum.down}</span>
                  <small>每 15 秒刷新</small>
                </p>
                {monitors.length ? (
                  <div className="x-mgrid">
                    {monitors.map((m, i) => (
                      <MonitorCard key={m.id} m={m} index={i} onOpen={() => setDrawer({ type: "monitor", id: m.id })} />
                    ))}
                  </div>
                ) : (
                  <p className="empty">{current === "bad" ? "一切正常。" : data.admin ? "还没有监控。「+ 添加」一个 API 地址，或粘贴 SSH 命令添加服务器。" : "还没有监控。"}</p>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      <button className={cn("x-top", showTop && "on")} onClick={() => scrollTo({ top: 0, behavior: "smooth" })} aria-label="回到顶部" tabIndex={showTop ? 0 : -1}>
        <ArrowUpIcon />
      </button>

      <Drawer target={drawer} data={data} onClose={() => setDrawer(null)} refresh={refresh} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} data={data} onOpenItem={openItem} />
      {data.admin && <AddDialog open={adding} onClose={() => setAdding(false)} refresh={refresh} aiEnabled={data.aiEnabled} />}
      <Assistant open={chat} setOpen={setChat} admin={data.admin} aiEnabled={data.aiEnabled} refresh={refresh} onOpenItem={openItem} />
    </>
  );
}
