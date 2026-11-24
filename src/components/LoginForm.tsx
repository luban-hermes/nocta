"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Starfield } from "./Starfield";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { BrandOrb } from "./NoctaApp";
import { ArrowLeftIcon } from "./Icons";

export function LoginForm({ next, publicMode }: { next: string; publicMode: boolean }) {
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
        <p className="sub" style={{ fontSize: 13, color: "var(--text3)", margin: "6px 0 18px" }}>输入管理员密码。忘记密码：用环境变量 NOCTA_RESET_PASSWORD=1 启动一次即可重新设置（见 README）。</p>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="密码" autoFocus autoComplete="current-password" aria-label="密码" />
        <p className="f-err" role="alert" style={{ margin: "8px 2px" }}>{err}</p>
        <Button type="submit" variant="primary" loading={busy} disabled={!pw} style={{ width: "100%", height: 44 }}>
          登录
        </Button>
        {publicMode && (
          <Link href="/" className="btn" style={{ width: "100%", marginTop: 10, height: 44 }}>
            <ArrowLeftIcon /> 返回首页
          </Link>
        )}
      </form>
    </>
  );
}
