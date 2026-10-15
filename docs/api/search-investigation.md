# 搜索差异排查（2026-10-13）

对比关键词：拨乱行动。参照服务：http://192.168.5.4:10805/。

## 已确认的问题与修复

1. 内嵌桥接跳过了 PanSou HTTP handler 的默认频道填充。前端传 channels=[] 时，内部 service 实际搜索 0 个 TG 频道。adapter 已填充默认频道，同时保留显式频道选择。
2. 本地调度被额外压低为出口并发 8、后台工作槽 4、后台任务 8。隔离冷缓存实测首轮 12 秒、0 条，68 个插件只有 2 个在批截止内返回；后续缓存补到 68 条。已恢复 PanSou 配置计算，当前机器出口上限 128、后台工作槽 40、任务上限 200，并保留请求入口和磁盘缓存限制。
3. 普通搜索每次 refresh=true，无法享受已有缓存。前端已改为 refresh=false，先 TG、同时预热 all，再收集后续结果。
4. 缺少 PanSou Web 固定 ext.referer=https://dm.xueximeng.com；它参与插件请求及缓存命名。已对齐。参照服务不传 ext 时全来源为 56 条，带页面 ext 时为 88 条，不能把这两个缓存命名空间混为同一次查询。
5. Windows 系统代理已开启 127.0.0.1:7897，但 Go 不自动读取注册表代理。本机直连 TG 全部超时，显式 HTTP_PROXY/HTTPS_PROXY 后 TG 可访问。新增 scripts/dev.ps1：没有显式代理时使用当前 Windows 系统代理，仅作用于启动进程。已用此脚本重启后端。
6. 默认频道补齐 xx123pan，与参照服务的 111 个频道对齐。插件名单同为 68 个；补上 PanSou 主入口原有的 TG 后台可达性探测。

## 实测结果和剩余差异

修复后模拟前端首轮：TG 8 条，约 1.666 秒；后续缓存读取约 10–27 毫秒，最终 86 条：百度 10、夸克 70、磁力 3、UC 1、迅雷 2。

逐链接比较，本地 86 条均包含在参照服务的 88 条中，没有本地独有链接。剩余 2 条都来自 muou：

- 百度 https://pan.baidu.com/s/1GQPGSsg4Mf2e8JCgx-Sd9w?pwd=xcb2
- 夸克 https://pan.quark.cn/s/c4063d854157

本机单独重试 muou 四轮均失败，日志记录上游 HTTP 状态错误；参照服务的 muou 查询仍返回 3 条（其中 UC 与其他插件重复）。候选站点的独立 HTTP 探测也失败。因此剩余差异发生在该插件的上游请求，本次未把远端缓存结果复制进本地，也未宣称两实例完全一致。

## 验证

前端 pnpm build、pnpm lint、resource-search Node 测试通过；后端 go test ./...、go vet ./... 通过。新增回归覆盖默认频道、显式频道、plugin-only 来源、merge 模式、Web referer 和普通搜索不强制刷新。修正了旧校验测试中已不符合当前接口上限的输入。

当前前端 http://127.0.0.1:5173/、后端 http://127.0.0.1:18080/api/health 均返回 200。浏览器自动化运行时不可用，因此耗时来自真实搜索服务诊断，并非浏览器渲染耗时。未修改登录账号、配置或鉴权。

原始响应与日志保存在忽略的 data/search-baseline.*、data/search-fixed.*、data/search-ui.*、data/search-muou.*、data/pansou-all.json。TestLiveSearchComparison 为显式环境变量启用的联网诊断，默认测试跳过。