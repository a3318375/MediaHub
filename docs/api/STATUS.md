# 项目验证状态

验证时间：2026-10-12T12:06:15+08:00（北京时间）。

工作目录：`/data/projects/媒体中心/media-center-api`。Go 版本：`go1.26.9 linux/amd64`。

本次仅运行构建、静态检查并读取路由源码，未修改现有代码；新增文件为 `docs/STATUS.md`。

## 构建与静态检查

命令依次执行，耗时使用单调时钟测量命令进程的实际运行时间，包含进程启动和退出。
为避免更改模块文件，执行时在 `GOFLAGS` 中追加 `-mod=readonly`；构建缓存使用 `/tmp/media-center-status-gocache`，临时结果保存在 `/tmp`，不写入仓库其它文件。第二项检查可复用第一项的缓存。

| 命令 | 结果 | 退出码 | 耗时（秒） |
| --- | --- | --- | --- |
| `go build ./...` | 通过 | 0 | 11.830 |
| `go vet ./...` | 通过 | 0 | 3.216 |

### `go build ./...` 输出

标准输出：空（无输出）。

标准错误：空（无输出）。

### `go vet ./...` 输出

标准输出：空（无输出）。

标准错误：空（无输出）。

## 已注册 HTTP 路由

来源：`internal/httpapi/router.go` 中的 `NewRouter`，按源码注册顺序列出完整路径，共 **17 条**。路径参数保留 Gin 的 `:参数名` 形式；子组路径已与父组路径拼接。

鉴权说明：

- 公开：未注册鉴权中间件，共 4 条。
- `requireUser`：要求 `Authorization: Bearer <用户会话令牌>`，只接受有效用户会话，共 12 条。
- `requireAPI`：要求 Bearer Token，接受有效用户会话或受管理的 API Key，共 1 条。
- `auth` 组本身没有组级鉴权；其中受保护的路由单独添加 `requireUser`，`keys` 子组添加组级 `requireUser`。

| HTTP 方法 | 完整路径 | 注册组 | 鉴权组／中间件 |
| --- | --- | --- | --- |
| GET | `/api/health` | 根路由 | 公开，无鉴权 |
| GET | `/api/auth/setup/status` | auth：/api/auth | 公开，无鉴权 |
| POST | `/api/auth/setup` | auth：/api/auth | 公开，无鉴权 |
| POST | `/api/auth/login` | auth：/api/auth | 公开，无鉴权 |
| GET | `/api/auth/me` | auth：/api/auth | requireUser（路由级） |
| POST | `/api/auth/logout` | auth：/api/auth | requireUser（路由级） |
| PATCH | `/api/auth/account` | auth：/api/auth | requireUser（路由级） |
| POST | `/api/auth/password` | auth：/api/auth | requireUser（路由级） |
| GET | `/api/settings/:section` | settings：/api/settings | requireUser（组级） |
| PUT | `/api/settings/:section` | settings：/api/settings | requireUser（组级） |
| GET | `/api/emby/dashboard` | 根路由 | requireUser（路由级） |
| GET | `/api/emby/items/:id/image` | 根路由 | requireUser（路由级） |
| GET | `/api/logs` | 根路由 | requireUser（路由级） |
| GET | `/api/auth/api-keys` | keys：/api/auth/api-keys（auth 子组） | requireUser（组级） |
| POST | `/api/auth/api-keys` | keys：/api/auth/api-keys（auth 子组） | requireUser（组级） |
| DELETE | `/api/auth/api-keys/:id` | keys：/api/auth/api-keys（auth 子组） | requireUser（组级） |
| GET | `/api/v1/whoami` | v1：/api/v1 | requireAPI（组级） |

以上为源码注册清单；本次未启动 HTTP 服务或进行接口请求验证。构建与静态检查通过不代表接口运行行为已经验证。
