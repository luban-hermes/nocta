/**
 * Optional demo data for local development: `npm run db:seed`.
 * Production never runs this — a fresh install only gets the default (empty) categories.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATS = {
  site: [["常用", "★"], ["开发", "⌘"], ["设计", "◐"], ["AI 工具", "✦"], ["影音", "▶"]],
  content: [["文章", "¶"], ["视频", "▶"], ["仓库", "⌥"], ["帖子", "❝"], ["稍后读", "◷"]],
} as const;

const SITES: [string, string, string][] = [
  ["GitHub", "https://github.com", "开发"],
  ["MDN", "https://developer.mozilla.org", "开发"],
  ["Figma", "https://www.figma.com", "设计"],
  ["Dribbble", "https://dribbble.com", "设计"],
  ["DeepSeek", "https://chat.deepseek.com", "AI 工具"],
  ["Hugging Face", "https://huggingface.co", "AI 工具"],
  ["Bilibili", "https://www.bilibili.com", "影音"],
  ["V2EX", "https://www.v2ex.com", "常用"],
];

async function main() {
  for (const kind of ["site", "content"] as const) {
    for (const [i, [name, icon]] of CATS[kind].entries()) {
      await prisma.category.upsert({ where: { kind_name: { kind, name } }, update: {}, create: { kind, name, icon, sort: i } });
    }
  }
  const cats = await prisma.category.findMany();
  const cid = (kind: string, name: string) => cats.find((c) => c.kind === kind && c.name === name)?.id ?? null;
  if ((await prisma.site.count()) === 0) {
    for (const [name, url, cat] of SITES) {
      await prisma.site.create({ data: { name, url, favicon: `${new URL(url).origin}/favicon.ico`, categoryId: cid("site", cat) } });
    }
  }
  if ((await prisma.content.count()) === 0) {
    await prisma.content.create({
      data: {
        url: "https://github.com/vercel/next.js",
        title: "vercel/next.js: The React Framework",
        summary: "Next.js 官方仓库，基于 React 的全栈框架，支持 App Router、服务端组件与流式渲染。",
        domain: "github.com",
        favicon: "https://github.com/favicon.ico",
        type: "repo",
        tags: "Next.js,React,开源",
        categoryId: cid("content", "仓库"),
      },
    });
  }
  if ((await prisma.monitor.count()) === 0) {
    await prisma.monitor.create({ data: { kind: "http", name: "GitHub API", url: "https://api.github.com/zen", interval: 120 } });
  }
  console.log("seeded ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
