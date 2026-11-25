# fix/v0.3.1 开发记录

> 分支：`fix/v0.3.1`（只推分支，CI 不构建镜像）。全部验证通过后**一次性**推到 `main`（一次 CI 构建 → 一个新镜像），随后删除分支；本文件留作记录。版本号 0.3.0 → 0.3.1。

## 目标

| # | 问题 | 状态 |
|---|------|------|
| 1 | 站点卡片少于列数时整行被居中 → 改为从左往右排，1–2 张卡也靠左 | ✅ 完成 |
| 2 | 悬停站点卡片上浮时，卡片顶部和阴影被上方区域「切平」 | ✅ 完成 |

## 原因与改动

### 1 · 网格一律靠左
- v0.3.0（第 12 条）里 `SiteGrid` 在「卡片数 < 列数」时会把列模板改成 `repeat(n, 固定宽)` 并 `justify-content:center`，于是短行被居中。
- `src/components/NoctaApp.tsx`：`SiteGrid` 去掉测量与内联样式，回到普通 `auto-fill` 网格。`auto-fill` 本身会保留空列，所以卡片仍是正常尺寸，不会被拉伸。
- `src/app/globals.css`：`.sites` 显式写 `justify-content:start`。
- 其他网格已检查：收藏内容瀑布流（按列轮转，第 1 列在最左）、服务监控网格（`auto-fill`）都不会把短行居中，无需改动；测试里也一并断言。

### 2 · 悬停上浮不再被裁切
- 根因：`.sites{content-visibility:auto}` 带来绘制包含（paint containment），子元素超出 `.sites` 盒子的部分不会被绘制。第一行卡片悬停时上浮约 6px，顶边（含圆角）和左右/最后一行下方的阴影都被切掉。
- `src/app/globals.css`：从 `.sites` 去掉 `content-visibility` / `contain-intrinsic-size`（这个网格总在首屏，原本也省不了渲染）。拖动浮层本来就 portal 到 `<body>`，不依赖它。
- 悬停的卡片加 `position:relative; z-index:2`（站点、瀑布流、监控），阴影不会被后面的兄弟卡片盖住。
- 顺带修复：服务监控卡片的悬停上浮其实一直不生效 —— framer-motion 入场动画结束后在元素上留下内联 `transform`，覆盖了 CSS `:hover` 的 `translateY(-4px)`。`src/components/Cards.tsx`：入场动画移到外层 `motion.div.x-mon-wrap`，`article.x-mon` 自己保留 CSS 悬停效果；`.x-mon-wrap` 用 flex 让同一行卡片等高。
- 祖先链检查：卡片到 `<body>` 之间已不存在 `overflow≠visible` / `contain:paint` / `content-visibility` 的元素（`html`/`body` 的 `overflow-x:clip` 只作用于视口边缘，不影响上浮）。

## 验证

- `npx tsc --noEmit` ✅，`npm run build` ✅
- Playwright（headless Chromium）脚本 `v031.mjs`，测试库：20 个站点、4 条收藏、7 个监控，宽度 1440 / 1920 / 375：
  - `.sites` 无内联样式、`justify-content:start`、`content-visibility:visible`、`contain:none`；首张卡片左边 = 网格左边。
  - 只有 1 张（设计）、2 张（开发）卡片的分类：卡片贴左，宽度保持正常（1440：133px；375：108px），未被拉伸。
  - 真实鼠标悬停：第一行第一张、第一行最后一张、最后一行第一张、最后一张站点卡；收藏内容第一张 / 最后一张；监控第一张 / 最后一张。每次都确认卡片确实上浮（站点 ≈5.6px、内容 5px、监控 4px），并按 `box-shadow` 计算出的阴影范围与每个会裁切的祖先矩形比较 —— 全部 30 次悬停均无裁切祖先。第一行卡片悬停时顶边高于网格顶边（说明上浮部分被绘制出来）。
  - 反向对照：把 v0.3.0 的 `content-visibility:auto` 重新注入后，同一张卡上浮 5.4px 越过网格顶边，截图里顶边被切平 —— 证明测试能抓到这个问题。
  - 拖动：后台登录后拖动第 1 张站点卡到第 3 张，浮层挂在 `<body>` 下、包含 `.site`，松手后顺序已保存，没有打开新标签页。
