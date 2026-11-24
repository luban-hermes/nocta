# feat/batch-1 开发记录

> 分支：`feat/batch-1`（只推分支，CI 不构建镜像）。全部完成并验证后已**一次性**合并到 `main`（一次 CI 构建 → 一个新镜像），分支随后删除；本文件留作记录。版本号 0.1.0 → 0.2.0。

## 目标

一次发布完成 backlog 的 1–8 条：

| # | 需求 | 状态 |
|---|------|------|
| 2 | 统一下拉框（自定义 Select） | ✅ 完成 |
| 3 | 去掉原生 alert/confirm/prompt（ConfirmDialog / Toast / 输入弹窗） | ✅ 完成 |
| 6 | 图标服务端抓取缓存 + 自定义图标 + 界面图标全部换 lucide | ✅ 完成 |
| 7 | 宽屏铺满 + 字体兜底（不再出现衬线体） | ✅ 完成 |
| 8 | 去掉卡片「三个点」，右键 / 长按上下文菜单 | ✅ 完成 |
| 1 | 拖拽排序（后台分类、首页站点、内容卡片、左侧分类栏） | ✅ 完成 |
| 4 | 所有配置进后台「设置」，首次启动向导，docker run 只需端口 + 数据卷 | ✅ 完成 |
| 5 | S3 兼容存储备份 / 恢复 | ✅ 完成 |

## 各项改动

### 2 · 自定义 Select
- `src/components/ui/select.tsx`：按钮 + Portal 浮层（`role=listbox`），贴边自动翻转（`ui/floating.ts` 的 `place()`），键盘 ↑↓ / Home / End / 首字母跳转 / Enter / Space / Esc / Tab，触屏可用，framer-motion 只动 transform/opacity。
- `ui/input.tsx` 删掉原生 `<select>`，改为 re-export 新 Select；`Field` 从 `<label>` 改为 `<div role=group>`（避免 label 激活二次点击自定义控件）。
- 全站使用处：抽屉（分类 / 置顶 / HTTP 方法）、后台书签表格分类、后台分类图标选择。

### 3 · 自家弹窗
- `src/components/ui/dialog.tsx`：`useDialog().confirm({title,message,danger})` / `.prompt({...})` 返回 Promise；危险操作红色确认按钮且默认聚焦「取消」；Esc（捕获阶段，不会连带关闭抽屉）/ 点遮罩取消；Tab 焦点锁定；关闭后焦点还原。
- `ui/toast.tsx`：`toast(text, "ok" | "error" | "info")`，lucide 图标，错误提示停留更久。
- `UIProvider` = Toast + Dialog，首页与后台都包了一层。
- 6 处原生 `confirm()` 全部替换（`grep -rn "confirm(\|alert(\|prompt(" src` 只剩 `dialog.confirm`）。

### 6 · 图标
- 新 `src/lib/icons.ts`：服务端抓取 → 校验魔数（png/jpg/gif/webp/ico/svg）→ 存 `<数据卷>/icons/`。候选顺序：页面声明的 `<link rel=icon|apple-touch-icon>`（取最大，SVG 优先）、manifest icons、`/apple-touch-icon.png`、`/favicon.ico`，都不清晰（<32px）时用 Google s2 / DuckDuckGo 公共图标服务兜底。全部走 `safeFetch` 的 SSRF 防护。
- 同域名共享一个文件 `h_<sha1(host)>.<ext>`；自定义图标 `u_<id>_<rand>.<ext>`。
- `GET /api/icon/:kind/:id` 提供图片（长缓存 + `?v=` 版本号，SVG 带 CSP sandbox）；`POST` 同路径（管理员）：multipart 上传 / `{url}` 指定图片地址 / `{refetch:true}` 重新抓取。
- 添加书签时同步抓取（最多等 7 秒）；启动 3 秒后和每小时后台补抓（`backfillIcons()`，3 并发，按域名去重）。
- 前端 `Tile` 只用缓存图标，文字首字母仅在完全没有图标时出现；抽屉里新增「图标」编辑器（上传 / 地址 / 重新抓取）。
- 界面字符图标（¶ ⌥ ❝ ◷ ▶ ✦ ⚠ ↓ ↑ ← + …）全部换成 lucide-react；分类图标改存 lucide 名称（`src/components/Icons.tsx` 的 `CATEGORY_ICONS`，旧字符由迁移 + `LEGACY_GLYPHS` 映射）。

### 7 · 宽屏 + 字体
- `.app` / 顶栏 `max-width` 1440 → 2200；≥1800px 时站点卡片和侧栏略放大。
- 收藏内容瀑布流从 CSS columns 改为 JS 计算列数（ResizeObserver，最小列宽 290px）+ 按阅读顺序轮流分配，修复「只排两列右边空着」（CSS columns 平衡会留空列）。
- 字体栈：自托管 Inter Variable（拉丁）→ 系统中文无衬线（PingFang / 冬青 / 微软雅黑 / Noto Sans SC / 思源黑体…）→ 自托管 Noto Sans SC Variable（按 unicode-range 切片，只有系统缺字时才下载）→ `sans-serif`。按钮 / 输入框 / 标题显式继承。Tailwind `fontFamily.sans` 指向同一变量。

### 8 · 右键菜单
- `src/components/ui/context-menu.tsx`：`ContextMenu` + `useLongPress`。菜单贴边翻转、Esc / 点外部 / 滚动关闭、键盘 ↑↓ Home End Enter，→ 进入「移动到分类」子菜单，← 返回；Shift+F10 / ContextMenu 键也能打开。
- 站点：打开 / 新标签页打开 / 复制链接（访客也有）；管理员另有 编辑 / 置顶 / 移动到分类 / 重新抓取图标 / 删除（走 ConfirmDialog）。内容卡片同理，并新增内容置顶。
- 移除卡片悬停「三个点」按钮及其样式。
- 触屏：长按不动 ≈0.5s 弹菜单（同时取消已拿起的拖拽）；长按后移动 = 拖拽；轻点照常打开。

### 1 · 拖拽排序（@dnd-kit）
- `src/components/ui/sortable.tsx`：`SortList` / `SortItem`。鼠标拖动 6px 起拖；触屏按住 200ms 拿起（之前移动则视为滚动）；键盘 Space 拿起、方向键移动、Space 放下、Esc 取消。拖拽后吞掉随后的 click，链接不会被误打开。
- 用于：首页站点卡片、收藏内容卡片（瀑布流）、左侧分类栏（全部/未分类固定不动）、后台分类管理（左侧把手拖动，删掉了上下移动按钮）。
- 乐观更新 + `POST /api/reorder {kind:"site"|"content"|"category", ids}` 持久化（每项 `sort` = 下标）。筛选视图里拖动时只重排可见子集，其他项相对位置不变。置顶项始终排在最前。
- 只有管理员能拖动、看到编辑类菜单项；访客只有打开 / 复制。

### 4 · 配置全部进数据库 + 初始化向导
- 新表 `Setting(key, value JSON, updatedAt)`；`src/lib/settings.ts` 定义所有设置项（`DEFS`：访问、AI、监控、时区、S3、备份计划），内存缓存放在 `globalThis`（各路由 bundle 共享），保存即失效 → **即时生效，无需重启**。
- 优先级：设置页保存过的值 › 环境变量（仅作为旧部署的默认值）› 内置默认值；设置页对来自环境变量的项标注「环境变量」。
- 敏感项（AI Key、S3 Secret、会话签名密钥）用 AES-256-GCM 加密（`src/lib/secret.ts`），密钥首次启动自动生成到 `<数据卷>/secret.key`（600 权限）；API / 界面只返回掩码。
- 管理员密码：scrypt 哈希存 `auth.passwordHash`。无密码且无 `ADMIN_PASSWORD` 时所有页面跳转 `/setup` 初始化向导（`POST /api/setup` 只在未初始化时可用）。旧的 `ADMIN_PASSWORD` 在设置新密码前继续可用。修改密码：`POST /api/auth/password`（需当前密码，其他会话全部失效）。忘记密码：`NOCTA_RESET_PASSWORD=1` 启动一次。
- 会话签名密钥不再由密码派生：`SESSION_SECRET` 或自动生成（升级后需重新登录一次）。
- 设置页 `src/components/SettingsPanel.tsx`：访问与显示 / AI（服务商快速填写、测试连接）/ 服务监控 / 备份到 S3 / 管理员密码 / 退出登录；全部使用新 Select / Switch / ConfirmDialog / Toast。
- 调度器常驻，每个 tick 读取设置（关闭「自动检查」即暂停 HTTP 检查，不用重启）。
- README、docker-compose.yml、.env.example、docker-entrypoint.sh 已精简：`docker run -p 3000:3000 -v ./data:/app/data` 即可。

### 5 · S3 备份
- `src/lib/backup.ts`（`@aws-sdk/client-s3`，兼容 AWS / R2 / MinIO / B2，可选 Path-style，关闭新版默认校验和以兼容 R2/MinIO）。
- 备份 = gzip JSON：可迁移的设置（不含密码 / 密钥 / S3 配置本身）+ categories / sites / contents / monitors / checks / metrics 全表 + 用到的图标文件（base64）。文件名 `nocta-backup-YYYYMMDD-HHMMSS.json.gz`，放在「路径前缀」下。
- 「测试连接」：List + Put + Delete 探针对象，错误码翻成中文（Bucket 不存在、签名不匹配、无权限、Region 不匹配…），可用未保存的表单值测试。
- 手动备份 `POST /api/backup`；列表 + 上次状态 `GET /api/backup`；恢复 `POST /api/backup/restore {key}`：先自动备份当前数据（`-pre-restore`），再在一个事务里清空并导入，写回图标，应用可迁移设置。
- 定时：每天 / 每周一的指定整点（按设置时区），由调度器触发，按天去重（`backup.slot`），完成后按「保留份数」删除旧备份。

## 数据库迁移

- `prisma/migrations/20261124130000_settings`：新表 `Setting`
- `prisma/migrations/20261124120000_batch1_icons_sort`
  - Site / Content：`iconFile`、`iconCustom`、`iconCheckedAt`
  - Content：`pinned`、`sort`（+ 索引）；按现有顺序回填 Site/Content/Category 的 `sort`
  - Category.icon 旧字符 → lucide 名称

## 新依赖

`lucide-react`、`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`、`@fontsource-variable/inter`、`@fontsource-variable/noto-sans-sc`、`@aws-sdk/client-s3`（第 5 条用）

## 环境变量

- 全部变为可选，旧变量只作为「从未在设置页保存过」时的默认值（见 README）。
- 新增：`NOCTA_RESET_PASSWORD`（=1 启动一次清除管理员密码）、`NOCTA_DATA_DIR`（数据目录，默认取 SQLite 文件所在目录 `/app/data`）。
- 数据卷新增内容：`icons/`（图标缓存）、`secret.key`（加密密钥，需与数据库一起保管）。

## 如何测试

```bash
npm ci && npx prisma generate
npx tsc --noEmit && npm run build
# 以 standalone 方式起服务（数据目录随意）
DATABASE_URL=file:/tmp/nocta/nocta.db ADMIN_PASSWORD=test1234 PORT=3201 node .next/standalone/server.js
```

第 4/5 条：用全新数据目录、不带 `ADMIN_PASSWORD` 启动 → 自动进入 `/setup`；S3 可用 `python3 -m moto.server -p 9200` 本地模拟（先用 SDK 建 bucket），Endpoint 填 `http://127.0.0.1:9200`、Path-style 开。

手动检查：右键站点/内容卡片、长按（手机）、拖动卡片与分类、后台分类管理拖动、抽屉里的下拉框与图标编辑、删除确认弹窗、2200px 宽屏下内容区铺满。项目内用 Playwright 在 1440 / 2200 / 375 三种宽度跑过全部流程（无控制台错误）。

## 已知问题 / 备注

- 瀑布流按列渲染，DOM 顺序是「按列」的，Tab 键焦点顺序与视觉阅读顺序不完全一致（拖拽 / 菜单不受影响）。
- 把未置顶项拖到置顶项前面后，刷新会回到置顶项之后（置顶优先）。
- 封面图（og:image）仍是直接外链，不在本批范围。
- `gh_push.py` 基于 base tree 上传，不会删除远端文件；本批没有删除文件。
- 备份不含密钥：在新机器上恢复后需重新填写 AI Key（S3 配置本来就要先填才能列出备份）。
- 初始化向导在未设置密码时对任何访客开放（同类自托管应用的通行做法），公网部署后应尽快完成初始化；README 已提示。
- 升级后旧的登录会话失效（会话签名密钥改为随机生成），需要重新登录一次。
