# HeroUI 对齐审计与验收

日期：2026-10-16。基线：`2bc7101b85b4a96bca01a333f6fc1088ad1bd903`。依据任务书 A–G、当前 `web/src` 实现、`docs/web` 与后端 README。仅修改 HeroUI 前端、相关测试/报告以及忽略本地依赖链接的 `.gitignore`；`web/`、`api/` 与 PanSou 子模块没有修改。

## 实现与审计发现

下表列出此次对照发现并处理的差异。保留 HeroUI v3 自身的控件外观，不把 shadcn 组件复制进新前端。

| 范围 | 原差异 | 处理结果 |
| --- | --- | --- |
| A 来源步骤 | 来源、浏览、字幕组和编辑同时出现；可绕开作品解析 | 改为来源 → 浏览作品/字幕组 → 匹配版本 → 编辑、预览、保存；手动 RSS 保留入口，其他 RSS 要求 Bangumi ID |
| A 来源切换 | 旧作品身份、字幕组和预览可能沿用 | 切换来源重新建立空草稿，清空选择、季度、字幕组和预览 |
| A 浏览 | 番剧海报挤在弹层；查询未分离刷新；无分页 | 对照 web 的紧凑作品列表，初次浏览自动请求，标题/季度查询、刷新来源、20 项客户端分页；不宣称上游提供分页 API |
| A 字幕组/规则 | 选规则直接解析，无独立版本步骤 | 显示发布记录、全部版本及实际正则候选；单独选择版本，AND 条件完整传给后端；各步骤可返回 |
| A 校验/异常 | 前端用 JavaScript RegExp 校验 Go 正则；换行输入不稳定 | 不再误拒 `(?i)`，实际合法性由后端校验；多行输入独立保存文本再解析；季数/总集数/偏移范围、最多 5 个备用源；显示预览预计文件名与筛选原因 |
| A 请求生命周期 | 重复点击和关闭后在途请求缺少约束 | 在途操作互斥，卸载取消请求；忙时不关闭保存流程，显示加载与接口错误 |
| B 订阅详情 | 卡片打开独立订阅弹窗 | 使用与影视探索相同的作品详情页、返回列表和 Bangumi 作品身份；移除旧详情弹窗 |
| B 订阅卡片 | 复用探索悬停卡片，管理按钮不常驻；发现集数语义弱 | 拆出 3:4 订阅卡片，标题、RSS、状态、评分、更新日、发现覆盖、暂停/恢复、刷新、下载入口常驻；完结禁用刷新；各订阅独立忙态，失败后尝试读取持久化错误 |
| 动漫下载 | 可设置单番剧目录；候选为空没有资源预览回退 | 与 web 一致使用 `library`；起始集数、自动下载开关、范围内候选和中文状态；无候选时从真实已保存 RSS 资源生成预览；零项重试显示原因 |
| C 探索卡片 | 标题/简介截断、元信息和小屏表现有差异 | 图片铺底、渐变和独立详情按钮保留；对齐两行标题/简介、类型/评分、地区/来源元信息；小屏保留标题和元信息，键盘焦点可显示浮层；密度按参考断点调整 |
| C 详情头部 | 普通海报/文字块，无宣传背景；资源按钮在上方 | 使用背景图、海报回退及渐变遮罩；资源按钮移到头部右下；作品标题与年份、原名、评分、状态和简介保持可见 |
| D 资料/演职员 | 演职员摘要和演员表堆在下方，无作品资料栏 | 下方在 1024px 起使用 `minmax(250px,340px) minmax(0,1fr)`；左列资料/日期/年份/地区/状态/标签/IMDb，右列演职员与季集；小屏上下排列，演员按 4/6/8/10/12 列响应式展示 |
| 探索来源 | 默认直接请求 TMDB，未根据可用能力选择来源 | 从 provider capabilities 选择可用来源，禁用不可用来源，尊重媒体类型、搜索能力和 pageSizeMax；无来源显示真实错误 |
| 探索搜索 | 顶部搜索留在元数据探索页，与 web 当前行为不同 | 顶部搜索进入资源搜索并记录媒体历史；历史记录仍可恢复来源与元数据关键词；补清空/重置按钮 |
| 标题/地区 | AniList 中文别名选择和地区格式不同 | 将 web 的纯展示规则独立放到 `lib/media-presentation.ts`，卡片和详情复用 |
| 榜单 | 平台入口仅少数品牌；默认内容类型、放送排名、署名不一致 | 补动态品牌匹配，默认剧集；今日放送不显示热度名次；补榜单说明、真实返回的更新时间、来源链接及 TMDB/JustWatch 署名；平台请求失败显示原因 |
| E 搜索配置 | 首轮直接合并搜索，与 web 分轮行为不同 | 每次查询读取当前保存的频道/插件/网盘选择；TG 首轮、插件预热，再按 2/3/3 秒顺序收集；仅插件启用时收集。选择入口与 web 一样在全局设置，不另造来源契约 |
| E 动态分类 | 空网盘分类会出现；初始无结果时未切换到后到达的分类 | 只显示非空类型；增量合并去重，新增类型自动出现，保留有效的当前分类；收集失败保留已有结果并显示错误 |
| E 检测 | 每批 10 条，可能重叠；检测身份只用 URL | 每批最多 6 条，串行收集，仅检测可见链接；身份包含网盘/URL/提取码，取消离页请求，失败保留可重试状态 |
| E 历史 | 缺影视探索历史展示；清空只清资源历史 | 补媒体历史、最近结果恢复，统一清除两种历史；恢复结果保留作品身份；更换关键词清除旧作品关联 |
| E 转存 | 点击资源仍打开多步下载弹窗 | 直接调用同一个 `POST /api/v1/downloads`：115 使用 `wholeShare=true` 和结果提取码，目录空值交由全局配置；磁力直接离线入队；按钮互斥、错误展示、保留作品关联；不把任务提交说成下载完成 |
| 电视剧订阅 | JavaScript 校验误拒 Go 正则；操作忙态与状态反馈不完整 | 交后端校验 Go 正则，季数限制 1–100；忙态 `finally` 清理；缺播出日期、两种错误、资源大小/提取码信息补齐；新订阅默认 PanSou，与 web 一致 |
| 追剧日历 | 未来与已播出未发现资源均显示等待资源 | 区分待播出/待搜资源/资源已找到/暂停；保留北京时间、月份切换、合集覆盖与公共下载入口 |
| 下载记录 | 缺 `submitted/downloading/awaiting_files/unknown` 中文状态；转存假定百分比 | 补状态、真实加载/失败/空态、转存确认中、来源/目录、文件列表；保留重试与停止跟踪的后端语义 |
| 基础/服务设置 | 搜索画质是任意文本，排除关键词非多行；数值项类型不同 | 改为参考的画质选择、多行关键词和数值输入；复核服务配置保存、凭证脱敏/全文查看、账号与 API 密钥链路 |
| 媒体整理/工具 | Cron 说明和保存状态缺失；已整理目录文案不一致 | 补 5 段 Cron/北京时间/示例、保存后的定时状态及目录文案；复核预览 → 明确执行、记录/暂停恢复、下载异常处理；旧整理页面保留兼容代码，导航仍按 web 导向设置 |
| Emby | 分类只有文字按钮，没有库图片；最近/继续观看顺序和数量不同 | 增加真实鉴权图片分类卡，按参考顺序展示最近入库/继续播放，每区最多 10 项；保留站点筛选、真实错误、空态和刷新 |
| 日志 | 默认关闭自动刷新，默认 200 条，关键词编辑不发起查询 | 默认开启 5 秒刷新、500 条，关键词依赖触发查询；模块下拉、导出列头补齐 |
| 登录 | 首次设置仍使用 current-password 自动填充 | 初始密码/确认密码用 new-password；核对管理员创建、错误提示、忙态、重试连接；保持 MediaHub 品牌 |
| G 组织 | 大量生产组件和契约平铺 src；页面耦合模板；样式集中堆叠 | 页面在 `pages/`，通用控件在 `components/`，API/契约/格式化在 `lib/`，状态在 `hooks/`，布局在 `layouts/`，演示在 `mocks/`；分拆动漫各步骤、详情、下载、设置面板、日历、日志和工作区导航；样式按职责拆分并保留级联顺序；模板独立动态加载 |

## 真实执行的验收命令与结论

本机 pnpm 会在运行脚本前尝试校验/重装依赖，默认缓存锁目录只读；因此脚本使用 `--config.verifyDepsBeforeRun=false`，没有重装项目依赖或更改锁文件。最初普通 `pnpm typecheck` 出现依赖锁目录警告，但仍执行了 tsc；后续使用显式开关消除该环境问题。

| 目录 | 真实执行命令 | 真实输出结论 |
| --- | --- | --- |
| hero | `pnpm --config.verifyDepsBeforeRun=false typecheck` | `tsc -b`，退出 0 |
| hero | `pnpm --config.verifyDepsBeforeRun=false test` | Node TAP：25 tests，25 pass，0 fail |
| hero | `pnpm --config.verifyDepsBeforeRun=false build` | `tsc -b && vite build`，退出 0；Vite 成功生成构建产物，生产入口及演示模板分包 |
| web | `pnpm --config.verifyDepsBeforeRun=false typecheck` | `tsc -b`，退出 0 |
| web | `pnpm --config.verifyDepsBeforeRun=false lint` | `eslint .`，退出 0 |
| web | `pnpm --config.verifyDepsBeforeRun=false build` | 退出 0；Vite 构建完成，保留原有主 chunk 超过 500 kB 提示（693.50 kB） |
| api | `export PATH=/home/yuxh/.local/bin:/home/yuxh/.local/go/bin:$PATH GOCACHE=/tmp/mediahub-go-cache; go build ./...` | 退出 0，无诊断 |
| api | 相同环境下 `go vet ./...` | 退出 0，无诊断 |
| api | 相同环境下 `go test ./... -count=1` | 退出 0；anime/animesync/discovery/download/httpapi/organize/pan115/pansoubridge/providers/store/textmatch/tmdb/tv 等测试通过，其余包报告 no test files |
| 运行中服务 | `curl -fsS http://127.0.0.1:18080/api/health` | `{"status":"ok"}`；没有重启或新占用服务端口 |
| 真实登录页 | Chromium 打开 5173、5174 | 两边正常显示创建管理员账号页，零 pageerror；`/api/auth/setup/status` 返回 `setupRequired:true`，未创建账号 |
| 浏览器回归 | `PLAYWRIGHT_BROWSERS_PATH=/tmp/mediahub-playwright MEDIAHUB_PLAYWRIGHT_MODULE=/tmp/mediahub-npm-cache/_npx/420ff84f11983ee5/node_modules/@playwright/test/index.mjs node hero/scripts/check-parity-browser.mjs` | 退出 0；分步添加、分页、字幕组正则、解析错误重试、多行规则、预览/保存、非弹窗详情、1440/390px 布局、增量分类、转存错误重试、一键转存、刷新后历史结果转存、TV Go 正则保存、日志查询、全部设置 tab、下载记录、web 基准详情左右栏均通过；零 pageerror |

浏览器回归脚本**拦截全部 API 请求使用测试样本**，只验证 UI 和调用契约，不代表真实 Mikan/PanSou/115/Emby 成功；测试代码不参与应用运行。浏览器和格式化工具只安装在 `/tmp`，未增加项目第三方 UI/状态/运行时依赖。截图也只位于 `/tmp`，测试环境缺 CJK 字体，中文通过 DOM 文案断言验收，不能把截图当作逐像素中文字体验收。

新增 Node 回归验证增量结果保留与去重、后到达链接元信息、一键整份转存/全局目录/作品身份、其他网盘拒绝与后端错误传播、请求取消。开发中曾出现测试夹具未设置 503 状态导致 1 项失败，修正夹具后 25 项全部通过；没有隐藏失败测试。

## 分段提交与推送

原工作区 `.git` 被环境挂载为只读。各里程碑最初直接 `git add -A` 均报：

```text
fatal: Unable to create '/data/projects/mediahub/.git/index.lock': Read-only file system
```

为完成用户已授权的提交/push，改在可写的 `/tmp/mediahub-hero-delivery` 从同一基线建立独立检出，按分层重构、A、B、C、D、E、F/后续重构顺序重放实现并分别推送。**每次成功推送后都检查独立检出 status 为空，且本地 HEAD 等于远端 main。** 最终源码和报告同步保留在原工作区。

| commit | 提交信息 | push |
| --- | --- | --- |
| e3c8b5d2526ac2012d189413057b08685315b02c | refactor(hero): separate pages shared components contracts and demo modules | 成功 |
| abae3b1ba0e368680ef74ead4262fceffe2ddea3 | chore(hero): exclude local dependency links from version control | 成功 |
| e56344ecc9d5ada1d323f197e2a860bf35e6a550 | feat(hero): restore staged anime source group rule and preview workflow | 成功 |
| 3098f63d10087a67335286933d1a7eab31074044 | feat(hero): use shared anime detail pages and persistent card controls | 成功 |
| ea356d239ea5fd7a2e4b319ef8a876f9da0d60e4 | fix(hero): retain discovery resource callback after anime routing change | 成功 |
| dc613754cf38562654beabecb810127fe874f906 | feat(hero): align discovery cards source selection titles and resource searches | 成功 |
| 4657c76107716a19a55d85de2c17bcee97137991 | feat(hero): restore artwork detail hero and responsive profile cast columns | 成功 |
| feb8127af1df3c6f832a5b7e08d674ea128fe0da | feat(hero): align PanSou incremental history search and one-click 115 transfers | 成功 |
| 15cdbda94980c358b9dd587c88a596be564e6b92 | feat(hero): fix audited page flows and extract workspace discovery and search state | 成功 |
| 6a1dab977b3d772675fa3e6c003db474ff56870d | refactor(hero): split workspace chrome and align default TV search source | 成功 |
| 21e03f8c15850c8acc8883b3666568a5ebaaa5e0 | feat(hero): restore ranking descriptions timestamps and source attribution | 成功 |

测试/验收报告提交的最终 hash 见交付消息与 `git log`；报告不能在自己的内容中嵌入自身提交 hash。

过程说明：第一个独立检出误暂存了本地 node_modules 符号链接，已由 `abae3b1` 删除并补忽略规则，最终树没有该链接。`3098f63` 的中间检查发现探索页 callback 被遗漏，已在紧接着的 `ea356d2` 修正并通过类型检查。Git 凭证助手保存凭据时仍打印 `fatal: unable to get credential storage lock in 1000 ms: Read-only file system`，但 push 本身退出 0、远端 main 实际更新，均已通过 ls-remote 核实。

## 未完成的验收、保留项与环境限制

1. **真实业务样本联调未完成。** 当前实例未初始化管理员，没有真实会话；未验证实际 Mikan/AniBT/AnimeGarden 搜索、真实 PanSou 插件结果、真实 115 入队/文件转存/整理或 Emby 图片返回。没有使用假数据冒充真实接口成功，没有创建管理员或修改用户网盘数据。代码契约测试与浏览器测试不替代这些验收。
2. **原工作区无法变成 git clean。** 其 `.git` 仍只读，HEAD 留在原基线，git 会把已推送的新目录视为未跟踪、旧目录视为删除。独立检出的 main 是实际提交并推送且干净的交付版本；原工作区源码与交付版本逐文件核对。这是 Git 元数据权限问题，不能声称原工作区 HEAD 已更新。
3. **未声称逐像素完全一致。** 控件保留 HeroUI 的设计；真实数据、中文系统字体和所有浏览器/屏幕组合尚未穷举。实际验收覆盖列出的页面、关键交互和两个宽度。
4. **保留的长文件。** 独立演示模板仍约 1310 行，不进入生产入口；兼容的旧整理页面、探索筛选视图仍为几百行。生产状态、来源/规则步骤、详情、下载弹层和设置面板已经拆开，未为达到任意行数把代码切成无职责片段。
5. **web 自身历史文案未改。** 例如动漫页仍有“下载和整理尚未接入”的旧说明，与后续下载模块实现不一致；依任务书约束只记录，不修改参考前端。
