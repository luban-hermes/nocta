"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ContentDTO, MonitorDTO, SiteDTO } from "@/lib/types";
import { api, copyText, installCommand } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useToast } from "./ui/toast";
import { CloseIcon, SendIcon, SparkIcon } from "./Icons";
import { StatusDot, Tile } from "./Cards";

interface Reply {
  action: string;
  reply: string;
  created?: { kind: "site"; item: SiteDTO } | { kind: "content"; item: ContentDTO } | { kind: "monitor"; item: MonitorDTO };
  install?: boolean;
  results?: { sites: SiteDTO[]; contents: ContentDTO[]; monitors: MonitorDTO[] };
}
type Msg = { id: number; me: boolean; text: string; data?: Reply };

const CHIPS = [
  { label: "收藏一个网址", q: "https://excalidraw.com" },
  { label: "添加服务器监控", q: "ssh root@203.0.113.50 -p 2222" },
  { label: "监控一个 API", q: "监控 https://api.github.com/zen" },
];

export function Assistant({ open, setOpen, admin, aiEnabled, refresh, onOpenItem }: { open: boolean; setOpen: (v: boolean) => void; admin: boolean; aiEnabled: boolean; refresh: () => Promise<void>; onOpenItem: (type: "content" | "monitor", id: string) => void }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, me: false, text: `你好，我是夜航 AI 助手${aiEnabled ? "" : "（规则模式）"}。\n粘贴网址、SSH 命令或 API 地址，我会帮你加到合适的位置。${admin ? "" : "\n\n添加内容需要先登录后台。"}` },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 200);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setText("");
    setMsgs((m) => [...m, { id: Date.now(), me: true, text: q }]);
    setBusy(true);
    try {
      const r = await api<Reply>("/api/assistant", { body: { message: q } });
      setMsgs((m) => [...m, { id: Date.now() + 1, me: false, text: r.reply, data: r }]);
      if (r.created) await refresh();
    } catch (e) {
      setMsgs((m) => [...m, { id: Date.now() + 1, me: false, text: e instanceof Error ? e.message : "出错了" }]);
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? location.origin : "";

  return (
    <>
      <button className={cn("x-fab", open && "off")} onClick={() => setOpen(true)} aria-label="打开 AI 助手" aria-expanded={open}>
        <SparkIcon size={24} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside
            className="x-chat"
            role="dialog"
            aria-label="AI 助手"
            initial={{ x: "calc(-100% - 24px)" }}
            animate={{ x: 0 }}
            exit={{ x: "calc(-100% - 24px)" }}
            transition={{ type: "tween", duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="x-chat__h">
              <span className="x-ic" aria-hidden="true"><SparkIcon size={15} /></span>
              <h2>AI 助手</h2>
              <small>网址 · SSH · API</small>
              <button className="x-chat__x" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">
                <CloseIcon />
              </button>
            </div>
            <div className="x-chatlog" ref={logRef} aria-live="polite">
              {msgs.map((m) => (
                <div key={m.id} className={cn("x-msg", m.me ? "me" : "ai", m.data?.created && "wide")}>
                  {m.text}
                  {m.data?.created && (
                    <div className="x-cites">
                      {m.data.created.kind === "site" && (
                        <a className="res-row" href={m.data.created.item.url} target="_blank" rel="noopener noreferrer">
                          <Tile src={m.data.created.item.icon} name={m.data.created.item.name} size="sm" />
                          {m.data.created.item.name}
                          <small>站点</small>
                        </a>
                      )}
                      {m.data.created.kind === "content" && (
                        <button className="res-row" onClick={() => onOpenItem("content", m.data!.created!.item.id)}>
                          <Tile src={(m.data.created.item as ContentDTO).icon} name={(m.data.created.item as ContentDTO).domain} size="sm" />
                          <span className="truncate">{(m.data.created.item as ContentDTO).title}</span>
                          <small>查看</small>
                        </button>
                      )}
                      {m.data.created.kind === "monitor" && (
                        <button className="res-row" onClick={() => onOpenItem("monitor", m.data!.created!.item.id)}>
                          <StatusDot status={(m.data.created.item as MonitorDTO).status} />
                          {(m.data.created.item as MonitorDTO).name}
                          <small>查看详情</small>
                        </button>
                      )}
                    </div>
                  )}
                  {m.data?.install && m.data.created?.kind === "monitor" && (m.data.created.item as MonitorDTO).token && (
                    <>
                      <pre className="code">{installCommand(origin, (m.data.created.item as MonitorDTO).token!)}</pre>
                      <div className="x-acts">
                        <button className="btn" onClick={() => copyText(installCommand(origin, (m.data!.created!.item as MonitorDTO).token!)).then(() => toast("已复制安装命令"))}>复制命令</button>
                      </div>
                    </>
                  )}
                  {m.data?.results && (
                    <div className="x-cites">
                      {m.data.results.sites.map((s) => (
                        <a key={s.id} className="res-row" href={s.url} target="_blank" rel="noopener noreferrer"><Tile src={s.icon} name={s.name} size="sm" />{s.name}<small>站点</small></a>
                      ))}
                      {m.data.results.contents.map((c) => (
                        <button key={c.id} className="res-row" onClick={() => onOpenItem("content", c.id)}><Tile src={c.icon} name={c.domain} size="sm" /><span className="truncate">{c.title}</span><small>收藏</small></button>
                      ))}
                      {m.data.results.monitors.map((x) => (
                        <button key={x.id} className="res-row" onClick={() => onOpenItem("monitor", x.id)}><StatusDot status={x.status} />{x.name}<small>监控</small></button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="x-msg ai">
                  <span className="thinking"><i /><i /><i /></span>
                </div>
              )}
            </div>
            <div className="x-chips">
              {CHIPS.map((c) => (
                <button key={c.label} onClick={() => setText(c.q)}>{c.label}</button>
              ))}
            </div>
            <form className="x-comp" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                placeholder="粘贴网址、SSH 命令或 API 地址…"
                aria-label="给 AI 助手发消息"
              />
              <button className="btn pri" type="submit" aria-label="发送" disabled={busy}>
                <SendIcon />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
