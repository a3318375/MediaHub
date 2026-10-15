# 榜单推荐：来源、调用条件与需求分析

调研日期：2026-10-15。依据用户截图、当前代码和下列官方文档。没有购买授权、申请账号，也没有把网页内部接口当作开放 API。“可接入”指存在正式接口和明确使用条件，不代表当前实例已持有对应授权。

## 截图拆解

第一行是平台筛选：热门、Netflix、HBO、Apple TV、Disney+、Crunchyroll、Prime Video、Amazon、Hulu、猫眼、豆瓣、腾讯视频。第二行是榜单来源：全部、IMDb 最热门电影/剧集、TMDB 趋势、AniList 热门、Bangumi 今日放送，右侧是地区。

必须把以下三件事分开显示：

1. **平台片库里的热门作品**：例如从 TMDB 筛选 Netflix 可观看作品，再按 TMDB popularity 排序。
2. **平台官方榜单**：例如 Netflix 自己发布的每周 Top 10。
3. **第三方榜单**：IMDb、JustWatch、AniList 的各自统计口径。

第一种不能命名为“Netflix 官方热榜”；可观看平台也不等于出品公司或首播电视网。

## 接口与权限矩阵

| 截图入口 | 找到的可行路径 | 使用条件与结论 |
| --- | --- | --- |
| TMDB 趋势 | `/3/trending/{movie|tv|all}/{day|week}` | 正式 API；用户提供 TMDB key，遵守非商业使用和署名要求；优先接入 |
| Netflix | TMDB Discover 平台筛选；另有 Tudum 官方周榜公开页面/数据文件 | 前者是 TMDB 热度片单；后者是官方周榜但不是通用公开 JSON API，需确认数据再使用条款，不假定可自由再分发 |
| HBO / Max | TMDB watch providers + 地区 | 可做平台片单；需按地区动态匹配 HBO/Max 品牌，不声称拥有 HBO 官方收视榜 API |
| Apple TV | 同上 | 区分 Apple TV 订阅服务和租买商店，不把同名入口合并 |
| Disney+ | 同上 | 仅在该地区返回对应 provider 时显示；无数据不等于全球没有内容 |
| Crunchyroll | 同上 | 对应平台可观看片单；与 AniList 的动漫热度榜分开 |
| Prime Video / Amazon | 同上，分别处理 `flatrate` 和 `rent/buy` | 两个入口可能分别表示订阅与租买，不能只按 Amazon 字样去重 |
| Hulu | 同上 | 地区敏感；本次未确认可自由调用的 Hulu 官方热榜接口 |
| IMDb 最热门电影/剧集 | IMDb 正式商业数据/API 产品 | 当前没有该项授权；免费非商业数据集包含评分和票数，但不提供截图所指的 MOVIEmeter 热度名次，不能伪造同款榜 |
| AniList 热门 | `https://graphql.anilist.co`，`Media(type: ANIME)` 的 `TRENDING_DESC` / `POPULARITY_DESC` | 有正式 API；区分趋势与累计人气，遵守条款、动态限流；商业用途需核对授权；优先复用现有 provider |
| Bangumi 今日放送 | `GET https://api.bgm.tv/calendar` | 官方公开接口，按 User-Agent 建议调用；按当天星期取条目，它是放送表，不是“热榜” |
| Bangumi 排名 | 官方 `/v0/subjects` 等能力及当前 provider 的 rank 支持 | 与今日放送拆开，不能拿排名数据替换日历并沿用标题 |
| 猫眼 | 官方网站有榜单页面 | 本次未找到附带明确开放授权的通用榜单 API；先外链或待合作，不抓验证码/内部接口作为正式接入 |
| 豆瓣 | 网站有榜单，当前项目已有部分网页适配 | 本次未确认对本项目开放的官方榜单 API/再分发授权；当前适配的技术可读性不等于授权；先保留外链或独立标记实验来源 |
| 腾讯视频 | 平台本身有榜单 | 本次未确认可自由调用的官方消费级榜单 API；业务合作 API 不等于可以读取公众热榜；暂不承诺 |
| 跨平台第三方热榜 | JustWatch Partner API 的 Streaming Charts | 需要合同和 partner token、署名；它反映 JustWatch 用户行为，不是 Netflix/HBO 的实际播放后台数据 |

主要依据：[TMDB Discover TV](https://developer.themoviedb.org/reference/discover-tv)、[TMDB 使用条件](https://developer.themoviedb.org/docs/faq)、[TMDB watch provider 的 JustWatch 署名要求](https://developer.themoviedb.org/reference/tv-series-watch-providers)、[IMDb 免费数据字段](https://data.imdb.com/non-commercial-datasets/)、[JustWatch 合作 API](https://apis.justwatch.com/docs/api/)、[AniList API](https://docs.anilist.co/reference/)、[AniList 条款](https://docs.anilist.co/guide/terms-of-use)、[Bangumi 官方文档](https://github.com/bangumi/api)。

Netflix 参考：[官方全球周榜](https://www.netflix.com/tudum/top10/tv/global)、[官方 TSV 地址](https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv)。本次检索工具不解析 TSV 内容，未据此声称已验过实时数据格式或使用许可。落地前应核对下载入口、字段、条款及更新频率，尤其不能把周榜称为实时热榜。

## 目前代码缺口

- `providers/tmdb.Provider.Ranking` 已有 `trending/all/day`，但还没有截图式平台筛选。
- `providers/anilist` 当前榜单使用 `POPULARITY_DESC`，不是 `TRENDING_DESC`；界面命名应与实际参数一致。
- `providers/bangumi` 当前 `Ranking("rank")` 返回排名，不能直接当“今日放送”。
- 平台 ID 不能写死并在所有国家复用。平台可用列表按媒体类型和地区缓存，provider ID 应来自官方 provider-list 接口，并处理品牌变化。

## 建议一期需求

优先实现：TMDB 趋势、AniList 热门/趋势、Bangumi 今日放送，以及使用 TMDB 数据的平台热门片单。Netflix 官方周榜作为独立适配项评估；IMDb/JustWatch 商业榜和未确认授权的国内平台暂不实现数据抓取。

统一请求建议：

```text
GET /api/media/rankings?source=tmdb&chart=platform_popular&providerId=...&region=US&mediaType=tv&page=1
GET /api/media/rankings?source=bangumi&chart=airing_today
```

响应增加 `chartKind`、`source`、`platform`、`region`、`period`、`rank?`、`metricName?`、`sourceUrl`、`fetchedAt`、`stale`、`attribution`、`capabilities`。没有上游原始名次的列表只显示列表位置，不声称跨来源排名一致。

地区约束：TMDB 平台可观看性需要 `watch_region`。此时不能让“全球”悄悄映射成美国；应要求选择地区，或禁用该筛选。TMDB 趋势的全球口径则可保留“全球”。对今日放送显示其自身日期/时区口径。

界面状态需要表达“未配置凭证”“来源暂不可用”“该地区不支持”“需要合作授权”“缓存旧数据”，不把所有情况显示成“暂无作品”。点击作品复用现有详情、追剧订阅和公共下载入口。

## 缓存、验收与实现顺序

- 缓存键包含来源、榜单口径、平台、地区、媒体类型、时间窗口及页码。建议榜单缓存 1–6 小时，平台列表缓存约 1 天，具体按来源政策收敛；后台合并并发请求，失败可返回标明时间的旧缓存。
- 署名随数据返回并在页面呈现；JustWatch 的可观看性数据须按其 TMDB 接口要求署名，不能只在代码注释写来源。
- 用固定响应验证分页、地区、榜单名次与电影/剧集类型；用真实凭证只做有限连通性验收，不将授权失败误报为空榜。
- 第一阶段先补准确的榜单类型与 provider capabilities；第二阶段做平台过滤和地区；第三阶段再决定是否接官方周榜文件与需合作的商业来源。

验收重点：Prime/Amazon、Apple TV 订阅/租买不混淆；Bangumi 放送不冒充热榜；未授权 IMDb 不显示伪造热度；全球与地区口径清晰；缓存和署名可见。
