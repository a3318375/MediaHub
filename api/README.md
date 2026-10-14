# Media Center API

面向影视和动漫检索、订阅、115 网盘下载与整理的媒体中心后端。项目目标是整合 ani-rss、tgtodriver 与 PanSou，在统一认证、作品身份和任务状态下串联“发现作品 → 查找资源 → 订阅更新 → 下载/转存到 115 → 整理媒体文件”。

当前以 Gin 单体、SQLite 持久化和进程内 PanSou 为基础，按模块逐步接入。订阅、下载与整理是目标链路，不代表当前已经具备完整闭环。

## 集成职责与目标边界

| 模块 | 职责与状态 |
| --- | --- |
| 媒体元数据 | 已有 TMDB、豆瓣、Bangumi、AniList 适配器及 discovery 服务；实际能力以 provider capabilities、凭证与上游可用性为准 |
| PanSou | 已有进程内基础资源搜索，通过本地 DTO 与系统鉴权暴露；上游由子模块固定版本 |
| ani-rss 参考逻辑 | 在 Go 内独立实现 Mikan/RSS 添加、规则预览与订阅持久化，不运行额外 ani-rss 服务；自动更新任务后续接入 |
| tgtodriver | 下载、转存至 115 及文件处理链路的集成目标；具体项目版本、API 和执行职责待对接确认 |
| 115 与整理 | 已有配置存储；当前没有真实下载、转存与整理任务 API |
| Emby | 已有看板与图片接口，依赖真实站点配置 |

媒体中心负责业务协调、配置与凭证、作品关联及可查询任务状态；上游适配层负责协议转换。路由做鉴权与输入校验，业务服务负责调度和幂等，存储层负责持久化。前端只提交意图并展示状态，上游凭证与文件操作保留在后端。

后续需要确定订阅、资源、下载任务与整理任务的身份和状态，明确重复集数、重试、取消、目标目录冲突和失败处理。PanSou 的资源命中或链接有效不等于可直接转存到 115；不同来源需要各自确认下载通路。

## 当前版本与前端兼容（2026-10-13）

本机后端已同步至 `fdb6545`，与前端 `14e1c67` 的资源接口匹配；PanSou 子模块固定为 `d748770a9d64d6e42f1d9860faa0e6bd08f20522`。

资源路由包括 `GET /api/v1/resources/meta`、`POST /api/v1/resources/search` 和 `POST /api/v1/resources/check`，支持网页会话和集成 API Key。搜索请求接收 query、source、cloudTypes、plugins、channels、mode 和 refresh，未指定的选择读取保存配置；返回 `{data: {total, items, linksByCloud}}`，错误使用 `{error}`。元数据返回默认值、保存的选择及实际可用来源；检测请求使用 items，响应使用 results。原始 PanSou 管理接口不直接暴露。

## 模块目录与检查

- `cmd/server`：启动、数据目录、HTTP 服务及退出流程。
- `internal/httpapi`：认证、配置、日志、媒体和 Emby 路由。
- `internal/discovery`、`internal/media`：媒体能力、查询、缓存及正式 DTO。
- `internal/providers`、`internal/tmdb`：元数据适配与上游请求。
- `internal/pansoubridge`：PanSou 生命周期、搜索适配和本地接口。
- `internal/store`：SQLite、会话、配置、凭证加密与日志。
- `third_party`、`scripts`：固定上游版本、嵌入补丁和更新工具。

```powershell
go test ./...
go vet ./...
go build ./...
```

同步后已通过 `go test ./...`、`go vet ./...` 和 `go build ./...`；未执行真实浏览器或真实上游验收。下文保留既有认证和 TMDB 契约说明，其中带日期的测试记录仅代表当时的验收范围。

给 `media-center-web` 提供 API 的 Gin 单体后端，使用 SQLite 保存单用户、登录会话和分组配置。

## 首次启动

安装 Go 1.26 或更新版本后，在此目录运行：

```powershell
git submodule update --init --recursive
./scripts/dev.ps1
```

Windows 开发环境可运行 `./scripts/dev.ps1`：未显式配置 PROXY/HTTP_PROXY/HTTPS_PROXY/ALL_PROXY 时，脚本读取当前已启用的 Windows 系统代理，仅传给本次后端进程；不会修改系统代理。直接 `go run` 在 Windows 上也会自动读取当前已启用的系统代理，已有环境变量优先。Linux/macOS 先运行 `sh scripts/prepare-pansou.sh`，再运行 `go run ./cmd/server`。

服务默认监听 `http://localhost:18080`。首次打开前端时会显示创建管理员账号页面；账号 3–32 位，密码不能为空且最多 72 字节（bcrypt 限制）。初始化后可用新账号登录。健康检查地址是 `GET /api/health`。

默认数据保存在项目目录的 `data/`：`media-center.db` 是 SQLite 数据库，`master.key` 用于加密 TMDB/Emby API Key、115 Cookie 和 Telegram Bot Token。备份和迁移时需要一起保存这两个文件；丢失密钥后无法解密已存的服务凭证。可用 `MEDIA_CENTER_DATA_DIR` 指定其他持久化目录，用 `HTTP_ADDR` 指定监听地址。

## 前端连接

在 `media-center-web` 目录启动开发服务器时，开启真实登录和配置 API、保留其他媒体页面的 mock：

```powershell
$env:VITE_BACKEND_AUTH = 'true'
pnpm dev
```

Vite 默认把 `/api` 代理到 `127.0.0.1:18080`；后端请设置 `HTTP_ADDR=127.0.0.1:18080`，或用 `VITE_API_PROXY_TARGET` 指向实际后端地址。如需让所有 API 请求都直连后端，可设 `VITE_ENABLE_MOCKS=false`；尚未实现的媒体业务接口会返回 404。

## 已实现接口

- `GET /api/auth/setup/status`、`POST /api/auth/setup`：一次性单用户初始化
- `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`
- `PATCH /api/auth/account`、`POST /api/auth/password`
- `GET|POST /api/auth/api-keys`、`DELETE /api/auth/api-keys/{id}`：创建、查看和撤销集成密钥
- `GET /api/settings/{tmdb|emby|115|organize|search|notifications|pansou}`
- `PUT /api/settings/{tmdb|emby|115|organize|search|notifications|pansou}`
- `GET /api/v1/whoami`：验证网页会话或 API Key
- `GET /api/logs?level=INFO&source=auth&query=login&limit=200`：读取 SQLite 服务请求日志

所有受保护接口使用 `Authorization: Bearer <token>`。数据库只保存 session token 的 SHA-256 摘要；密码使用 bcrypt 哈希；敏感配置使用本地 AES-GCM 密钥加密。设置 GET/PUT 默认返回 `configuredSecrets` 与 `maskedSecrets`（前后各 4 位，短值减少可见位数），values 不包含凭证明文；保存时空字符串表示保持现有密钥不变。管理员点击“显示全文”可调用显式 reveal 接口，无需再次验证密码。

API Key 以 `mc_` 开头，数据库仅保存 SHA-256 摘要；完整密钥只在创建响应中返回一次。网页会话可管理密钥，API Key 仅用于 `/api/v1` 应用接口，不能管理账号、设置或其他 API Key。应用接口应统一挂载到 `requireAPI` 鉴权组，因而支持网页会话和 Hermes 等集成客户端。TMDB 元数据探索接口使用 `/api/media` 网页会话鉴权；资源搜索已提供基础接口，下载尚未接入；当前 `/api/v1/whoami` 仅用于验证认证链路。

日志接口由服务端记录请求时间、模块、级别、路径、状态码和耗时；最多保留最近 5000 条，不记录请求头或查询参数。日志查询支持级别、模块、内容和数量筛选。

验证密钥：

```powershell
Invoke-RestMethod http://localhost:18080/api/v1/whoami -Headers @{ Authorization = "Bearer <API_KEY>" }
```

## 项目约定

HTTP 路由和输入校验放在 `internal/httpapi`，领域 DTO 放在 `internal/media`，SQLite schema 和访问逻辑放在 `internal/store`。外部服务适配器与媒体业务接口后续按相同模块边界增加。

## TMDB 电影/电视剧探索（2026-10-12）

在全局设置的 TMDB 分类保存官方 v3 API Key（`tmdb.apiKey`），沿用 AES-GCM、空字符串保留密钥及 `configuredSecrets` 语义。浏览器常规设置读取返回已配置标记与脱敏值；显式管理员 reveal 可返回完整凭证。媒体接口不回显上游凭证或上游错误正文，日志不记录凭证明文。无密钥时返回 503，不生成替代作品。

- `GET /api/media/discover?source=tmdb&mediaType=movie&page=1&pageSize=20`：mediaType 必填 movie/tv；page 为 1–500；pageSize 仅接受 20。
- 可选 genre 为相应原生类型的 TMDB 类型 ID；region 是产地 CN/HK/TW/JP/KR/US/GB；year 为 1870–2100；sort 为 popularity.desc、vote_average.desc、date.desc。服务器映射电影/电视剧各自的日期排序与年份参数，不做页面内过滤。
- query 使用对应 search/movie 或 search/tv，最多 200 字符，支持年份；与 genre、region、非热度排序组合返回 400。
- `GET /api/media/tmdb/{providerId}?mediaType=movie|tv`：原生正整数 ID，类型必填；详情包含真实演员和季信息，缺失字段不补演示数据。

契约变化：身份新增必填 provider/providerId，保留 source/sourceId 兼容别名；mediaId=`tmdb:{movie|tv}:{原生ID}`。探索 items 直接使用正式 Summary（无需 id/kind/rating/summary/palette/artwork 展示兼容字段），people 移除。page/pageSize/total/hasMore/source/fetchedAt/stale 保留；total 原样使用 total_results，缺失为 null；缺失/错误 page 或 total_pages 返回 502，不推算总数。hasMore 使用上游 total_pages，并受 500 页访问边界限制。评分无投票时返回空数组，未知年份省略。

错误为 `{message}`：参数 400、会话 401、作品不存在 404、请求取消 408、上游错误或格式异常 502、未配置/上游凭证失效/上游限流 503、超时 504。503 限流响应附有界 Retry-After，provider 401 不映射成浏览器登录失效。

客户端 HTTP 超时 8 秒、整体预算 15 秒；共享限流 4 次/秒、并发最多 2；429/5xx 最多 3 次尝试，指数退避并解析 Retry-After 秒数或 HTTP 日期，等待超过 2 秒时直接返回。请求和等待均服从调用方取消，禁止自动跟随重定向。上游响应体限制 1 MiB。

相对设计文档的首版取舍：只实现 TMDB 单类型探索，不实现 all 混合流、人物或榜单。使用有界进程内 TTL 缓存（最多 128 条，容量达到上限清空），探索 30 分钟、详情 24 小时；不新增 SQLite 缓存表、SWR 或后台刷新。缓存键包含密钥摘要、类型、参数，配置更换不会复用旧凭证缓存；只缓存校验成功的上游 JSON，缓存命中保留 fetchedAt，stale 恒为 false。重启会丢失缓存，也没有同键请求合并。

### 本轮验证

全部 TMDB 测试使用随机生成的测试凭证和本地假上游。沙箱禁止监听端口，因此使用 `net/http/httptest.ResponseRecorder` + 注入 Transport，在进程内驱动上游 Handler；不联网，不使用真实密钥。测试覆盖参数、同号身份、归一化、真实/未知分页、缓存/过期/配置更换、取消/超时、错误/有界重试及设置密钥读取脱敏。

设置 `PATH=/home/yuxh/.local/bin:$PATH`、`GOCACHE=/tmp/media-center-go-build` 后，实际执行 `go build ./...`、`go vet ./...` 均退出 0、无诊断；`go test ./...` 退出 0，httpapi 与 tmdb 测试通过，其余包无测试。默认 Go 缓存目录不可写，首次尝试失败后改用上述可写目录。

前端实际执行 typecheck、lint、build 均退出 0；Vite 成功构建，提示主 JS chunk 超过 500 kB。尚未验证真实 TMDB API、图片 CDN、部署出站网络或浏览器点击联调；提供密钥后才能做这些验收。未接入豆瓣/Bangumi/AniList、资源搜索或下载。

## 内嵌 PanSou 与换电脑开发

PanSou 作为固定 Git 子模块编译进 API 进程，无需单独部署 PanSou Docker 服务。插件注册和推荐配置从该版本的 main.go/docker-compose.yml 生成，设置中的可用选项来自实际初始化成功的插件管理器。

启动会补齐 pansou 分类的缺失配置并迁移旧的未初始化占位值，保留已保存的明确空选择和关闭状态。新数据目录已验证自动生成 111 个频道、71 个启用插件、14 个网盘类型；不同上游版本或环境变量可能改变这些数量。换电脑拉取代码和子模块即可恢复默认配置；个性化设置及加密凭证仍需同步 data/（数据库和 master.key 一起），不会把密钥提交到 Git。

影视卡片、详情页和手动资源搜索共用保存的选择及 PanSou Web 的分轮搜索流程。链接检测复用 PanSou 服务；检测缓存保存在数据目录内。不同 PanSou 版本与启用插件集合使用不同缓存命名空间。

更新：`./scripts/update-pansou.ps1`；验证当前版本：`./scripts/update-pansou.ps1 -VerifyOnly`；选择已存在的固定版本：`./scripts/update-pansou.ps1 -Ref <commit>`。更新失败会恢复原子模块版本、嵌入补丁、模块文件和生成文件。更新完成后应一起提交这些文件和子模块指针。

## 独立动漫订阅模块（2026-10-13）

参考 ani-rss 的分步流程，在 `internal/anime` 独立实现来源、RSS 和规则；`internal/store/anime.go` 负责 SQLite 订阅存储，唯一约束为 Bangumi ID+季；`internal/httpapi/anime.go` 挂载 requireAPI 鉴权路由。前端使用正式本地契约，不代理上游管理接口。

- `GET /api/v1/anime/sources/mikan/catalog?query=&year=&season=&refresh=true`：番剧/季度；季度为春夏秋冬，搜索时优先 query。
- `GET /api/v1/anime/sources/mikan/{id}/groups?refresh=true`：字幕组、RSS、Bangumi ID 和最多 20 条发布样本。
- `POST /api/v1/subscriptions/anime/resolve`：RSS 草稿解析，必填 url/source；其他 RSS 必填 bangumiId；返回作品草稿，不创建订阅。
- `POST /api/v1/subscriptions/anime/preview`：完整草稿的匹配、排除、偏移、主备去重及预计文件名；不提交下载。
- `GET|POST /api/v1/subscriptions/anime`：读取/创建。重复作品+季返回 409，不自动替换。
- `PATCH /api/v1/subscriptions/anime/{id}`：`{enabled: boolean}`，持久化启用/暂停。

草稿包含 title/originalTitle/bangumiId/mikanId/source/url/subgroup/season/offset/totalEpisodes/week/releaseDate/poster/description/rating/enabled/match/exclude/standby。standby 每项 label/url/offset，最多 5 项。每类正则最多 20 条、每条最多 500 字符；匹配 AND，排除 OR。Go RE2 不支持 Java 正则所有语法。总集数 0 和星期 0 表示未知。订阅 ID 独立于作品 ID。

Mikan 列表、字幕组和 Bangumi 元数据分别缓存 10/2/30 分钟，有界进程内缓存；刷新来源可绕过来源缓存。RSS 2.0 每次读取，最多 300 条/源。出站请求 12 秒超时、正文上限 2 MiB、最多 3 次重定向；自定义 RSS 校验并固定公网解析 IP，拒绝本地地址/非标准端口/凭证 URL。Mikan 与官方 Bangumi 可使用环境代理，跨域重定向拒绝。抓取自定义 RSS 不使用本地代理。

首版之后已补充下文的 RSS 调度和手动更新；下载历史、115 下载任务及整理执行仍待接入。没有自动推断偏移或复制上游的下载器调用。已通过全部 test/vet/build，真实 Mikan 列表、字幕组、Bangumi 解析和 RSS 预览已验证；浏览器交互尚待验收。

## 订阅更新服务（2026-10-14）

`internal/animesync` 负责更新与调度；HTTP 服务、创建时刷新、手动刷新及定时器共用同一 Updater，按订阅 ID 互斥；`SaveAnimeRefresh` 只合并服务端刷新字段，保留并发暂停操作。

- `POST /api/v1/subscriptions/anime/{id}/refresh`：网页会话/API Key 鉴权；90 秒预算，重复在途请求返回 409，未知订阅 404，上游失败 502；已完结返回现有结果且不抓取。
- 创建后尝试首次 RSS 更新。上游失败不撤销已保存订阅，失败字段随创建结果返回；不会提交下载。
- 增加 latestEpisode/knownEpisodes/completed/lastCheckedAt/lastError/lastMetadataAt/metadataError/resources/lastScheduledDate。最多保存当前 100 条有效资源样本，累计覆盖记录独立保存，不受 RSS 滚动影响。
- 有效整数集覆盖 1..totalEpisodes 才完成；总集数未知、缺集或仅最末一集出现都不算完成。资源覆盖与下载状态分离。
- 北京时间 UTC+8 每日 04:00，检查当天及前一天星期的启用且未完结记录；数据库保存每日批次及单条执行日期，重启避免重复成功批次。当天 04:00 后启动可补当天一轮，不补历史多日。
- 同订阅并发忙时批次一分钟后重试；数据库写失败五分钟后重试，已持久化的单条失败当日不循环重抓。
- Bangumi 约 12 小时更新启用且未完结记录，手动 RSS 更新也补到期的元数据；只填未知总集数和缺失星期/日期，不覆盖自定义标题、已知总集数、季、偏移和规则。
- 115 就绪以服务端读取的非空可解密 `115.cookie` 为准，不验证其在线有效性。未配置时调度器等待设置变更，不建立 RSS/Bangumi 周期计时器或请求上游；PUT 115 设置会唤醒或取消自动工作。手动刷新不受此限制。
- 后端退出取消自动请求并等待调度器退出，再关闭数据库。下载、刮削、115 文件整理统一模块仍待实现。

全部 Go test/vet/build 通过；回归涵盖周期选择、完结跳过、115 守卫、并发、取消、失败保留和批次持久化。真实手动刷新两条现有订阅成功，未配置 115、未提交下载。更多调研待办见前端仓库 doc/ani-rss调研待办.md。已按维护者确认采用“当天＋前一天”，覆盖前一晚和深夜发布；周一也会检查周日订阅。

## 凭证脱敏与全文查看（2026-10-14）

GET/PUT `/api/settings/{section}` 增加 `maskedSecrets: {settingKey: maskedValue}`。脱敏显示前后各 4 个字符，中间 8 个遮挡字符；总长度不超过 8 时仅显示首尾各 1 字符，不超过 2 时全部遮挡。

POST `/api/settings/{section}/secrets/reveal`，请求 `{key: "115.cookie"}` 等已注册凭证字段，响应 `{value: "完整凭证"}`。沿用 requireUser，仅现有管理员网页会话可用，不支持集成 API Key；无需重复输入密码。无效/跨分类字段 400，未保存 404。响应使用 Cache-Control: no-store，日志不记录请求体与凭证值。AES-GCM 存储及空字符串保留语义不变。

已用临时测试凭证验证 TMDB/Emby/115/机器人 Token 的保存、默认脱敏、全文读取、缺失字段与未登录访问，以及空值不覆盖。没有输出或更改用户真实凭证。
