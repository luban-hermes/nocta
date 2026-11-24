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
| **后台** | 单管理员（`ADMIN_PASSWORD`），httpOnly 签名 Cookie 会话；分类增删改排序、书签管理、运行配置查看。访客可只读浏览（`PUBLIC_MODE`） |
| **体验** | 深空配色 + 真实星空 Canvas（星等分布、淡银河、偶发流星，DPR 上限 1.5，标签页隐藏时暂停）；明暗主题；动画只用 transform / opacity；移动端点击区域 ≥ 44px，375px 宽无横向滚动 |

## 快速开始（Docker）

```bash
docker run -d --name nocta \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_PASSWORD=change-me \
  --restart unless-stopped \
  ghcr.io/luban-hermes/nocta:latest
```

打开 <http://localhost:3000>，右上角「登录」输入密码即可开始添加。数据（SQLite）保存在 `./data/nocta.db`。

### docker compose

```bash
curl -fsSL https://raw.githubusercontent.com/luban-hermes/nocta/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/luban-hermes/nocta/main/.env.example -o .env
# 编辑 .env，至少设置 ADMIN_PASSWORD；需要 AI 就填 AI_BASE_URL / AI_API_KEY / AI_MODEL
docker compose up -d
```

镜像支持 `linux/amd64` 与 `linux/arm64`（树莓派、Apple Silicon、ARM 云主机）。容器以非 root 用户运行，启动时自动执行 `prisma migrate deploy`。

> 放在 HTTPS 反向代理（Caddy / Nginx / Traefik）后面时，请确保代理传递 `X-Forwarded-Proto`，或设置 `COOKIE_SECURE=true`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | —（必填） | 后台登录密码。修改后旧会话自动失效 |
| `SESSION_SECRET` | 由密码派生 | 会话 Cookie 签名密钥（可选） |
| `PUBLIC_MODE` | `true` | `true` 访客可浏览导航与收藏；`false` 全站需要登录 |
| `PUBLIC_MONITORS` | `false` | 访客是否可见「服务监控」（会暴露主机与 URL） |
| `DATABASE_URL` | `file:/app/data/nocta.db` | SQLite 文件路径 |
| `AI_BASE_URL` | 空 | OpenAI 兼容接口地址，如 `https://api.deepseek.com/v1` |
| `AI_API_KEY` | 空 | API Key（Ollama 可留空） |
| `AI_MODEL` | 空 | 模型名，如 `deepseek-chat`、`qwen-plus`、`gpt-4o-mini`、`qwen2.5:7b` |
| `MONITOR_SCHEDULER` | `true` | 是否启用内置 HTTP 监控调度器 |
| `MONITOR_RETENTION_DAYS` | `7` | 检查记录 / 服务器指标保留天数 |
| `ALLOW_PRIVATE_MONITORS` | `true` | 允许 HTTP 监控内网地址（家庭实验室常用）。书签抓取始终拒绝内网 |
| `COOKIE_SECURE` | 自动 | 强制 Cookie `Secure` 标记 |
| `PORT` | `3000` | 监听端口 |

AI 示例：

```env
# DeepSeek
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=sk-...
AI_MODEL=deepseek-chat
# 通义千问（DashScope 兼容模式）
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
# 本机 Ollama
AI_BASE_URL=http://host.docker.internal:11434/v1
AI_MODEL=qwen2.5:7b
```

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
cp .env.example .env            # 设置 ADMIN_PASSWORD，并把 DATABASE_URL 改成 file:./data/nocta.db
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
- 登录接口有简单的按 IP 限速；会话为 HS256 签名的 httpOnly Cookie，30 天有效。
- 探针只持有一个可随时重置的令牌，夜航从不接触 SSH 密码或私钥。

## License

[MIT](./LICENSE)
