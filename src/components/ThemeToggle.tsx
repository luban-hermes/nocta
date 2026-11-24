"use client";
import { MoonIcon, SunIcon } from "./Icons";

export function ThemeToggle() {
  const toggle = () => {
    const c = document.documentElement.classList;
    const next = c.contains("dark") ? "light" : "dark";
    c.remove("dark", "light");
    c.add(next);
    try {
      localStorage.setItem("nocta-theme", next);
    } catch {}
  };
  return (
    <button className="icon-btn theme-btn" onClick={toggle} aria-label="切换明暗主题" title="切换明暗主题">
      <MoonIcon className="moon" />
      <SunIcon className="sun" />
    </button>
  );
}
