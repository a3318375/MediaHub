# ani-rss 添加动漫订阅源码分析与接入建议

分析日期：2026-10-13。直接读取官方仓库 v3.2.47，固定提交 `b5238763cd5de379018f0dcf53fab1d11f8f2a20`。源码参考位于本机临时目录 `C:/Users/yuxhc/AppData/Local/Temp/media-center-ani-rss-reference`，未安装或运行 ani-rss。本次只写分析，不改业务代码和页面设计。

源码链接以下均以此提交为基准：[固定版本](https://github.com/wushuo894/ani-rss/tree/b5238763cd5de379018f0dcf53fab1d11f8f2a20)。

## 一、实际流程

1. AddView 选择 mikan、ani-bt、anime-garden 或 other。支持粘贴单番剧/字幕组 RSS，也可以打开对应来源浏览器。
2. MikanView 请求番剧列表，可按标题或季度浏览，服务端返回 seasons/weeks/totalItems。展开番剧时才请求字幕组，前端以作品 URL 缓存组数据。
3. MikanService 抓取并解析 Mikan HTML：提取封面、番剧、字幕组、RSS、Bangumi 地址，以及发布标题、磁力、种子地址、体积和时间。GroupRegexUtils 根据发布标题生成规则候选；分辨率、语言等标签是候选筛选依据，不能仅视为展示信息。
4. 选择字幕组后还要选择匹配规则，可选择“全部”。AddView 把规则加上 `{{字幕组}}:` 前缀，再请求 rssToAni；解析完成后重新写回用户选中的 match，避免草稿覆盖选择。
5. 后端 AniUtil.getAni 创建草稿：生成订阅 ID，按来源提取 Bangumi/字幕组身份，通过 Bangumi 补全元数据，应用服务端默认配置，必要时获取 RSS 推断字幕组；全局启用自动偏移且非 OVA 时推断主/备用 RSS 的集数偏移。
6. AniView 编辑草稿，调用 previewAni 预览，确认后 addAni 保存，刷新订阅列表。

“其他”来源前端要求选择 Bangumi，后端所有分支最终都要求 bgmUrl 非空。输入框中的 title 不是 rssToAni DTO 字段，不能据截图认为手写标题即可跳过元数据关联。

## 二、源码与接口映射

| 源码（仓库相对路径） | 关键职责 |
| --- | --- |
| `ani-rss-ui/src/view/home/AddView.vue` | 来源步骤、草稿解析、规则回填、保存 |
| `ani-rss-ui/src/view/home/MikanView.vue` | 季度/星期/搜索、按需获取字幕组、规则选择 |
| `ani-rss-ui/src/view/home/AniView.vue` | 基本、备用 RSS、自定义配置和预览入口 |
| `ani-rss-ui/src/view/home/BatchAdditionView.vue` | 同番剧多字幕组合并、串行解析、单条重试与确认 |
| `ani-rss-ui/src/js/http.js` | mikan、mikanGroup、rssToAni、previewAni、addAni 请求 |
| `ani-rss-application/src/main/java/ani/rss/controller/AniController.java` | 解析、预览、保存和订阅管理路由，使用 Auth |
| `ani-rss-application/src/main/java/ani/rss/entity/dto/RssToAniDTO.java` | url/type/bgmUrl/subgroup/enable/standbyRssList 输入 |
| `ani-rss-application/src/main/java/ani/rss/util/other/AniUtil.java` | 草稿生成、身份解析、元数据补全、偏移与 JSON 持久化 |
| `ani-rss-application/src/main/java/ani/rss/service/AniService.java` | 重复检查、保存、预览、触发下载 |
| `ani-rss-application/src/main/java/ani/rss/util/other/ItemsUtil.java` | 主备 RSS 合并、集数解析、匹配/排除、去重与漏集 |
| `ani-rss-application/src/main/java/ani/rss/config/DefaultAniFactory.java` | 正式服务端默认值，与 UI 示例对象区分 |

上游接口由 http.js 调用 `/api/mikan`、`/api/mikanGroup`、`/api/rssToAni`、`/api/previewAni`、`/api/addAni`。这些是参考接口，不是媒体中心当前已实现接口。

## 三、字段和语义

| 字段组 | 需要保留的语义 |
| --- | --- |
| 作品身份 | 本地 subscriptionId、Bangumi subjectId、可选 TMDB 身份、标题；订阅 ID 与作品 ID 分开 |
| 来源 | source type、主 RSS、字幕组；备用 RSS 各自包含 label/url/offset |
| 剧集 | releaseDate、week、season、offset、totalEpisodeNumber、OVA/电影标记 |
| 规则 | match、exclude、globalExclude；规则可作用于特定字幕组 |
| 更新策略 | enable、downloadNew、omit；可选不下载集数与优先关键词 |
| 整理策略 | 自定义集数/剧集组、命名模板、下载或上传目录；是否纳入首版需按 115 链路确定 |

ItemsUtil 的有效 match 规则全部需要命中（AND），exclude 任意命中即排除（OR）。迁移时不能改成“任意匹配即可”。主备 RSS 的去重受配置影响，不能简单拼接数组。

PreviewAni 返回 downloadPath/items/omitList，结合 RSS 解析和下载历史标记 hasDownloaded。它没有调用 addAni，但会读取 RSS、下载状态和本地种子信息，不是纯前端展示。首版媒体中心预览应能说明原标题、解析集数、偏移后集数、筛选原因、预计整理文件名；未接入 115 状态时不能宣称已下载。

BatchAdditionView 按 Mikan bangumiId 或其他来源 bgmId 分组，首个组作为主 RSS，其余作为备用；逐条解析，失败仅影响当前条目。每条草稿仍需确认保存，并非选择后直接批量启动下载。

## 四、不能直接照搬的行为

- ani-rss 是 Java/Spring 服务，无法像 Go PanSou 一样直接编译进当前 Go 后端。需要选择独立 ani-rss 服务的适配方式，或在 Go 中实现对应业务。
- addAni 先按订阅 ID 拒绝重复，再按标题+季检查；全局 replace 开启时可直接移除旧订阅。媒体中心应使用明确作品身份和事务唯一约束，重复返回冲突，让用户决定替换或合并备用 RSS。
- addAni 保存后，enable=true 会异步尝试登录下载器并调用 downloadAni。若仅想“保存订阅”，这一副作用必须在本地 API 中表达清楚；创建成功不应等同下载成功。
- 上游使用内存列表和 ani.v2.json 保存订阅。我们已有 SQLite，不建议另外创建同一套事实数据，必须明确谁负责订阅状态和调度。
- ani.js 含示例日期、评分与集数，正式默认值来自 DefaultAniFactory。不能把前端示例值写入真实记录。
- 当前预览与下载链路关联本地下载器，不能直接等同 115 离线任务；RSS 中的 torrent/magnet 到 tgtodriver/115 的提交与完成确认还需单独对接。
- Mikan 来源依赖 HTML 结构；迁移应测试缺字段、布局变化、空结果和上游超时。自定义 RSS 抓取需要与现有后端一致的 URL、重定向、超时、响应大小边界；不能不加约束地抓取用户传入地址。

## 五、与本项目的差距

当前 AnimeSubscriptionsPage 只有列表、筛选和暂停/恢复，接口由 MSW 支撑；没有真实创建路由、来源浏览、RSS 草稿解析或预览。页面把订阅 id 当 AniList sourceId 打开作品详情，正式接入时需要改用真正的作品身份。media-api 的订阅类型来自 mocks，应迁出到正式契约。

## 六、建议首版范围（待维护者决定）

保留当前卡片、筛选和整体视觉，在页面加“添加订阅”入口；新增流程使用当前 shadcn 组件，参考上游行为而不复制 Element Plus 布局。

首版建议包括 Mikan 浏览与手动 RSS：选番剧 → 选字幕组/规则 → 解析草稿 → 编辑基础信息、偏移和匹配/排除 → 预览 → 保存；同时替换列表和暂停/恢复的 mock。AniBT、AnimeGarden、批量、自定义剧集组与复杂上传选项随后接入。

拟议本地 API（未实现）：

- `GET /api/v1/anime/sources/mikan/catalog`：标题/季度查询。
- `GET /api/v1/anime/sources/mikan/{id}/groups`：字幕组和发布样本。
- `POST /api/v1/subscriptions/anime/resolve`：生成可编辑草稿，不创建订阅。
- `POST /api/v1/subscriptions/anime/preview`：预览识别和规则结果，不创建下载任务。
- `GET|POST /api/v1/subscriptions/anime`：列表/创建；创建携带幂等键，返回订阅及独立调度结果。
- `PATCH /api/v1/subscriptions/anime/{id}`：编辑和启用状态。

路由复用系统 requireAPI；前端消费稳定本地 DTO，后端适配上游，统一错误语义。草稿和预览请求支持取消，最终保存重新验证且由数据库保证去重。

实现前最关键的决定是：**运行独立 ani-rss 并调用其 API，还是在 Go 内实现参考流程？** 前者复用成熟行为，但多一个服务且需协调它的下载器/存储；后者适合当前单体与 115 任务链路，但需要维护来源解析、规则和调度。不能在两边同时独立调度同一订阅。

建议先决定这个边界，再实现首版；本次尚未选择架构，也没有启动下载或创建真实订阅。

## 已选择架构与首版实现（2026-10-13）

维护者已选择在 Go 内独立实现参考逻辑，不运行额外 ani-rss 服务。首版已接入 Mikan 浏览与发布样本、RSS 草稿解析、Bangumi 元数据、主/备用 RSS、手动集数偏移、匹配/排除、预览、SQLite 创建与暂停/恢复；已有列表改为真实后端。原始分析中的拟议接口已落地，具体契约以当前前后端 README 为准。

自动推断偏移、后台更新/下载、115 整理、AniBT/AnimeGarden 浏览、批量和既有订阅规则编辑尚未纳入首版。匹配正则使用 Go RE2，与 Java 正则并非完全兼容。

真实验证：Mikan 当前列表返回 79 部作品/108 季度；测试作品 3825 有 9 个字幕组，Bangumi 486054 正常解析，总集数 12；合集来源预览 2 条、接受 0，LoliHouse 单集来源预览 13 条、接受 12。样本数仅代表此次上游状态。

前端 typecheck/lint/build 与既有 13 项测试通过；后端 test/vet/build 通过，新增针对鉴权、重复保存、暂停、重启持久化、规则、偏移、主备去重、缓存刷新及拒绝内网抓取的测试。浏览器工具策略阻止访问本机页面，未完成浏览器交互验收；用户可在正在运行的前端检查。
