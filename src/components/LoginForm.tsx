"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Starfield } from "./Starfield";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { BrandOrb } from "./NoctaApp";

export function LoginForm({ next, configured, publicMode }: { next: string; configured: boolean; publicMode: boolean }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth/login", { body: { password: pw } });
      location.href = next;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登录失败");
      setBusy(false);
    }
  };
  return (
    <>
      <Starfield />
      <form className="login-card glass" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <BrandOrb />
          <span>夜航后台</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>管理员登录</h1>
        <p className="sub" style={{ fontSize: 13, color: "var(--text3)", margin: "6px 0 18px" }}>
          {configured ? "输入 ADMIN_PASSWORD 中设置的密码。" : "服务器尚未设置 ADMIN_PASSWORD（或仍是示例值 change-me），请改成你自己的密码后重启。"}
        </p>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="密码" autoFocus autoComplete="current-password" aria-label="密码" disabled={!configured} />
        <p className="f-err" role="alert" style={{ margin: "8px 2px" }}>{err}</p>
        <Button type="submit" variant="primary" loading={busy} disabled={!configured || !pw} style={{ width: "100%", height: 44 }}>
          登录
        </Button>
        {publicMode && (
          <Link href="/" className="btn" style={{ width: "100%", marginTop: 10, height: 44 }}>
            ← 返回首页
          </Link>
        )}
      </form>
    </>
  );
}
