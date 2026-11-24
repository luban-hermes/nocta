"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ContentDTO, MonitorDTO, SiteDTO } from "@/lib/types";
import { api, copyText, installCommand } from "@/lib/client";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/input";
import { useToast } from "./ui/toast";
import { ContentCard, MonitorCard, SiteCard } from "./Cards";

type Mode = "bookmark" | "http" | "server";
type AddResult = { kind: "site"; site: SiteDTO; usedAi: boolean; fetched: boolean } | { kind: "content"; content: ContentDTO; usedAi: boolean; fetched: boolean };

const MODES: { id: Mode; label: string }[] = [
  { id: "bookmark", label: "书签" },
  { id: "http", label: "HTTP 监控" },
  { id: "server", label: "服务器" },
];

export function AddDialog({ open, onClose, refresh, aiEnabled }: { open: boolean; onClose: () => void; refresh: () => Promise<void>; aiEnabled: boolean }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("bookmark");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [interval, setIntervalSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<AddResult | null>(null);
  const [mon, setMon] = useState<MonitorDTO | null>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setName("");
      setErr("");
      setRes(null);
      setMon(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setErr("");
    setRes(null);
    setMon(null);
    try {
      if (mode === "bookmark") {
        const r = await api<AddResult>("/api/add", { body: { url } });
        setRes(r);
        toast(r.kind === "site" ? "已添加到站点导航" : "已添加到收藏内容");
      } else {
        const m = await api<MonitorDTO>("/api/monitors", { body: mode === "server" ? { kind: "server", ssh: url, name: name || undefined, interval: Math.min(interval, 300) } : { kind: "http", url, name: name || undefined, interval } });
        setMon(m);
        toast("监控已添加");
      }
      setUrl("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? location.origin : "";
  return (
    <Modal open={open} onClose={onClose} label="添加" className="sm">
      <div className="a-pad">
        <h3>添加</h3>
        <p className="sub">
          {mode === "bookmark"
            ? `粘贴链接：裸域名进「站点导航」，带路径的页面进「收藏内容」。${aiEnabled ? "AI 会自动摘要、打标签并归类。" : "未配置 AI，将按规则归类。"}`
            : mode === "http"
              ? "定时检查状态码、响应时间和 SSL 证书剩余天数。"
              : "粘贴 SSH 地址（不需要密码），然后在服务器上运行一行命令安装探针。"}
        </p>
        <div className="seg mt-4" role="group" aria-label="类型">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => { setMode(m.id); setErr(""); setRes(null); setMon(null); setIntervalSec(m.id === "server" ? 30 : 60); }}>
              {mode === m.id && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              {m.label}
            </button>
          ))}
        </div>
        <form className="f-grid mt-4" onSubmit={submit}>
          <div className="a-form" style={{ marginTop: 0 }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={mode === "server" ? "ssh root@203.0.113.50 -p 2222" : mode === "http" ? "https://api.example.com/health" : "https://"} autoComplete="off" spellCheck={false} autoFocus aria-label="地址" />
            <Button type="submit" variant="primary" loading={busy}>添加</Button>
          </div>
          {mode !== "bookmark" && (
            <div className="f-2">
              <Field label="名称（可选）"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={mode === "server" ? "上报间隔（秒）" : "检查间隔（秒）"}><Input type="number" min={10} value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))} /></Field>
            </div>
          )}
          {mode === "bookmark" && (
            <div className="a-ex">
              {["github.com/vercel/next.js", "excalidraw.com", "www.youtube.com/watch?v=dQw4w9WgXcQ"].map((u) => (
                <button key={u} type="button" onClick={() => setUrl(u)}>{u}</button>
              ))}
            </div>
          )}
          <p className="f-err" role="alert">{err}</p>
        </form>
        {busy && mode === "bookmark" && (
          <div className="skel">
            <div className="sk sk-cover" />
            <div className="sk sk-l" style={{ width: "70%" }} />
            <div className="sk sk-l" style={{ width: "40%", marginBottom: 16 }} />
          </div>
        )}
        <div className="preview">
          {res?.kind === "site" && <div style={{ width: 130, margin: "0 auto" }}><SiteCard site={res.site} index={0} admin={false} onMore={() => {}} /></div>}
          {res?.kind === "content" && <ContentCard c={res.content} index={0} onOpen={() => {}} />}
          {res && !res.fetched && <p className="sub" style={{ marginTop: 8 }}>页面抓取失败（超时或被拒绝），已用网址信息代替，可稍后编辑。</p>}
          {mon && <MonitorCard m={mon} index={0} onOpen={() => {}} />}
          {mon?.kind === "server" && mon.token && (
            <div className="f-grid mt-3">
              <p className="sub">在服务器上执行：</p>
              <pre className="code">{installCommand(origin, mon.token)}</pre>
              <Button onClick={() => copyText(installCommand(origin, mon.token!)).then(() => toast("已复制安装命令"))}>复制安装命令</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
