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
import { CloseIcon, LinkIcon, PlusIcon } from "./Icons";

type Mode = "bookmark" | "http" | "server";
type AddResult = { kind: "site"; site: SiteDTO; usedAi: boolean; fetched: boolean; similar?: { id: string; name: string } | null } | { kind: "content"; content: ContentDTO; usedAi: boolean; fetched: boolean };

const MODES: { id: Mode; label: string }[] = [
  { id: "bookmark", label: "书签" },
  { id: "http", label: "HTTP 监控" },
  { id: "server", label: "服务器" },
];

export function AddDialog({ open, onClose, refresh, aiEnabled }: { open: boolean; onClose: () => void; refresh: () => Promise<void>; aiEnabled: boolean }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("bookmark");
  const [url, setUrl] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [name, setName] = useState("");
  const [interval, setIntervalSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<AddResult | null>(null);
  const [mon, setMon] = useState<MonitorDTO | null>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setBackups([]);
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
        const r = await api<AddResult>("/api/add", { body: { url, backups: backups.filter((b) => b.trim()) } });
        setRes(r);
        setBackups([]);
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
        <p className="sub">{mode === "bookmark" ? "收藏网站或文章，自动整理归类" : mode === "http" ? "检查网站或 API 是否在线" : "查看服务器的 CPU、内存和磁盘"}</p>
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
          {mode === "bookmark" && (
            <div className="bk-links">
              {backups.map((b, i) => (
                <div className="bk-link" key={i}>
                  <LinkIcon />
                  <Input value={b} onChange={(e) => setBackups(backups.map((x, j) => (j === i ? e.target.value : x)))} placeholder="备用链接 https://" autoComplete="off" spellCheck={false} aria-label={`备用链接 ${i + 1}`} />
                  <button type="button" className="icon-btn" aria-label="移除备用链接" onClick={() => setBackups(backups.filter((_, j) => j !== i))}><CloseIcon /></button>
                </div>
              ))}
              {backups.length < 9 && (
                <button type="button" className="bk-add" onClick={() => setBackups([...backups, ""])}><PlusIcon size={14} /> 备用链接</button>
              )}
            </div>
          )}
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
          {res?.kind === "site" && <div style={{ width: 130, margin: "0 auto" }}><SiteCard site={res.site} index={0} /></div>}
          {res?.kind === "site" && res.similar && (
            <div className="merge-hint">
              <Button
                loading={merging}
                onClick={async () => {
                  if (res.kind !== "site" || !res.similar) return;
                  setMerging(true);
                  try {
                    const s = await api<SiteDTO>(`/api/sites/${res.site.id}/merge`, { body: { into: res.similar.id } });
                    setRes({ ...res, site: s, similar: null });
                    toast(`已作为「${s.name}」的备用链接`);
                    await refresh();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "合并失败", "error");
                  } finally {
                    setMerging(false);
                  }
                }}
              >
                <LinkIcon /> 作为「{res.similar.name}」的备用链接
              </Button>
            </div>
          )}
          {res?.kind === "content" && <ContentCard c={res.content} index={0} onOpen={() => {}} />}
          {res && !res.fetched && <p className="sub" style={{ marginTop: 8 }}>没能读取页面信息</p>}
          {mon && <MonitorCard m={mon} index={0} onOpen={() => {}} />}
          {mon?.kind === "server" && mon.token && (
            <div className="f-grid mt-3">
              <p className="sub">在服务器上运行</p>
              <pre className="code">{installCommand(origin, mon.token)}</pre>
              <Button onClick={() => copyText(installCommand(origin, mon.token!)).then(() => toast("已复制安装命令"))}>复制安装命令</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
