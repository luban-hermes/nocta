<div align="center">

# 夜航 Nocta

**自托管的书签 · 网址导航 · 服务监控 · AI 助手 —— 一个 Docker 容器搞定。**

*A self-hosted bookmark manager, start page, uptime/server monitor and AI assistant in one container.*

[![docker](https://github.com/luban-hermes/nocta/actions/workflows/docker.yml/badge.svg)](https://github.com/luban-hermes/nocta/actions/workflows/docker.yml)
![license](https://img.shields.io/badge/license-MIT-8fa8ff)
![image](https://img.shields.io/badge/ghcr.io-luban--hermes%2Fnocta-8fa8ff)

</div>

> 📸 截图占位：`docs/screenshot-dark.png` / `docs/screenshot-light.png`（欢迎 PR 补上真实截图）

## 功能

| | |
|---|---|
| **三个视图** | 「站点导航」「收藏内容」「服务监控」，每个视图有自己的左侧分类栏（桌面端吸顶，移动端变为顶部横向吸顶分类条）；⌘K / Ctrl K 全局搜索站点、收藏和监控 |
| **粘贴即收藏** | 服务端抓取标题、描述、og:image、favicon（带超时 + SSRF 防护，拒绝内网地址）。**裸域名 → 站点**，**带路径的 URL → 内容**；YouTube / Vimeo 走 oEmbed |
| **AI 整理** | 任何 OpenAI 兼容接口（DeepSeek、通义千问、OpenAI、Ollama…）自动生成中文摘要、标签和分类；没配 Key 时自动降级为规则分类 |
| **HTTP 监控** | 进程内调度器按间隔检查状态码、响应时间、SSL 证书剩余天数；24 小时可用性条、响应时间曲线、状态变化记录、慢响应 / 证书将过期告警 |
| **服务器监控** | 一个只依赖 bash + curl 的推送探针（读取 `/proc`），上报 CPU / 内存 / 磁盘 / 网络；按最后上报时间判断在线 / 离线。可直接粘贴 `ssh root@203.0.113.50 -p 2222` 添加服务器，**不保存任何密码** |
| **AI 助手** | 左下角浮动按钮。粘贴网址 / SSH 命令 / API 地址 / 一句话，助手自动判断并创建对应记录，告诉你加了什么 |
| **后台** | 首次打开进入「初始化向导」设置管理员密码；分类拖动排序、书签管理（自定义下拉框、批量移动）、**系统设置**（AI、公开访问、监控、时区、密码，保存即生效，敏感项加密存储） |
| **图标** | 服务端抓取并缓存站点图标到数据卷（apple-touch-icon → manifest → `<link rel=icon>` 最大尺寸 → `/favicon.ico` → 公共图标服务兜底），不再热链；可上传图片 / 填图片地址 / 一键重新抓取 |
| **整理** | 卡片右键（手机长按）菜单：打开、新标签打开、编辑、置顶、移动到分类、复制链接、重新抓取图标、删除；站点、收藏、分类都能像手机桌面一样拖动排序 |
| **多链接站点** | 一个站点可有主链接 + 多个备用链接（如国内 / 海外线路）；在你的浏览器里检测哪个能打开，主链接打不开时左键自动打开可用的备用链接；右键「打开」列出全部链接和在线状态 |
| **S3 备份** | 设置 + 全部书签 / 分类 / 监控及历史 + 图标，备份到任意 S3 兼容存储（AWS S3 / Cloudflare R2 / MinIO / B2…）；手动或每天 / 每周定时、保留份数、一键恢复（恢复前自动再备份一次） |
| **体验** | 深空配色 + 真实星空 Canvas（星等分布、淡银河、偶发流星，DPR 上限 1.5，标签页隐藏时暂停）；明暗主题；动画只用 transform / opacity；移动端点击区域 ≥ 44px，375px 宽无横向滚动 |

## 快速开始（Docker）

只需要端口和数据卷，**不需要任何环境变量**：

```bash
docker run -d --name nocta \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  ghcr.io/luban-hermes/nocta:latest
```

打开 <http://localhost:3000>，首次访问会进入**初始化向导**：设置管理员密码（可顺便选择是否允许访客浏览）。之后 AI、公开访问、监控、时区、S3 备份都在「夜航后台 → 系统设置」里配置，保存后立即生效。

数据都在 `./data` 里：`nocta.db`（SQLite）、`icons/`（缓存的站点图标）、`secret.key`（首次启动自动生成的加密密钥，用于加密 AI Key、S3 Secret 等敏感设置——**请和数据库一起备份，丢失后需要重新填写这些密钥**）。

### docker compose

```bash
curl -fsSL https://raw.githubusercontent.com/luban-hermes/nocta/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

镜像支持 `linux/amd64` 与 `linux/arm64`（树莓派、Apple Silicon、ARM 云主机）。容器以非 root 用户运行，启动时自动执行 `prisma migrate deploy`。

> 放在 HTTPS 反向代理（Caddy / Nginx / Traefik / Cloudflare Tunnel）后面时，请确保代理传递 `X-Forwarded-Proto`，或设置 `COOKIE_SECURE=true`。直接用 `http://局域网IP:3000` 访问时 Cookie 不带 `Secure`，登录照常可用。
>
> 初始化向导只在还没有管理员密码时开放：部署到公网后请尽快打开页面完成初始化。若用 `--user` 指定 uid 运行，请先让 `./data` 归该 uid 所有。

### 忘记管理员密码

用 `-e NOCTA_RESET_PASSWORD=1` 启动一次容器，打开页面会重新进入初始化向导；设置好新密码后去掉这个变量再重启。数据不受影响。

### S3 备份

「系统设置 → 备份到 S3」：填写 Endpoint（AWS 留空）、Region、Bucket、Access Key、Secret Key、路径前缀，点「测试连接」（会验证列举 + 写入 + 删除权限）后保存。

- 备份内容：系统设置（**不含** 管理员密码、AI Key、S3 密钥）+ 全部站点、收藏、分类、监控与监控历史 + 图标文件，gzip 压缩的 JSON，文件名 `nocta-backup-YYYYMMDD-HHMMSS.json.gz`。
- 自动备份：每天或每周一的指定整点（按设置里的时区），超出「保留份数」的旧备份自动删除。
- 恢复：在备份列表点「恢复」，会先把当前数据再备份一份（`…-pre-restore.json.gz`），然后用所选备份整体替换数据。

| 服务 | Endpoint | Region | Path-style |
|---|---|---|---|
| AWS S3 | 留空 | 你的区域，如 `us-east-1` | 关 |
| Cloudflare R2 | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | `auto` | 开 |
| MinIO | `http://<ip>:9000` | `us-east-1` | 开 |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | 如 `us-west-004` | 开 |

## 环境变量（全部可选）

所有业务配置都在后台「系统设置」里。下面这些变量仍然被识别，方便老的 compose 文件平滑升级：**设置页里从未保存过的项会以环境变量为默认值**（设置页会标注「环境变量」），一旦在设置页保存，就以数据库中的值为准。

| 变量 | 说明 |
|---|---|
| `ADMIN_PASSWORD` | 旧版登录密码。没有在向导 / 设置里设过密码时仍可用它登录；设置新密码后不再使用 |
| `PUBLIC_MODE` / `PUBLIC_MONITORS` | 访客可浏览导航 / 可见监控 的默认值 |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | AI 配置的默认值 |
| `MONITOR_SCHEDULER` / `MONITOR_RETENTION_DAYS` / `ALLOW_PRIVATE_MONITORS` | 监控配置的默认值 |
| `TZ` | 时区默认值（也影响服务端日志） |
| `SESSION_SECRET` | 会话签名密钥；不设时自动生成并加密保存在数据库 |
| `NOCTA_RESET_PASSWORD` | 设为 `1` 启动一次即可清除管理员密码、重新初始化 |
| `COOKIE_SECURE` | 强制 Cookie `Secure` 标记（默认按 `X-Forwarded-Proto` 自动判断） |
| `DATABASE_URL` | SQLite 文件路径，默认 `file:/app/data/nocta.db` |
| `PORT` | 监听端口，默认 `3000`（健康检查跟随此值） |

## 服务器探针

1. 在「+ 添加 → 服务器」或 AI 助手里粘贴 `ssh root@203.0.113.50 -p 2222`（只记录主机、端口、用户，**不需要也不保存密码**）。
2. 夜航会给出一行安装命令（每台服务器一个独立令牌），登录服务器执行：

```bash
curl -fsSL https://nav.example.com/api/agent/script | sudo bash -s -- install --server https://nav.example.com --token nct_xxxxxxxx
```

- 安装为 systemd 服务 `nocta-agent`（`DynamicUser`，无需 root 运行），每 30 秒上报一次；无 systemd 时后台运行。
- 只依赖 `bash`、`curl`、`awk`，读取 `/proc/stat`、`/proc/meminfo`、`/proc/net/dev`、`df`。
- 手动测试：`bash agent/nocta-agent.sh run --server URL --token TOKEN --once`
- 卸载：`sudo nocta-agent uninstall`（或 `sudo bash nocta-agent.sh uninstall`）
- 在详情抽屉里可以「重置令牌」，旧探针立即失效。

上报接口：`POST /api/agent/report`，`Authorization: Bearer <token>`，JSON 字段 `cpu, mem_total, mem_used, disk_total, disk_used, rx_rate, tx_rate, load, uptime, hostname, os, kernel`。

## 本地开发

```bash
git clone https://github.com/luban-hermes/nocta && cd nocta
echo 'DATABASE_URL=file:../data/nocta.db' > .env   # 其余配置首次打开后在「系统设置」里填
npm install
npx prisma migrate deploy       # 创建数据库
npm run db:seed                 # 可选：写入几条示例数据
npm run dev                     # http://localhost:3000
```

常用命令：`npm run build`、`npx tsc --noEmit`、`npx prisma studio`。

技术栈：Next.js 15（App Router、`output: "standalone"`）· TypeScript · Tailwind CSS · Framer Motion · shadcn 风格组件 · Prisma + SQLite · jose。

目录：

```
src/app            页面与 API 路由（/api/add、/api/assistant、/api/monitors、/api/agent/report …）
src/components     界面组件（星空、卡片、抽屉、⌘K、AI 助手…）
src/lib            抓取 + SSRF 防护、AI 客户端、分类规则、监控与调度器、鉴权
prisma             数据模型、迁移、示例数据
agent              nocta-agent.sh 服务器探针
```

## 路线图

- [ ] PostgreSQL 支持：把 `prisma/schema.prisma` 的 `provider` 改为 `postgresql`、`DATABASE_URL` 指向 Postgres，重新生成迁移即可（模型已按可迁移方式设计，标签用逗号字符串存储）
- [ ] pgvector 语义搜索：为收藏内容生成 embedding，⌘K 支持「上个月存的讲 React 性能的那篇」这类自然语言搜索
- [ ] 告警通知（Webhook / Telegram / 企业微信 / 邮件）
- [ ] 浏览器扩展一键收藏、书签 HTML 导入导出
- [ ] 失效链接定期检测、网页快照
- [ ] TCP / Ping / 关键字监控，公开状态页

## 安全说明

- 书签抓取对每一跳重定向都做 DNS 解析并拒绝私有、回环、链路本地、元数据地址，限制 8 秒超时与 768KB 响应体。
- 登录接口有简单的按 IP 限速；会话为 HS256 签名的 httpOnly Cookie，30 天有效；修改密码后其他会话全部失效。
- 管理员密码以 scrypt 哈希保存；AI Key、S3 Secret 等敏感设置用 AES-256-GCM 加密保存，密钥是数据卷里自动生成的 `secret.key`（权限 600），界面和 API 只返回掩码。
- 图标抓取同样走 SSRF 防护并校验图片内容；SVG 图标带 `Content-Security-Policy: sandbox` 返回。
- 探针只持有一个可随时重置的令牌，夜航从不接触 SSH 密码或私钥。

## License

[MIT](./LICENSE)
