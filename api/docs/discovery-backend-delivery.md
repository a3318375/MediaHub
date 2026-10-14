# 多数据源探索后端交付记录

以下为前序交付记录；本次浏览器修正轮的范围、结果见文末。

日期：2026-10-12。仅修改 `media-center-api`；未 commit、push，也未修改前端。未访问工作区 `data/media-center.db`，未启动服务、创建真实会话或绕过鉴权。新增测试不创建会话；原有 HTTP 测试继续使用其 `t.TempDir()` 临时数据库和随机会话测试夹具。未修改下载、115、LitePan、RSS、Emby、store 或旧 `internal/tmdb` 客户端。

## 文件清单

全部位于 `media-center-api`：

- `internal/discovery/`：新增 `provider.go`、`capabilities.go`、`query.go`、`errors.go`、`registry.go`、`cache.go`、`service.go`、`cache_test.go`。
- `internal/providers/transport/`：新增 `transport.go`、`transport_test.go`。
- `internal/providers/tmdb/`：新增 `provider.go`；探索和详情委托旧客户端，榜单独立请求原生 trending。
- `internal/providers/bangumi/`：新增 `provider.go`、`mapping.go`。
- `internal/providers/anilist/`：新增 `provider.go`、`mapping.go`、`sort_real_test.go`（realupstream 标签）。
- `internal/providers/douban/`：新增 `provider.go`、`mapping.go`、`image_test.go`。
- `internal/providers/`：新增 `providers_test.go`、`upstream_real_test.go`（realupstream 标签）。
- `internal/httpapi/`：修改 `discovery.go`、`router.go`、`discovery_test.go`；新增 `discovery_contract_test.go`。旧测试原先把豆瓣当作不支持的 source，现在改为校验不支持的 mediaType。
- `internal/media/model.go`：新增可选 `titles` 对象，保存 AniList native/english/romaji/synonyms；旧 TMDB DTO 不会出现此字段。
- `docs/discovery-backend-delivery.md`：本记录。

`media-center-web` 没有本轮改动；其已有未跟踪 `.npmrc` 保留原状。

## 能力和边界

| 来源 | 类型 | 探索 / 搜索 | 筛选 | 榜单 | pageSize 最大值 / total 上限 |
|---|---|---|---|---|---|
| TMDB | movie、tv | 沿用旧探索、搜索与详情 | 原有 genre、region、year；popularity.desc / vote_average.desc / date.desc | 原生 `/trending/all/day`，过滤 person | 固定 20 / 20001 |
| Bangumi | anime | v0 subjects；POST v0/search/subjects，type=[2]；详情与 persons | year；month 必须同时提供 year；rank / date；不声明 genre/region/season/status/platform/cat | rank | 100 / 无已知上限 |
| AniList | anime | GraphQL Page / Media；官方中文搜索不足时使用内存中文标题索引和 id_in | 官方 GenreCollection 的 19 项 genre 白名单；season=WINTER/SPRING/SUMMER/FALL；year=1900–2100 → seasonYear；status=FINISHED/RELEASING/NOT_YET_RELEASED/CANCELLED/HIATUS；region=JP/CN/KR/US/TW → countryOfOrigin；三种排序仍按原有懒探测成功后声明 | 原生 POPULARITY_DESC 请求成功后确认 popularity 能力 | 50 / 5000 |
| 豆瓣 | movie、tv | recommend；weixin 聚合搜索仅保留对应 movie/tv target；详情 | U / T / S / R；movie 的科幻、tv 的美剧，拒绝其它标签和组合 | movie_top250、tv_hot | 50 / recommend 500 |

所有来源仅支持当前展示 locale `zh-CN`。能力矩阵的 genre 是来源级并集；最终还按 mediaType 校验，例如 TMDB 电影/剧集 genre 和豆瓣标签不能任意互换。未知、重复或不支持的 HTTP 查询参数返回 400。

豆瓣搜索作品封面读取 `items[].target.cover_url`：所有 HTTPS `*.doubanio.com`（包括 img 主机与 `*-sign` 签名 CDN）统一返回本站代理路径 `/api/media/image?source=douban&url=<urlencoded 原始 URL>`，完整保留签名 query。推荐列表仍读取 `pic.large` 并返回代理路径。非豆瓣图片域名、非 HTTPS、用户信息、端口和 fragment 拒绝。搜索仅接受 movie/tv，片单卡片继续过滤。

统一代理依据为用户本机真实请求：推荐列表 img 海报经代理正常；搜索签名 CDN 在浏览器带本站 Referer（`http://127.0.0.1:5174/`）时返回 403 text/html，无头 Chromium 设置 `referrerPolicy="no-referrer"` 仍 Failed to fetch；服务端对同一 URL 无 Referer 返回 200 image/webp，带豆瓣 Referer 也返回 200。旧代理对签名 URL 返回 400（图片域名限制且拒绝 query）。因此浏览器直连在该环境不可靠，改由服务端统一代取。此次自动化验证使用假上游；真实上游由用户复跑。

豆瓣搜索返回的是聚合卡片计数，不是电影/剧集数量，所以归一化 `total` 返回 `null`；`hasMore` 仍按上游原始分页计算。解析不到作品时提供中文 `message`。推荐列表先解码非数字 collection ID，再依据 URI/ID 过滤，避免把榜单卡片变成媒体。推荐命中 500、TMDB 命中 20001、AniList 命中 5000 时 `totalCapped=true`。各源身份隔离，不按标题合并；非 TMDB 不提供未约定的 externalIds.mal。

新增 `/api/media/providers`、`/api/media/rankings`、`/api/media/image`，以及扩展后的探索、详情仍统一经过原来的 `requireUser`。IMDb 两榜明确 `supported=false`；榜单并行获取，单项可用返回 200，全不可用返回 503。

## 缓存与治理

- 公共缓存只在内存：每源 256 项 LRU、每源缓存序列化数据 16 MiB 软上限。图片也占豆瓣分区，不另建持久化存储。
- 查询 JSON 用排序键序列化后计算 SHA-256，包含 source、查询、page、locale、mapping version；详情包含 nativeType/nativeId。缓存内部再加 source 和失效代数。用户凭证不进入公共缓存键。
- 同键合并；共享上下文使用 `context.WithoutCancel` 和每源独立超时，等待者单独监听取消。每次返回重新反序列化 DTO；缓存字节和负缓存错误也返回副本。
- 探索 TTL：TMDB / 豆瓣 1800s，Bangumi / AniList 900s。详情 TTL：TMDB / 豆瓣 86400s，Bangumi / AniList 21600s。合法空页和确定 404 为 300s。无效响应、网络失败、429、403、GraphQL errors 和取消不写错误缓存。
- 共享回源超时：TMDB 15s、Bangumi 12s、AniList 20s、豆瓣 15s；HTTP transport 自身也有超时。新来源 JSON 上限 2 MiB；旧 TMDB 保留原来的更严格 1 MiB 上限。
- Bangumi 本地初始间隔 1s、并发 2；AniList 初始保守间隔 2s、并发 1，官方响应 `X-RateLimit-Limit/Remaining/Reset` 动态收紧，没有声明固定官方配额；豆瓣 API 间隔 3s、并发 1；本次修正后图片独立间隔 250ms、并发 2，两者只共享暂停状态。
- 429 读取 Retry-After（秒数或 HTTP 日期），暂停回源并返回带 Retry-After 的 503。5xx 返回 502，并给之后的请求增加退避；豆瓣不自动重试。原 TMDB 重试行为保持原状。
- AniList 代理自身 403、连接失败、超时或 5xx：进程内暂停代理 10 分钟并使用官方。GraphQL errors 不被当成代理故障；代理或官方的限流不触发切换来源来绕过额度。代理 403 不修改官方限流状态。
- 豆瓣 403、HTTP 400 的 996、验证页：立即暂停整个豆瓣 transport 10 分钟（包含图片），503 携带中文原因与 Retry-After；不重试、不换 IP、不处理验证码。
- 豆瓣图片允许 HTTPS 且 hostname 以 `.doubanio.com` 结尾；允许 query 并原样用于上游请求，不将 query 作为用户凭证。拒绝用户信息、端口、fragment 和跳转（不跟随重定向）。服务端仅设置固定豆瓣 Referer/UA，不转发入站请求头；内容白名单并检查实际图片签名，1 MiB 上限，返回 private Cache-Control 和 nosniff。
- TMDB 用户凭证变更使公共缓存按代数失效，避免新增公共缓存遮蔽旧客户端的凭证隔离。所有上游连接错误均转为固定中文消息，不输出含凭证的 URL。取消的媒体请求不写数据库请求日志。

## 自动化验证

假上游采用 `httptest.ResponseRecorder` + 测试专用 RoundTripper：本环境禁止监听套接字，直接 NewServer 会报 `socket: operation not permitted`。测试仍检查实际 HTTP 方法、路径、参数、签名、请求体及响应映射，不碰真实上游。

覆盖：每源参数/能力拒绝、身份与 nativeType 隔离、标题回退、评分/日期、分页和 total unknown/capped、搜索和详情、详情标识不匹配、超时/403/429/5xx/非法 JSON/超限；AniList 200+errors、代理冷却回退及禁止限流切换、中文索引懒加载；豆瓣混入榜单过滤、聚合 target 解析、400+996 和验证页停用、图片 SSRF/内容限制；缓存命中/失效/LRU/分区/字节限制/负缓存/不缓存错误/10 并发单请求/一个等待者取消不影响其余等待者/副本防修改；HTTP DTO、部分榜单成功和新增路由鉴权。

实际执行：

```text
go build ./...                  exit 0，无输出
go vet ./...                    exit 0，无输出
go test ./... -count=1          exit 0，全包通过
```

另执行并通过：

```text
go test -race ./internal/discovery ./internal/providers/... ./internal/httpapi -count=1
```

真实冒烟命令已执行：

```text
go test -tags realupstream ./internal/providers/... -run 'TestReal' -v -count=1
TMDB: SKIP（未设置 TMDB_API_KEY；按要求不读取本地数据库）
Bangumi: discover / search / detail 均为「上游连接失败」
AniList: discover / search / detail 均为「上游连接失败」
豆瓣: discover / search / detail 均为「上游连接失败」
AniList POPULARITY_DESC / SCORE_DESC / TRENDING_DESC 均为「上游连接失败」
exit 1
```

没有把网络失败表述为真实验收成功，也没有通过读取数据库获得 TMDB key。再次验收可显式提供环境变量 `TMDB_API_KEY`（不回显）并执行相同命令。默认构建不会编译或运行真实请求测试。

中文搜索命中率复验另提供：

```sh
go test -tags realupstream ./internal/providers/anilist -run TestChineseSearchReal -v -count=1
```

覆盖命运石之门、进击的巨人、间谍过家家、孤独摇滚、鬼灭之刃及不存在词；本轮因网络限制未取得这些真实命中率。真实请求严格按预算顺序执行，未对豆瓣压测。

## 未完成的真实验收与未暴露项

- 新来源真实端到端验收、中文真实命中率、AniList 原生排序实际成功验证：受当前运行环境网络限制，尚未通过。能力接口首次访问会懒探测 POPULARITY_DESC / SCORE_DESC / TRENDING_DESC，成功后逐项声明，失败冷却 10 分钟后允许再次探测；首次访问可能等待回源，探测自身最多 20 秒。默认探索和 popularity 请求实际成功后也会确认 POPULARITY_DESC 能力。
- AniList 本轮新增 genre/season/year/status/region；其它未声明筛选及未经验证的豆瓣标签组合仍返回 400。
- Bangumi calendar 没有在本轮新增独立日历接口，也没有冒充榜单；rank 使用 subjects 的原生 rank 排序。
- IMDb 两榜保持 unsupported；没有 TMDB 替代内容。
- 没有跨源标题合并、SWR、Redis、持久化索引或常驻同步服务，也没有前端改动。

## 最终 go test 原始输出

```text
?   media-center/cmd/server [no test files]
ok  media-center/internal/discovery 0.014s
ok  media-center/internal/httpapi 1.379s
?   media-center/internal/media [no test files]
ok  media-center/internal/providers 5.246s
?   media-center/internal/providers/anilist [no test files]
?   media-center/internal/providers/bangumi [no test files]
ok  media-center/internal/providers/douban 0.007s
?   media-center/internal/providers/tmdb [no test files]
ok  media-center/internal/providers/transport 0.506s
?   media-center/internal/store [no test files]
ok  media-center/internal/tmdb 11.586s
```

候选排序枚举也有 [AniList 官方定义](https://github.com/AniList/docs/blob/master/docs/reference/enum/mediasort.md)；代码仍以实际原生请求成功作为声明能力的条件。

## 本轮补充：AniList 原生筛选与 Bangumi 边界

AniList 使用官方 GenreCollection 名称快照（19 项）：Action、Adventure、Comedy、Drama、Ecchi、Fantasy、Hentai、Horror、Mahou Shoujo、Mecha、Music、Mystery、Psychological、Romance、Sci-Fi、Slice of Life、Sports、Supernatural、Thriller。非法 genre/season/status/region 或范围外 year 在回源前返回 400 和中文 message。白名单不在请求期间从网络加载；新增 TestRealGenreCollection 对照官方集合检查快照漂移，当前沙箱无法完成该真实核对。

季度和年份允许分别使用，也可组合；`filters.seasonRequiresYear=false` 明确表示季度不强制要求年份，year 单独传 seasonYear 按用户实测有效。旧官方文档中 seasonYear “Requires season”的说明与本次实测不同，本实现采用用户提供的实测结果。GraphQL 使用 String/MediaSeason/MediaStatus/Int/CountryCode 类型变量；中文索引 id_in 回退保留筛选和排序。total 达到 5000 仍为 totalCapped=true。POPULARITY_DESC / SCORE_DESC / TRENDING_DESC 的确认逻辑和代理故障回退不变。

Bangumi 官方接口不支持 genre/region/season/status/platform/cat，本后端对这些 HTTP 参数（含空值）返回 400「Bangumi 官方接口不支持该筛选」；依据用户实测，cat=TV/剧场版 → HTTP 400，platform=TV/OVA → 被上游静默忽略，year=2024&month=10 → 200、total=148。

本轮修改文件：internal/discovery/capabilities.go；internal/providers/anilist/provider.go、mapping.go、sort_real_test.go；internal/providers/bangumi/provider.go；internal/providers/providers_test.go；internal/httpapi/discovery.go、discovery_contract_test.go；本交付文档。均在指定仓库内；保留原有未提交工作，不 commit/push、不修改前端或 data/media-center.db。

新增假上游覆盖所有白名单值的参数与 GraphQL 类型映射、年份单独筛选、季度单独筛选、组合筛选、非法枚举/白名单/年份拒绝且不回源、5000 capped、中文索引回退保留 genre；HTTP 测试覆盖 Bangumi 六种不支持参数及空值的中文 400。新增 TestRealNativeFilters 检查 Action+WINTER+2024+JP 非空、条目 genre/season/seasonYear/country 匹配；新增 TestRealGenreCollection 检查官方名单。

本轮最终实际输出：

```text
go build ./...                  exit 0，无输出
go vet ./...                    exit 0，无输出
go test ./... -count=1          exit 0
?   media-center/cmd/server [no test files]
ok  media-center/internal/discovery 0.012s
ok  media-center/internal/httpapi 1.373s
?   media-center/internal/media [no test files]
ok  media-center/internal/providers 5.242s
?   media-center/internal/providers/anilist [no test files]
?   media-center/internal/providers/bangumi [no test files]
ok  media-center/internal/providers/douban 0.006s
?   media-center/internal/providers/tmdb [no test files]
ok  media-center/internal/providers/transport 0.506s
?   media-center/internal/store [no test files]
ok  media-center/internal/tmdb 11.581s
```

真实冒烟：沙箱禁网（直连官方 curl 报 `Could not resolve host: graphql.anilist.co`），不能表述为真实验收通过；TMDB 未设置 TMDB_API_KEY 时跳过，未读取数据库获取 key。命令及本轮原始输出如下：

```text
go test -tags realupstream ./internal/providers/... -run TestReal -count=1
--- FAIL: TestRealUpstreamSmoke (12.01s)
    upstream_real_test.go:37: TMDB: SKIP（未设置 TMDB_API_KEY；按要求不读取本地数据库）
    --- FAIL: TestRealUpstreamSmoke/bangumi (2.00s)
        --- FAIL: TestRealUpstreamSmoke/bangumi/discover (0.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/bangumi/search (1.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/bangumi/detail (1.00s)
            upstream_real_test.go:50: 上游连接失败
    --- FAIL: TestRealUpstreamSmoke/anilist (4.00s)
        --- FAIL: TestRealUpstreamSmoke/anilist/discover (0.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/anilist/search (2.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/anilist/detail (2.00s)
            upstream_real_test.go:50: 上游连接失败
    --- FAIL: TestRealUpstreamSmoke/douban (6.00s)
        --- FAIL: TestRealUpstreamSmoke/douban/discover (0.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/douban/search (3.00s)
            upstream_real_test.go:64: 上游连接失败
        --- FAIL: TestRealUpstreamSmoke/douban/detail (3.00s)
            upstream_real_test.go:50: 上游连接失败
FAIL
FAIL	media-center/internal/providers	12.010s
--- FAIL: TestRealNativeSorts (4.00s)
    sort_real_test.go:20: POPULARITY_DESC: 上游连接失败
    sort_real_test.go:20: SCORE_DESC: 上游连接失败
    sort_real_test.go:20: TRENDING_DESC: 上游连接失败
--- FAIL: TestRealNativeFilters (0.00s)
    sort_real_test.go:61: 上游连接失败
--- FAIL: TestRealGenreCollection (0.00s)
    sort_real_test.go:94: 上游连接失败
FAIL
FAIL	media-center/internal/providers/anilist	4.007s
?   	media-center/internal/providers/bangumi	[no test files]
ok  	media-center/internal/providers/douban	0.003s [no tests to run]
?   	media-center/internal/providers/tmdb	[no test files]
ok  	media-center/internal/providers/transport	0.003s [no tests to run]
FAIL
```

参数类型参考 [AniList 官方 Query 定义](https://github.com/AniList/docs/blob/master/docs/reference/query.md)；白名单最终与官方 GenreCollection 的一致性由上述真实测试复验。

## 浏览器验收修正轮（2026-10-12）

本轮同时修改 media-center-api 和 media-center-web，保留已有未提交工作，不 commit、不 push；未改 data/media-center.db 或下载/115/RSS/Emby。

改动文件与行为：

- 后端 internal/providers/normalization/text.go、text_test.go：使用 HTML tokenizer 解码实体、剥离标签，br/p 保留换行，各行压缩空白并删除多余空行；测试覆盖 br、其它标签与实体、无标签三种输入。
- 后端 internal/providers/anilist/mapping.go、provider.go、mapping_test.go：简介调用纯文本归一化；countryOfOrigin 映射 originCountries，详情 region 使用同一国家代码，测试验证 JP 的摘要和详情输出。
- 后端 internal/providers/bangumi/mapping.go、douban/mapping.go、tmdb/provider.go：其它来源简介同样清理；TMDB 在新 provider 返回边界处理，未修改旧客户端。
- 后端 internal/providers/transport/transport.go：将可共享的暂停状态与独立请求预算分离；排队前、获得槽位后和间隔等待结束后均检查暂停。
- 后端 internal/providers/douban/provider.go、image_test.go：图片使用独立 250ms / 并发 2 transport；API 保持 3s / 并发 1；两个 transport 共享暂停状态和验证页/996 guard，403 同样暂停两侧 10 分钟。图片白名单、大小、内容签名、Referer、禁止跳转均保留。测试占满图片两个槽位，再以 1 秒上下文完成 API 请求；分别从 API/图片触发 403、400+996、验证页，验证两侧 503、中文原因、Retry-After=600。
- 前端 src/lib/media-presentation.ts、src/lib/media-api.ts、tests/media-presentation.test.ts：提取纯函数 presentMediaError；消息已经包含类别语义时仅显示一次，保留不同详情及 Retry-After。504 “上游请求超时”显示“上游请求超时，请重试”；空结果和网络中断原有路径保持，401/429/503/502/504 仍可区分。
- docs/discovery-backend-delivery.md：本轮交付记录。

真实上游冒烟：沙箱禁网，未运行真实回源验收；由用户在可联网环境复跑。自动化使用假上游，不将测试通过表述为真实浏览器验收通过。

前端实际输出（四条命令 exit 0）：

```text
pnpm run typecheck
$ tsc --noEmit

pnpm run lint
$ eslint .

pnpm run build
$ tsc -b && vite build
vite v8.3.4 building client environment for production...
transforming...
✓ 2394 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.56 kB │ gzip:   0.37 kB
dist/assets/index-ByQsz8Oz.css  151.90 kB │ gzip:  21.51 kB
dist/assets/index-FpdLn2r6.js   583.96 kB │ gzip: 186.98 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 394ms

node --experimental-strip-types tests/media-presentation.test.ts
TAP version 13
ok 1 - 地区中文映射、多国、空值及未知代码回退
ok 2 - 总数由返回的 capped 标记决定，不猜测精确总量
ok 3 - AniList 中文别名优先，其次中文原名和数据集标题
ok 4 - 缺中文时依次回退 romaji、english、native、title
ok 5 - 图片绝对地址、豆瓣 CDN 代理、TMDB 路径和空值
ok 6 - 错误语义不重复，保留类别和不同详情
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 8.65918
```

上面的 TAP 省略每条用例的 duration 元数据；构建 500 kB 为提示，命令成功。

后端最终实际输出（三条命令 exit 0）：

```text
go build ./...
（无输出，exit 0）

go vet ./...
（无输出，exit 0）

go test ./... -count=1
?    media-center/cmd/server [no test files]
ok   media-center/internal/discovery 0.014s
ok   media-center/internal/httpapi 1.368s
?    media-center/internal/media [no test files]
ok   media-center/internal/providers 5.254s
ok   media-center/internal/providers/anilist 0.005s
?    media-center/internal/providers/bangumi [no test files]
ok   media-center/internal/providers/douban 0.007s
ok   media-center/internal/providers/normalization 0.004s
?    media-center/internal/providers/tmdb [no test files]
ok   media-center/internal/providers/transport 0.509s
?    media-center/internal/store [no test files]
ok   media-center/internal/tmdb 11.585s
```


## 豆瓣搜索海报修正（2026-10-12）

本轮仅修改 `internal/providers/douban/mapping.go`、`provider.go`，新增 `search_test.go`，更新本交付文档。保留已有未提交工作；未 commit/push，未修改前端或 `data/media-center.db`。

搜索 target 增加 cover_url 解码及安全封面映射；签名 CDN 与 img 主机统一返回代理路径，原始签名 query 经 URL 编码完整保留。封面覆盖仅用于搜索，推荐/详情/榜单的 pic.large 映射保持原行为。显式过滤非 subject layout（允许原有缺省 layout），movie/tv 类型与作品校验保持。测试覆盖 movie/tv 搜索两种封面、无封面、第三方地址、book/collection/doulist_cards 过滤，以及 movie/recommend、tv/recommend 在同时含 cover_url 时仍使用 pic.large 代理。

真实上游冒烟：当前沙箱禁网，本轮未运行；可由用户在可联网环境复跑。以下为本轮实际输出：

```text
go build ./...
（无输出，exit 0）

go vet ./...
（无输出，exit 0）

go test ./... -count=1
?   media-center/cmd/server [no test files]
ok  media-center/internal/discovery 0.015s
ok  media-center/internal/httpapi 1.385s
?   media-center/internal/media [no test files]
ok  media-center/internal/providers 5.241s
ok  media-center/internal/providers/anilist 0.006s
?   media-center/internal/providers/bangumi [no test files]
ok  media-center/internal/providers/douban 0.008s
ok  media-center/internal/providers/normalization 0.004s
?   media-center/internal/providers/tmdb [no test files]
ok  media-center/internal/providers/transport 0.507s
?   media-center/internal/store [no test files]
ok  media-center/internal/tmdb 11.585s
（exit 0）
```
