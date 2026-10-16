# MediaHub

**缝合大师，一款0人工作品。**

基于网盘的动漫和电影的自动化路线，一般是：

`ani-rss` + `moviePolit(tgToDriver)` + `pansoou` + `openlist` + `emby`。

我部署了这么一堆东西，太过于杂乱了，原理又不复杂，所以就让ai写了一个。

我本身是搞java的，没啥审美技术又一般，所以就让ai，用shadcn（react） + go写的。

我其实不知道模仿其他人的代码，侵权不侵权，假如侵权，可以通知我，我隐藏起来。

**项目正在持续开发，欢迎试用、反馈问题和参与二次开发。** 当前已提供基础业务功能，完整自动化流程和使用体验还在完善。

## 能做什么

| 功能 | 你可以用它做什么 |
| --- | --- |
| 影视探索 | 浏览 TMDB、豆瓣、Bangumi、AniList 等来源的作品，按类型、地区、年份和评分等条件寻找想看的内容；具体筛选能力随来源不同 |
| 作品详情与榜单 | 查看简介、评分、海报和演职员信息，通过榜单发现作品，并从详情进入资源搜索 |
| 网盘资源搜索 | 使用内置 PanSou 聚合搜索资源，按网盘类型查看结果、复制分享链接，并调整搜索来源 |
| 电视剧订阅 | 从 TMDB 电视剧卡片或详情订阅指定季，可互斥选择直接 TG 频道或 PanSou；按播出日搜索，未找到每天补查，找到后等待下一集，可设置资源正则，优先选择 115 分享，其次磁力，同类取标注体积最大的资源 |
| 追剧日历 | 按北京时间查看订阅剧集的播出日期、资源命中情况，支持暂停、规则编辑与手动检查 |
| 动漫订阅 | 添加 RSS 订阅，配置字幕组、匹配规则和集数范围，查看发现的资源、更新进度，手动刷新或暂停订阅 |
| 115 下载与转存 | 提交离线下载，读取 115 分享目录并选择文件转存，查看任务状态及失败原因 |
| 媒体整理 | 配置未整理目录和目标目录，预览后执行整理，按规则改名、直接移动文件，并清理空文件夹；支持 Cron 定时整理 |
| Emby 看板 | 连接自己的 Emby，查看媒体库概况、最近添加和继续观看内容 |
| 中文业务日志 | 查看添加订阅、刷新、下载、转存和整理的操作与结果，支持筛选、搜索和导出 |
| 账号与设置 | 创建自己的管理员账号，集中管理服务连接、搜索配置和 API 密钥；敏感凭证在服务端加密保存 |

搜索支持多个网盘来源，当前下载、分享转存和整理主要围绕 **115** 实现。服务连接需要填写对应配置，实际结果也取决于来源可用性和服务器网络。

## 页面预览

点击缩略图可打开原图查看。

| 影视探索 | 作品详情 |
| :---: | :---: |
| [<img src="docs/images/discover.png" alt="影视探索" width="360">](docs/images/discover.png) | [<img src="docs/images/media-detail.png" alt="作品详情" width="360">](docs/images/media-detail.png) |
| 浏览多来源影视与动漫作品 | 查看作品资料、演职员并搜索资源 |

| 资源搜索 | 动漫订阅 |
| :---: | :---: |
| [<img src="docs/images/resource-search.png" alt="资源搜索" width="360">](docs/images/resource-search.png) | [<img src="docs/images/anime-subscriptions.png" alt="动漫订阅" width="360">](docs/images/anime-subscriptions.png) |
| 聚合搜索网盘资源，按网盘分类查看 | 跟踪新集数，配置字幕组与匹配规则 |

| 中文业务日志 | 全局设置 |
| :---: | :---: |
| [<img src="docs/images/business-logs.png" alt="中文业务日志" width="360">](docs/images/business-logs.png) | [<img src="docs/images/settings.png" alt="全局设置" width="360">](docs/images/settings.png) |
| 筛选、搜索和导出业务操作记录 | 统一管理服务连接、搜索来源和通知 |

| 账号登录 |
| :---: |
| [<img src="docs/images/login.png" alt="账号登录" width="360">](docs/images/login.png) |
| 首次部署创建管理员账号，之后使用该账号登录 |

截图来自开发版本，部分页面仍显示旧名称 FRAME，界面和功能会随版本更新。

## Docker 部署

前后端已经打包到一个镜像中，使用 Docker Compose 即可启动。

```yaml
services:
  media-center:
    image: ghcr.io/a3318375/mediahub:latest
    ports:
      - "5173:18080"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

仓库根目录已有 `docker-compose.yml`。取得该文件后，在所在目录执行：

```sh
docker compose pull
docker compose up -d
```

打开 `http://服务器IP:5173`，创建管理员账号即可进入系统。服务器的 5173 端口需要可访问；如端口已被占用，修改映射左侧的端口。

### 开始使用

1. 在全局设置中配置需要使用的服务：TMDB、Emby 和 115 可以按需填写。
2. 从影视探索或资源搜索开始查找作品与资源。
3. 使用动漫订阅跟踪新集数，配置规则和下载范围。
4. 在媒体整理中选择未整理目录与目标目录，先预览，再执行；需要自动整理时填写 Cron。
5. 在下载记录和日志中心查看处理进度与结果。

账号、订阅、任务、配置和加密密钥都保存在挂载的 `./data` 中。升级或迁移时保留整个目录，不要只复制数据库；两个实例不要同时使用同一个数据目录。

### 电视剧订阅

从 TMDB 电视剧卡片或详情订阅指定季，选择一种资源来源：

- **TG 频道**：填写公开频道用户名或 `https://t.me/频道名`，直接搜索公开消息，支持有界历史翻页；不通过 PanSou，也不在失败时自动回退。当前不接入私有频道账号。
- **PanSou**：使用全局搜索来源设置，不使用订阅专用频道。切换来源会清除原来源候选并重新检查。

系统按北京时间和 TMDB 本季播出日期检索资源：到期缺集每天补查，找到后等待下一集；日期未知时每日补查，全部命中后仍低频检查排期变化。调度和候选持久化保存，重启不会重置为高频搜索。

资源优先选择 115 分享，其次磁力，同类按文本声明体积择优。`更05集`、`全8集` 等表示合集声明范围，日历命中不代表文件已核验或下载完成；合集下载仍需通过公共流程选择文件。

### 榜单推荐

通过来源网站图标选择榜单，作品统一展示为海报卡片，可打开详情、搜索资源或订阅电视剧。Netflix、Disney+、Prime Video 等常用平台在当前地区可用时直接显示为一级图标入口，其余平台可从“更多平台”选择。

- TMDB：电影与剧集的今日/本周趋势、热门、高分，以及正在/即将上映电影、今日/近期播出剧集。
- 豆瓣：电影 Top 250、热门剧集。
- AniList：人气、趋势与高分动画。
- Bangumi：动画排名、按北京时间选择当日星期的放送表。
- 流媒体：按地区读取 TMDB 平台列表与网站图标，支持电影/剧集及订阅、免费、含广告、租借、购买筛选；作品按 TMDB 热度排序，可观看性数据来自 JustWatch。

榜单目前展示前 20 部作品，今日放送展示当日条目。榜单服务端缓存 1 小时，放送表缓存 30 分钟并按日期隔离，平台列表按地区和内容类型缓存 24 小时；页面内切换复用 5 分钟缓存。缓存仍使用现有内存机制，重启后重新获取。重新读取会复用有效的服务端缓存。

### 更新版本

```sh
docker compose pull
docker compose up -d
```

镜像若为私有，需要先使用具备读取权限的账号执行 `docker login ghcr.io`。

## 当前还在做

- **Telegram 通知**：配置保存和消息发送已经验证，正在接入下载、转存、整理完成或失败的自动通知，以及页面测试入口。
- **115 操作体验**：优化目录选择速度，减少重复读取和等待，继续完善状态提示。
- **界面完善**：逐步统一 MediaHub 品牌与页面文案。

设置页面出现某个选项，不代表对应功能已完整接入。当前以实际可执行的业务流程为准，开发进度会继续更新。

## 参与开发

### HeroUI 新前端

`hero/` 是独立的 Vite + React + TypeScript + HeroUI v3 项目，参考 [HeroUI Dashboard 模板](https://heroui.com/en/themes?template=dashboard) 的侧栏、卡片与配色。首页已替换为 MediaHub 业务总览；原始图表和员工表格原型保留在 `/?template=dashboard`，便于对照。

新界面已提供影视探索、作品详情、网站与平台榜单、资源搜索、电视剧订阅、追剧日历和下载记录。筛选使用 Tab，影视使用海报卡片；榜单区展示来源网站图标，平台目录及图标在服务模式下动态获取。平台片库按 TMDB 热度排序，并非平台官方 Top 10。浏览结果缓存 5 分钟、平台目录缓存 24 小时，最多 80 项，退出时清空。

```sh
cd hero
pnpm install --frozen-lockfile
pnpm dev
```

访问 `http://127.0.0.1:5174/`。点击 **Use demo account** 填入账号，再点击 **Sign in**；演示账号为 `kate@acme.com`，密码为 `heroui123`。默认无需后端，示例影视和分享链接均标明为演示资料；订阅修改与演示下载记录保存在当前浏览器，不会执行真实资源搜索或下载。支持记住演示登录、退出、浅色/暗色主题和手机布局。字体、头像和基础来源图标保存在项目内。

登录页点击 **连接已有 MediaHub 服务** 可使用原管理员账号连接真实 API；服务登录只保存在当前标签页。Vite 默认将 `/api` 代理至 `http://127.0.0.1:18080`，可在 `hero/vite.config.ts` 调整目标。服务模式接口失败会显示错误，不会混入演示结果。已有 TG / PanSou 调度与缓存策略保持由 Go 后端负责。资源搜索支持链接复制、115 整份分享转存和磁力离线任务；逐文件转存、动漫 RSS、媒体整理、Emby 专属页面、服务凭证配置及业务日志暂继续使用 `web/`。Docker 默认入口已切换为 HeroUI 前端。

`pnpm build` 执行类型检查并生成静态产物；`pnpm test` 检查缓存隔离、并发去重、API 错误、搜索契约与独立演示模式。

### 现有应用

前后端放在同一个仓库，方便一起修改和构建：

```text
MediaHub/
├── web/                  # React 前端
├── hero/                 # HeroUI 新前端与独立原型
├── api/                  # Go 后端
│   └── third_party/pansou/ # PanSou 子模块
├── docs/                 # 项目文档与 README 截图
├── Dockerfile
├── docker-compose.yml
└── README.md
```

```sh
git clone --recurse-submodules https://github.com/a3318375/MediaHub.git
cd MediaHub
```

Windows 本地开发，分别打开两个终端：

```powershell
# 后端
cd api
./scripts/dev.ps1
```

```sh
# 前端
cd web
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

前端默认把 API 请求转发到 `127.0.0.1:18080`，本地开发数据保存在仓库根目录 `data/`。默认连接真实后端，演示模拟模式需显式设置 `VITE_ENABLE_MOCKS=true`。

本地构建合并镜像，在仓库根目录执行：

```sh
docker build -f Dockerfile --build-context hero=./hero -t mediahub:local ./api
docker run --rm -p 5175:18080 -v mediahub-test-data:/data mediahub:local
```

此试运行使用独立数据卷，访问 `http://localhost:5175`。推送 `main` 时，只有最新提交信息包含 `[build]` 才会构建并发布 `latest` 和提交版本镜像；普通推送跳过构建。也可在 Actions → Build Docker image → Run workflow 手动发布。

## 致谢

资源搜索基于 [PanSou](https://github.com/fish2018/pansou)，项目通过固定版本的 fork 子模块集成。115 接口适配使用 [115driver](https://github.com/SheltonZhu/115driver)，前端使用 React、Vite 和 shadcn/ui。

TMDB、豆瓣与 AniList 图标来自 [Simple Icons](https://simpleicons.org/)，Bangumi 图标来自其[官方客户端仓库](https://github.com/bangumi/Bangumi-iOS)。品牌标识归各自所有。
