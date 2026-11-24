import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "夜航书签 · Nocta", template: "%s · 夜航 Nocta" },
  description: "夜航 Nocta — 自托管的书签、网址导航、服务监控与 AI 助手",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070d" },
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
  ],
};

// set the theme class before first paint (no flash). Dark (deep space) is the default.
const themeScript = `(function(){try{var t=localStorage.getItem("nocta-theme");if(t!=="light")t="dark";var c=document.documentElement.classList;c.remove("dark","light");c.add(t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
