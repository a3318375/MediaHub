# 探索 / 发现能力设计

研究日期：2026-10-12。依据本地前端、后端与 MoviePilot 快照（提交 `899a0eb85b688f473c4e43e1ae02dafbe54c6841`），没有拉取或验证其是否仍为远端最新。本文仅提出设计，不实现业务代码。下文 MoviePilot 路径均相对 `../_reference/MoviePilot/`；前端路径相对 `../media-center-web/`。

## 1. MoviePilot 调用链与实际行为

### 1.1 接口 → Chain → Module → 客户端 → 缓存 → 模型

| 接口层：`app/api/endpoints/discover.py` | 调用链与出处 |
| --- | --- |
| `tmdb_movies` / `tmdb_tvs` | `app/chain/tmdb.py::async_tmdb_discover` → `app/modules/themoviedb/__init__.py::async_tmdb_discover` → `tmdbapi.py::async_discover_movies/async_discover_tvs` → `tmdbv3api/objs/discover.py::async_discover_movies/async_discover_tv_shows` → `tmdbv3api/tmdb.py::_async_request_obj/async_request` |
| `douban_movies` / `douban_tvs` | `app/chain/douban.py::async_douban_discover` → `app/modules/douban/__init__.py::async_douban_discover` → `apiv2.py::async_movie_recommend/async_tv_recommend` → `__async_invoke_recommend/__async_invoke` → `__init__.py::_project_discover` |
| `bangumi` | `app/chain/bangumi.py::async_discover` → `app/modules/bangumi/__init__.py::async_bangumi_discover` → `bangumi.py::async_discover/_cached_async_invoke` → `_project_media_list` |
| AniList | **该 discover.py 没有 AniList 路由**。能力在 `app/chain/anilist.py` 与 `app/modules/anilist/__init__.py::anilist_discover/async_anilist_discover`，后者调用 `anilist.py::discover/async_discover` → `_invoke/_async_invoke` → `_project_media_list` |

Chain 通过 `run_module/async_run_module` 分派能力；三个 HTTP provider 使用 `verify_token`。`discover.py::source` 通过 `DiscoverSource` 事件收集扩展数据源。HTTP 探索结果是 `MediaInfo.to_dict()` 列表，空结果通常为 `[]`，不是前端要求的分页对象。

背景中的模型位置需要修正：本快照 `app/schemas/types.py` 定义 `MediaSource/MediaType` 等枚举，**没有 MediaInfo**。领域对象在 `app/domain/context.py::MediaInfo`；HTTP schema 经 `app/schemas/workflow.py` 导入 `app/schemas/context.py::MediaInfo`。领域对象构造时合并 provider 信息，`to_dict` 输出 `media_source/media_id/type/title/original_title/year/poster_path/backdrop_path/vote_average/overview` 等，清空原始 `*_info` 字段。本项目应自行映射成 camelCase DTO，不能直接透传。

### 1.2 各 provider

| Provider | 认证、分页 | 限流、重试、降级与错误（本地实现事实） |
| --- | --- | --- |
| TMDB | `tmdbv3api/tmdb.py::__init__/_validate_api_key/_build_url` 读取 `TMDB_API_KEY`，v3 URL 携带 `api_key` 与 `language`。探索传 `page`；`_process_json_response` 记录 `page/total_results/total_pages`，但 Module/HTTP 返回列表丢失这些元数据。 | `request/async_request` 在无响应时退避后重试一次；同步自有会话会重建。`_handle_headers/_handle_rate_limit` 读取剩余次数、重置时间，`_request_obj/_async_request_obj` 最多等待重试一次。连接失败为 `TMDbConnectionError`，业务错误为 `TMDbException`；`tmdbapi.py::async_discover_movies/async_discover_tvs` 默认记录异常并返回 `[]`，`raise_exception=True` 才传播。不要将内部默认 remaining=40 当作官方配额。 |
| 豆瓣 | `douban/apiv2.py::_prepare_get_request/__sign` 使用内置移动 API 的 apiKey、时间戳及签名，GET 随机选择移动 UA。`__init__.py::async_douban_discover` 把页码转换为 `start=(page-1)*count`，传 `count/sort/tags`。 | **该探索链未注入用户 Cookie，也未见验证码处理、专用 403/429 退避或自动 Cookie 更新**。`apiv2.py::_handle_response` 直接解析 JSON，缺响应返回 None，没有严格状态/业务错误分类；`_project_discover` 空安全转换并过滤占位海报。`match_doubaninfo/async_match_doubaninfo` 有 `@retry(Exception, 5, 3, 3, ...)`，这是识别匹配路径，不能算作探索重试。`scraper.py` 负责 NFO/图片映射，并非网页反爬客户端。 |
| Bangumi | `bangumi/bangumi.py::__init__` 使用 `NORMAL_USER_AGENT` 与代理，可配置 API base URL；**此客户端没有 Authorization/token 注入**。`discover/async_discover` 调 `v0/subjects`，HTTP 层默认 type=2、count=30，以 `limit/offset` 分页，传 cat/sort/year；仅提取 `data`，丢失 total。`search/async_search` 实际调用旧式 `search/subject/{name}`，没有暴露分页，不应据 `_urls` 中未使用的 search 常量推断能力。 | `_decode_response/_project_response` 非 200、无响应或 JSON 解析失败返回 None；未见 provider 专用限流/重试。日历、详情、探索附加日期 `_ts`；base URL 进入缓存身份。公开读取与受保护接口要区分：本项目若接入需要授权的数据，使用 Bearer token；UA 应明确标识开发者、应用、版本和联系方式，依据 [Bangumi UA 约定](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md) 与 [认证文档](https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md?plain=1)。 |
| AniList | `anilist/anilist.py::_page_query/_page_variables` 使用 GraphQL `Page(page,perPage)`，固定 type=ANIME，支持 search/genre/format/seasonYear/country/sort，公开读取不发送鉴权头。本快照未请求 pageInfo。 | `_invoke/_async_invoke` 优先中文代理 `trace.moe/anilist/`，失败经 `_disable_proxy` 在进程内停用代理，再请求官方 `graphql.anilist.co`，合并 GitHub 中文标题数据集。`_extract_response` 对非 200、JSON 错误或 GraphQL errors 返回 None；没有专用 429 重试。`discover/search/detail` 用 `@cached(skip_empty=True)`，空结果不缓存。官方与中文数据集同时存在网络依赖，标题缺失应回退 native/romaji。 |

上述普通 HTTP 经过 `app/adapters/network/http.py::RequestUtils/AsyncRequestUtils`（默认超时 20 秒）。provider 层缺少专用策略不表示传输层完全没有容错；也不应据此承诺风控可绕过。

### 1.3 缓存基础设施

- `app/runtime/cache.py::Cache/AsyncCache/TTLCache/LRUCache/FileCache/AsyncFileCache` 是门面；`configure_cache_factories` 注入 Redis/文件工厂，内存由 `MemoryBackend/AsyncMemoryBackend` 实现，具体持久化实现位于 `app/adapters/cache/`。FileCache 本地文件后端不自动按键 TTL 过期，Redis 分支才使用 TTL。
- `cached` 规范化参数并分区，支持同步/异步共享 key、`skip_none/skip_empty/skip_if` 和独立 `empty_ttl`；`fresh/async_fresh` 可跳过读取。缓存访问锁保护内存数据，装饰器未实现本设计所需的完整 SWR 或同键上游请求 singleflight。
- TMDB 探索 `tmdbv3api/objs/discover.py` 单条件容量 1、TTL 43200 秒；底层请求另有 `CONF.tmdb/CONF.meta` 缓存与短空结果 TTL。`app/modules/themoviedb/cache.py::TmdbCache.get/update/save/_restore` 是**识别缓存**，非探索分页缓存；内存 TTL、显式 expires_at、文件恢复/保存或 Redis 共同工作。
- 豆瓣 `apiv2.py::__invoke/__async_invoke`、Bangumi `_cached_invoke/_cached_async_invoke` 使用各自容量与 `CONF.meta` TTL；AniList 方法级缓存同理。不能直接复制其 TTL 作为本项目前端 CachePolicy。

## 2. 本项目 HTTP 映射与契约

依据 `src/lib/media-api.ts`、`src/mocks/data/media-contract.ts`、`discover.ts`、`rankings.ts`，另核对 `src/mocks/handlers.ts` 与实际页面调用。

| 方法、路径 | 请求参数 | 成功响应 | 鉴权建议 |
| --- | --- | --- | --- |
| GET `/api/media/discover` | source 必填：tmdb/douban/bangumi/anilist；mediaType 可选：all/movie/tv/anime/documentary/person；genre、region、year、sort、query、page、pageSize 可选 | `DiscoverResponse`，下述分页及卡片字段；people 必须为数组 | `/api/media` 兼容组用 requireUser |
| GET `/api/media/{source}/{sourceId}` | source 同上；sourceId 为原生 ID 字符串；建议增设可选 mediaType、locale（目前 detail 调用均不传） | `MediaDetail`，直接对象，无 item 包装 | requireUser |
| GET `/api/media/rankings` | 当前调用无参数；首版每榜最多 10 条 | `{categories:[{id,source,title,description}],lists:Record<RankingCategory,RankingEntry[]>}` | requireUser |

`README.md` 与 `internal/httpapi/router.go::NewRouter/requireUser/requireAPI` 明确 API Key 仅用于 `/api/v1`。因此保持上述前端路径，未来提供 `/api/v1/media/...` 同 handler 别名挂 requireAPI，接受会话和 API Key；不默默把 `/api/media` 开放给 API Key。设置、凭证修改仍为 requireUser。静态 discover/rankings 路由先声明并验证不会被 `/:source/:sourceId` 错误匹配。

### 2.1 字段清单与映射

- `MediaIdentity` 必填 `mediaId/source/sourceId/mediaType`。sourceId 保留上游 ID；建议 mediaId=`source:nativeType:sourceId`，nativeType 为 movie/tv/anime/person，分类为 documentary 时仍保留原生 movie/tv 身份。不凭标题合并跨源条目。
- `MediaSummary` 必填 `title/genres/ratings`，可选 `originalTitle/year/releaseDate/region/overview/originalLanguage/originCountries/posterPath/backdropPath/palette/artwork`。`MediaDetail` 再加可选 `runtimeMinutes/status/tagline/externalIds/credits[{name,role,personId?}]/seasons[{seasonNumber,episodeCount?,name?}]`。
- `ProviderRating` 为 `{source,value,voteCount?}`；TMDB/豆瓣/Bangumi 按 10 分展示，AniList averageScore 除以 10；不能把 popularity 当评分或票数。只返回实际已取得的评分，未评分 `ratings:[]`，不造跨源评分。externalIds 仅放契约支持的来源，IMDb/MAL ID 不能塞入枚举；跨源匹配留后续设计。
- `DiscoverApiItem` 实际不是单纯 MediaSummary，而是 `DiscoverItem & MediaIdentity & {ratings}`。因此必填兼容字段 `id/title/originalTitle/kind/year/region/genres/rating/source/summary/palette/artwork`，另附 `mediaId/sourceId/mediaType/ratings`；可同时输出 Summary 字段。id=mediaId、summary=overview、rating=本源评分（缺失用 0 作旧 UI 占位）、kind 映射电影/剧集/动画。兼容层给未知 year=0、region/originalTitle/summary 空字符串，真正元数据仍省略未知值。palette/artwork 为展示派生值，**不持久化到元数据缓存**。
- 分页必填 `items/page/pageSize/total/hasMore/source/fetchedAt/stale`，加 `people:[{id,name,originalName,role,knownFor,popularity,palette,initials}]`；空数组输出 `[]`，fetchedAt 为上游成功取得时间的 UTC RFC3339，命中缓存不能改为当前时间。people 由 TMDB popular/search person 独立缓存，失败时为 `[]`，不让人物请求拖垮媒体页。mock 的 sources/platforms/regions 是额外字段，未在 API 返回类型中承诺，可后续显式扩展。
- `RankingEntry` 必填 `id/title/year/kind/rating/region/source/platforms/palette/tagline`；source 当前为展示文字，非 MediaSource。platforms 无真实平台信息时 `[]`，tagline 可取简介摘要。榜单暂不具备严格的 detail identity，不能把展示 source 当 provider。

**两个前端接入缺口必须保留在实施计划中：** `discover-explore-page.tsx` 目前仅传 source/query，筛选仍在页面处理；详情用 `item.id.replace(/^[a-z]+-/, "demo-")` 合成 mock ID，未使用响应 sourceId。真实接入必须后续调整为使用 sourceId；不能让后端伪造 demo ID。`people` 标签被页面改写为 source=tmdb，不是合法 provider；需明确人物视图何时请求热门人物/人物搜索。`rankings-page.tsx` 打开卡片时硬编码 source=tmdb，也需后续统一身份。

### 2.2 查询、分页及 ID 消歧

建议默认 page=1、pageSize=20，允许 1–50（mock handler 默认 50 并非类型契约）；page 正整数、year 合理范围、query 最多 200 字符。locale 首版固定 zh-CN，扩展时只允许白名单。genre/region/sort 使用版本化映射表，未知或 provider 不支持的组合返回 400，不能静默忽略。region 表示产地而非发行市场，更不能直接等同 originalLanguage。

| Provider | 查询映射建议 |
| --- | --- |
| TMDB | movie/tv 分别 discover，year 映射 primary_release_year/first_air_date_year，genre 映射类型 ID，产地映射相应 supported country filter；sort 白名单转换 popularity.desc/vote_average.desc/日期等。query 存在改用 search，无法同时上游筛选的组合先明确拒绝。原生每页 20，pageSize=50 需按全局 offset 取相关原生页后切片，每个原生页独立复用缓存。 |
| 豆瓣 | movie/tv 推荐，genre/region/year 映射经过验证的 tags，sort 转 R 等合法值；query 走搜索 start/count。移动 API 的标签语义及可用性尚需验证，未验证组合返回 400。 |
| Bangumi | 动画 type=2，limit/offset；分类 cat 与 genre 不等价，不直接把自由 genre 字符串转数字。建议新适配器用经验证的 v0 搜索能力支持 query/tag，未完成前 query/genre/region 不支持组合返回 400。 |
| AniList | Page + pageInfo，query→search、genre→genre、year→seasonYear（季度年份语义）、region→countryOfOrigin、sort→白名单枚举；anime/all 有效，movie/tv 可按明确 format 映射；person 使用另行明确的人物能力。 |

tmdb/douban 的 all 建议将电影、剧集各自排序流确定性交替合并（固定电影优先），按全局 offset 计算两流需要的区间，某流耗尽后用另一流补齐；它不是跨类型统一热度排名。禁止每页临时混合后再分页。anime/documentary 筛选需约定 provider 原生类型与 genre，不能把所有动画电影误作 TV。

新适配器保留 TMDB total_results、Bangumi total、AniList pageInfo.total/hasNextPage、豆瓣可用总数；不沿用 MoviePilot 仅取列表的做法。无可靠 total 时建议 `total=-1` 表示未知，hasMore 依上游游标或有界探测；这需前端确认，不虚构精确总数。过滤损坏记录可能导致短页，不能仅据 items 长度判定终页。

TMDB movie/tv 的数字 ID 可重叠，`metadata:tmdb:123:zh-CN` 会碰撞；仅靠发现页注册 ID→type 无法处理冷启动或重叠。建议 detail 路径保持不变，增加 `?mediaType=movie|tv|person`（documentary/anime 需解析原生类型），sourceId 仍保留原生值。未传类型时只在本地唯一原生类型可解析时兼容，未知/多义返回 400 并提示补类型，不先查 movie 再把同号 tv 当同一作品。这是实施前必须确认的契约补充。

### 2.3 榜单与失败语义

`tmdb-trending` 使用 TMDB week 趋势，`anilist-popular` 使用 POPULARITY_DESC；`bangumi-today` 若采用 calendar 只是今日放送清单，不能标为“今日人气排行”。需用户选定榜单语义。`imdb-movies/imdb-series` 没有对应的四 provider 权威热门榜能力；MoviePilot 的探索端点也不提供这两榜。首版建议保持五个 lists 键，未接入 IMDb 时两个数组为空、categories 不展示它们，不用 TMDB 冒充 IMDb。独立 IMDb 数据源与授权另立事项。

错误沿用 `internal/httpapi/router.go::fail` 的 `{message}`：参数 400、会话 401、确定不存在 404、provider 未配置/熔断 503、上游格式/服务错误 502、超时 504。本项目自身限流 429；上游限流无可用旧数据时返回 503 + Retry-After，不能把 provider 401 变成“用户退出登录”。有合格旧缓存时 200，分页 stale=true；详情及榜单未定义 stale 字段，用 `X-Media-Cache: fresh|stale` 标识，榜单部分失败可用 `X-Media-Degraded-Sources` 并记日志。榜单至少一项可用才允许部分 200，全不可用为 503；成功空列表与故障严格区分。响应和日志不输出密钥、Cookie、含凭证 URL 或原始风控页面。

## 3. 缓存设计

### 3.1 键与 TTL

对齐前端 CachePolicy 模板：

- `metadata:{source}:{sourceId}:{locale}`：实际 sourceId **键组件**为 URL 转义后的 `nativeType/nativeId`，如 `metadata:tmdb:movie%2F123:zh-CN`；HTTP DTO sourceId 仍是 `123`。这是为消除 TMDB/人物同号冲突所需的模板解释，须前端确认。
- `discover:{source}:{filters}:{page}:{locale}`：filters 为规范化 JSON 的 SHA-256；包含 mediaType/genre/region/year/sort/query/pageSize、映射版本、配置修订号（不含凭证），默认值先展开，object key 排序，移除无意义空值，不能随意转小写搜索文本。page 单独存，locale 白名单。原生分页子缓存沿用模板并在 filters 标记 operation/nativePageSize。
- 榜单、人物复用 discover 模板，在 filters 加 operation/category/timeWindow/day/时区；当日放送用 Asia/Shanghai 日期，避免跨日复用。整体响应由独立源缓存拼装，禁止缓存故障占位覆盖成功数据。

| 来源 | 详情 TTL | 发现 / 榜单 TTL | 过期后的 SWR 窗口 | 确定负结果 TTL |
| --- | --- | --- | --- | --- |
| tmdb、douban | 86400 秒 | 1800 秒 | 604800 秒 | 300 秒 |
| bangumi、anilist | 21600 秒 | 900 秒 | 172800 秒 | 300 秒 |
| emby（仅契约参照，非本期探索） | 300 秒 | 300 秒 | 1800 秒 | 60 秒 |

取值直接来自 `src/mocks/data/media-contract.ts::mediaCachePolicies`。Emby 现有 dashboard 配置默认 12 小时，这是独立功能，不在本轮调整。

### 3.2 状态、去重与持久化选择

选择 **SQLite 持久化缓存**，不另设进程内元数据缓存。已有单进程 SQLite/WAL 基础，重启后仍可利用长 SWR，尤其适合豆瓣低请求预算；内存方案虽简单，重启会造成冷请求集中，后续迁移还需补持久化与时间语义。内存仅保存同键请求去重、刷新队列和限流状态。

建议后续在 `internal/store/schema.sql` 新增（这里只展示设计）：

```sql
CREATE TABLE media_cache (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- metadata/discover
  payload_json TEXT,                 -- 规范化数据；负结果可空
  result_kind TEXT NOT NULL,          -- success/not_found/empty
  schema_version INTEGER NOT NULL,
  config_revision INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,        -- UTC Unix 秒
  fresh_until INTEGER NOT NULL,
  stale_until INTEGER NOT NULL,
  last_access_at INTEGER NOT NULL
);
CREATE INDEX media_cache_expiry ON media_cache(stale_until);
```

1. now < fresh_until 直接返回；fresh_until ≤ now < stale_until 返回旧值并排队刷新；超过 stale_until 不再返回，等待有界回源。stale_until=fresh_until+SWR 窗口。
2. 确定 404 或经过校验的成功空发现结果缓存 300 秒，无 SWR；网络、429、403、验证码、GraphQL errors 不作为“没有作品”负缓存。短熔断状态另存内存，不能覆盖旧成功条目。
3. 同键 singleflight 覆盖读后回源及后台刷新；刷新入队也须原子去重。只锁状态，不锁住整个 provider 网络请求。后台用独立 15 秒 context、最多 2 个 worker、有界队列；前台取消不应中止其他等待者需要的共享请求。重查缓存后再回源，完成时原子 UPSERT。
4. 刷新失败保留旧值与原 fresh/stale 时间，记退避状态，不能无限延长 SWR。配置修订、映射/DTO schema 更新使对应缓存失效；Cookie/token 不入缓存 payload/key。
5. 每日和容量超限清理：先删超过 stale_until 项，再按 last_access 淘汰；建议初始 10000 项、JSON 总量软上限 100 MiB、单项 1 MiB。last_access 批量/采样更新，避免每次读取争抢 SQLite 写锁；事务内不做网络 I/O。

迁移成本：后续新增表与 store 访问方法，利用 `store.go::Open` 的 schema 初始化；缓存是可丢弃数据，版本升级可按 schema_version 删除旧项，不影响 users/settings。先确认上线迁移方式（当前没有通用版本迁移框架），保持旧库可启动。未来多实例可替换 CacheStore 为 Redis，但需分布式请求去重与共享限流，单进程 singleflight 不能保证跨实例唯一。

## 4. 模块边界与 Go 接口建议

| 建议新增位置（后续实施） | 职责 |
| --- | --- |
| `internal/httpapi/discovery.go` | 参数校验、鉴权路由、DiscoverItem/RankingEntry 展示兼容 DTO、HTTP 错误映射；复用 fail，不写 provider 网络逻辑 |
| `internal/media/discovery.go` | Query、Page、People、Ranking 数据类型；补齐 Summary.region；现有 `model.go` 继续持有领域身份/详情/评分，不引入 Gin/SQL/provider |
| `internal/discovery/service.go`、`cache.go`、`rankings.go`、`provider.go` | provider 注册、查询能力检查、类型消歧、缓存/SWR/singleflight、榜单聚合、公共端口及错误类型 |
| `internal/providers/{tmdb,douban,bangumi,anilist}/client.go`、`mapping.go` | 独立认证/分页、上游结构校验、纯 DTO 映射；不能依赖 httpapi 或 store |
| `internal/providers/transport/client.go` | 可复用 http.Client、context、超时、响应体上限、按 provider 限流/退避、敏感信息过滤 |
| `internal/store/media_cache.go` | 实现缓存端口，仅 SQL 与 JSON 存取；设置凭证仍经 ReadSettings/ReadSecret |

依赖方向：httpapi → discovery + media；providers → discovery 端口 + media；store 实现端口；在 router/启动组装处注入，不让 service import 具体 provider/store。可沿用 `emby.go::embyConfig/embyRequest/readEmbyJSON` 的配置读取、请求 context、有限响应体和状态校验，但复用长连接 client，避免 `embyDashboard` 整段网络持全局 mutex 的模式。

```go
// Query、ProviderPage 等为建议新增类型；不是本轮可编译实现。
type Provider interface {
    Source() media.Source
    Capabilities() Capabilities
    Discover(ctx context.Context, q Query) (ProviderPage, error)
    Detail(ctx context.Context, ref NativeRef, locale string) (media.Detail, error)
}
type NativeRef struct {
    ID string                  // 上游原生 ID
    Kind string                // 原生 movie/tv/anime/person，非展示分类
}
type ProviderPage struct {
    Items []media.Summary
    Page, PageSize int
    Total *int                 // nil 为未知；HTTP 兼容层映射为 -1
    HasMore bool
}
type PeopleProvider interface {
    People(ctx context.Context, q PeopleQuery) (PeoplePage, error)
}
type RankingProvider interface {
    Ranking(ctx context.Context, q RankingQuery) (ProviderPage, error)
}
type CacheStore interface {
    Get(ctx context.Context, key string) (CacheEntry, bool, error)
    Put(ctx context.Context, entry CacheEntry) error
    DeleteBySource(ctx context.Context, source media.Source) error
}
```

Capabilities 明确支持的媒体类型、过滤器、sort 和分页上限；可选人物/榜单接口避免强迫每个 provider 实现假能力。统一 ProviderError 包含 NotFound/RateLimited/Unauthorized/Blocked/Unavailable/InvalidResponse 与 RetryAfter，保留内部 cause，HTTP 只输出脱敏消息。

后续设置建议新设 discovery 分类与 tmdbApiKey/doubanCookie/bangumiToken 等键，必须同时扩充 `router.go::validSection` 与 `store.go::secretSettingNames`；当前允许的设置分类和加密键中并没有这些凭证，仅写入普通 settings 不会自动加密。沿用 AES-GCM/master.key、空值保持现有秘密、configuredSecrets 标记语义。

## 5. 风险、配额与待确认事项

以下配额为研究日公开文档，不代表部署 IP 的保证预算：TMDB [官方限流说明](https://developer.themoviedb.org/docs/rate-limiting) 已取消旧的 40 次/10 秒规则，仍有约 40 次/秒保护上限且可变化，须处理 429；AniList [官方限流说明](https://docs.anilist.co/guide/rate-limiting) 标称 90 次/分钟，但当前文档提示降级为 **30 次/分钟**，应以响应 Limit/Remaining/Reset/Retry-After 为准。Bangumi 本次核查未获得可靠统一数值配额；豆瓣此移动接口无本设计可依赖的公开配额。

建议初始本地预算（**设计值，非官方配额**）：TMDB 4 次/秒、并发 2；豆瓣 1 次/3 秒、并发 1；Bangumi 1 次/秒、并发 1；AniList 20 次/分钟、并发 1。详情、发现、榜单和重试共享 provider 预算，后台刷新优先级低于用户冷请求。普通瞬时网络/5xx 最多重试一次、500–1500ms 抖动；429 遵循 Retry-After，超过请求预算则熔断至重置，不让用户长时间等待。豆瓣 403/验证页直接暂停回源并提示人工更新/检查配置，不自动换 IP、破解验证码或连续重试。

- [ ] **豆瓣接入方式**：是否启用实验性移动 API？若指定 Cookie 网页路径，需独立验证合法数据来源、分页和风控识别；MoviePilot 当前探索不能证明 Cookie 方案可用。Cookie 失效/账号风控由用户处理，允许禁用 provider 并返回已缓存结果。
- [ ] **网络与出站配置**：从实际部署环境验证 TMDB、AniList 官方域名、图片 CDN；若采用中文代理/标题数据集，还要验证 trace.moe/GitHub。是否需要代理、是否接受第三方中文代理？本轮未做真实 provider 联网测试，不能保证国内可达性。
- [ ] **TMDB 类型与缓存键**：是否接受 detail 增加 mediaType 参数、键组件携带原生类型？这是保证原生 sourceId 和避免同号碰撞的必要契约修订。
- [ ] **前端真实接入范围**：确认修复 demo ID、服务端筛选/分页接入、未知 total=-1、未知评分/年份展示，以及人物页与榜单详情的统一身份；这些不能仅靠后端字段兼容完成。
- [ ] **榜单来源与语义**：IMDb 两榜是否延期或单独购买/接入数据？Bangumi 今日榜采用放送还是另有可验证人气来源？不能用 mock 排名或其他源伪装。
- [ ] **凭证和配额**：用户提供 TMDB Key；Bangumi 公开数据是否足够、是否需要 token；各 provider 是否共享其他应用出口/凭证，初始本地预算是否需调低？遵循响应头动态收紧。
- [ ] **默认策略**：确认默认每页 20、zh-CN、all 交替合并、缓存容量及长达数天的旧数据窗口；确认配置入口与部署迁移步骤。
- [ ] **许可与归属**：MoviePilot 标注 GPL-3.0；本方案独立实现 API/缓存行为并保留出处，不复制其大段源码。后续若引入其代码或中文数据集，需要单独确认许可证、署名及分发义务；TMDB 等数据/图片归属展示也需在发布前落实。

后续验证重点为真实契约夹具、TMDB 同号不同类型、分页重切片、并发同键去重、重启后 SWR、404 与风控区分、GraphQL 200+errors、榜单部分失败和秘密脱敏；使用模拟上游及临时 SQLite，不靠真实账号请求验证错误分支。本轮仅进行文档与出处核对。
