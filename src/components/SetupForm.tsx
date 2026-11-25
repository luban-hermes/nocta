"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { Starfield } from "./Starfield";
import { Button } from "./ui/button";
import { Input, Switch } from "./ui/input";
import { BrandOrb } from "./NoctaApp";

/** first-run wizard: choose the admin password (replaces the old ADMIN_PASSWORD env var) */
export function SetupForm() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pub, setPub] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setErr("密码至少 8 位");
    if (pw !== pw2) return setErr("两次输入的密码不一致");
    setBusy(true);
    setErr("");
    try {
      await api("/api/setup", { body: { password: pw, publicMode: pub } });
      location.href = "/admin";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "初始化失败");
      setBusy(false);
    }
  };
  return (
    <>
      <Starfield />
      <form className="login-card glass setup" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <BrandOrb />
          <span>夜航 Nocta</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>设置管理员密码</h1>
        <div className="f-grid">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="管理员密码（至少 8 位）" autoFocus autoComplete="new-password" aria-label="管理员密码" />
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再输入一次" autoComplete="new-password" aria-label="确认密码" />
          <div className="setup-row">
            <span>
              <b>访客可浏览导航</b>
              <small>不登录也能打开首页</small>
            </span>
            <Switch checked={pub} onChange={setPub} label="访客可浏览导航" />
          </div>
        </div>
        <p className="f-err" role="alert" style={{ margin: "8px 2px" }}>{err}</p>
        <Button type="submit" variant="primary" loading={busy} disabled={!pw || !pw2} style={{ width: "100%", height: 44 }}>
          完成设置并进入后台
        </Button>
      </form>
    </>
  );
}
