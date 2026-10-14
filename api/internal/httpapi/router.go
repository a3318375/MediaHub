package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"media-center/internal/anime"
	"media-center/internal/animesync"
	"media-center/internal/discovery"
	"media-center/internal/download"
	"media-center/internal/organize"
	"media-center/internal/pansoubridge"
	"media-center/internal/providers/douban"
	"media-center/internal/store"
	"media-center/internal/tmdb"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type API struct {
	organizer       *organize.Service
	downloads       *download.Service
	animeUpdater    *animesync.Updater
	credentialMu    sync.Mutex
	tmdbFingerprint [32]byte
	discoveryMu     sync.Mutex
	discovery       *discovery.Service
	doubanImages    *douban.Provider
	tmdb            *tmdb.Client
	store           *store.Store
	embyMu          sync.Mutex
	embyCache       *EmbyDashboardResponse
	embyCacheKey    string
	embyCachedAt    time.Time
}

type authUser struct {
	ID      string `json:"id"`
	Account string `json:"account"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Avatar  string `json:"avatar"`
}

func NewRouter(db *store.Store, resourceSearch ...gin.HandlerFunc) *gin.Engine {
	return NewRouterWithAnime(db, animesync.New(db, anime.New()), resourceSearch...)
}
func NewRouterWithAnime(db *store.Store, updater *animesync.Updater, resourceSearch ...gin.HandlerFunc) *gin.Engine {
	return NewRouterWithServices(db, updater, download.New(db), resourceSearch...)
}
func NewRouterWithServices(db *store.Store, updater *animesync.Updater, downloads *download.Service, resourceSearch ...gin.HandlerFunc) *gin.Engine {
	return NewRouterWithOrganizer(db, updater, downloads, &organize.Service{Store: db, Factory: downloads.Factory}, resourceSearch...)
}
func NewRouterWithOrganizer(db *store.Store, updater *animesync.Updater, downloads *download.Service, organizer *organize.Service, resourceSearch ...gin.HandlerFunc) *gin.Engine {
	api := &API{store: db, tmdb: tmdb.NewClient(), animeUpdater: updater, downloads: downloads, organizer: organizer}
	organizer.Resolve = api.resolveOrganizeMedia
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(api.requestLog())
	router.GET("/api/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	auth := router.Group("/api/auth")
	auth.GET("/setup/status", api.setupStatus)
	auth.POST("/setup", api.setup)
	auth.POST("/login", api.login)
	auth.GET("/me", api.requireUser(), api.me)
	auth.POST("/logout", api.requireUser(), api.logout)
	auth.PATCH("/account", api.requireUser(), api.updateAccount)
	auth.POST("/password", api.requireUser(), api.updatePassword)

	settings := router.Group("/api/settings", api.requireUser())
	settings.GET("/:section", api.getSettings)
	settings.PUT("/:section", api.putSettings)
	settings.POST("/:section/secrets/reveal", api.revealSetting)
	router.GET("/api/emby/dashboard", api.requireUser(), api.embyDashboard)
	router.GET("/api/emby/items/:id/image", api.requireUser(), api.embyImage)
	router.GET("/api/media/providers", api.requireUser(), api.mediaProviders)
	router.GET("/api/media/rankings", api.requireUser(), api.mediaRankings)
	router.GET("/api/media/image", api.requireUser(), api.mediaImage)
	router.GET("/api/media/discover", api.requireUser(), api.discoverMedia)
	router.GET("/api/media/:source/:sourceId", api.requireUser(), api.detailMedia)
	router.GET("/api/logs", api.requireUser(), api.listLogs)

	keys := auth.Group("/api-keys", api.requireUser())
	keys.GET("", api.listAPIKeys)
	keys.POST("", api.createAPIKey)
	keys.DELETE("/:id", api.revokeAPIKey)

	// Versioned application APIs use requireAPI, which accepts browser sessions
	// and managed API keys. Feature modules (search, downloads, etc.) mount here.
	v1 := router.Group("/api/v1", api.requireAPI())
	v1.GET("/whoami", api.apiWhoAmI)
	api.mountAnime(v1)
	api.mountDownloads(v1)
	api.mountOrganize(v1)
	if len(resourceSearch) > 0 && resourceSearch[0] != nil {
		v1.POST("/resources/search", resourceSearch[0])
	}
	if len(resourceSearch) > 1 && resourceSearch[1] != nil {
		v1.GET("/resources/meta", resourceSearch[1])
	}
	if len(resourceSearch) > 2 && resourceSearch[2] != nil {
		v1.POST("/resources/check", resourceSearch[2])
	}
	return router
}

func (a *API) requestLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		if strings.HasPrefix(c.Request.URL.Path, "/api/media/") && c.Request.Context().Err() == context.Canceled {
			return
		}
		status := c.Writer.Status()
		level := "INFO"
		if status >= 500 {
			level = "ERROR"
		} else if status >= 400 {
			level = "WARN"
		}
		source := "api"
		if strings.HasPrefix(c.Request.URL.Path, "/api/auth") {
			source = "auth"
		}
		if strings.HasPrefix(c.Request.URL.Path, "/api/settings") {
			source = "settings"
		}
		if strings.HasPrefix(c.Request.URL.Path, "/api/logs") {
			source = "logs"
		}
		message := c.Request.Method + " " + c.Request.URL.Path + " → " + http.StatusText(status) + " (" + time.Since(started).Round(time.Millisecond).String() + ")"
		_ = a.store.RecordLog(source, level, message)
	}
}

func (a *API) listLogs(c *gin.Context) {
	limit := 200
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			limit = parsed
		}
	}
	entries, err := a.store.ListLogs(c.Query("level"), c.Query("source"), c.Query("query"), limit)
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取日志失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": entries})
}

func (a *API) setupStatus(c *gin.Context) {
	exists, err := a.store.HasUser()
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取初始化状态失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"setupRequired": !exists})
}

func (a *API) setup(c *gin.Context) {
	var body struct {
		Account  string `json:"account"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	body.Account = strings.TrimSpace(body.Account)
	body.Name = strings.TrimSpace(body.Name)
	if !validAccount(body.Account) {
		fail(c, http.StatusBadRequest, "账号需为 3 到 32 位字母、数字、点、下划线或短横线")
		return
	}
	if !validPassword(body.Password) {
		fail(c, http.StatusBadRequest, "密码不能为空，且不能超过 72 字节")
		return
	}
	if body.Name == "" {
		body.Name = body.Account
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "创建账号失败")
		return
	}
	user, err := a.store.CreateUser(body.Account, body.Name, string(hash))
	if err != nil {
		if errors.Is(err, store.ErrAlreadyInitialized) {
			fail(c, http.StatusConflict, "管理员账号已创建")
			return
		}
		// The singleton user ID and unique account constraint also make concurrent setup attempts safe.
		fail(c, http.StatusConflict, "管理员账号已创建或账号已被占用")
		return
	}
	a.issueSession(c, user)
}

func (a *API) login(c *gin.Context) {
	var body struct {
		Account  string `json:"account"`
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	user, err := a.store.UserByAccount(strings.TrimSpace(body.Account))
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
		fail(c, http.StatusUnauthorized, "账号或密码不正确")
		return
	}
	a.issueSession(c, user)
}

func (a *API) issueSession(c *gin.Context, user store.User) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		fail(c, http.StatusInternalServerError, "创建登录会话失败")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := a.store.CreateSession(store.HashToken(token), user.ID, time.Now().Add(7*24*time.Hour)); err != nil {
		fail(c, http.StatusInternalServerError, "创建登录会话失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"accessToken": token, "user": toAuthUser(user)})
}

func (a *API) requireUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			fail(c, http.StatusUnauthorized, "请先登录")
			c.Abort()
			return
		}
		user, err := a.store.SessionUser(store.HashToken(parts[1]))
		if err != nil {
			fail(c, http.StatusUnauthorized, "登录已失效，请重新登录")
			c.Abort()
			return
		}
		c.Set("authUser", user)
		c.Set("authTokenHash", store.HashToken(parts[1]))
		c.Next()
	}
}

// requireAPI allows either a browser session or a managed integration key.
// Keep account, setup, key-management and settings routes behind requireUser.
func (a *API) requireAPI() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
			fail(c, http.StatusUnauthorized, "请先提供有效的 Bearer Token")
			c.Abort()
			return
		}
		hash := store.HashToken(parts[1])
		user, err := a.store.SessionUser(hash)
		if err == nil {
			c.Set("authUser", user)
			c.Set("authMethod", "session")
			c.Next()
			return
		}
		user, err = a.store.APIKeyUser(hash)
		if err != nil {
			fail(c, http.StatusUnauthorized, "API Key 无效或已撤销")
			c.Abort()
			return
		}
		c.Set("authUser", user)
		c.Set("authMethod", "apiKey")
		c.Next()
	}
}

func (a *API) listAPIKeys(c *gin.Context) {
	user, _ := currentUser(c)
	keys, err := a.store.ListAPIKeys(user.ID)
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取 API Key 失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": keys})
}

func (a *API) createAPIKey(c *gin.Context) {
	user, _ := currentUser(c)
	var body struct {
		Name string `json:"name"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if len([]rune(body.Name)) < 1 || len([]rune(body.Name)) > 64 {
		fail(c, http.StatusBadRequest, "名称长度需为 1 到 64 个字符")
		return
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		fail(c, http.StatusInternalServerError, "生成 API Key 失败")
		return
	}
	token := "mc_" + base64.RawURLEncoding.EncodeToString(raw)
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		fail(c, http.StatusInternalServerError, "生成 API Key 失败")
		return
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)
	key, err := a.store.CreateAPIKey(id, user.ID, body.Name, token[:11], store.HashToken(token))
	if err != nil {
		fail(c, http.StatusInternalServerError, "保存 API Key 失败")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": key, "key": token})
}

func (a *API) revokeAPIKey(c *gin.Context) {
	user, _ := currentUser(c)
	if err := a.store.RevokeAPIKey(user.ID, c.Param("id")); err != nil {
		fail(c, http.StatusInternalServerError, "撤销 API Key 失败")
		return
	}
	c.Status(http.StatusNoContent)
}

func (a *API) apiWhoAmI(c *gin.Context) {
	user, _ := currentUser(c)
	method, _ := c.Get("authMethod")
	c.JSON(http.StatusOK, gin.H{"user": toAuthUser(user), "authenticatedBy": method})
}

func (a *API) me(c *gin.Context) { user, _ := currentUser(c); c.JSON(http.StatusOK, toAuthUser(user)) }

func (a *API) logout(c *gin.Context) {
	hash, _ := c.Get("authTokenHash")
	if err := a.store.DeleteSession(hash.(string)); err != nil {
		fail(c, http.StatusInternalServerError, "退出登录失败")
		return
	}
	c.Status(http.StatusNoContent)
}

func (a *API) updateAccount(c *gin.Context) {
	user, _ := currentUser(c)
	var body struct {
		Account         string `json:"account"`
		CurrentPassword string `json:"currentPassword"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	body.Account = strings.TrimSpace(body.Account)
	if !validAccount(body.Account) {
		fail(c, http.StatusBadRequest, "账号需为 3 到 32 位字母、数字、点、下划线或短横线")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		fail(c, http.StatusUnauthorized, "当前密码不正确")
		return
	}
	if err := a.store.UpdateUser(user.ID, body.Account, user.Name); err != nil {
		fail(c, http.StatusConflict, "账号已被占用或保存失败")
		return
	}
	user.Account = body.Account
	c.JSON(http.StatusOK, toAuthUser(user))
}

func (a *API) updatePassword(c *gin.Context) {
	user, _ := currentUser(c)
	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		fail(c, http.StatusUnauthorized, "当前密码不正确")
		return
	}
	if !validPassword(body.NewPassword) {
		fail(c, http.StatusBadRequest, "新密码不能为空，且不能超过 72 字节")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "密码更新失败")
		return
	}
	if err := a.store.UpdatePassword(user.ID, string(hash)); err != nil {
		fail(c, http.StatusInternalServerError, "密码更新失败")
		return
	}
	// Revoke all previous sessions, then issue a fresh session for this browser.
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		fail(c, http.StatusInternalServerError, "密码已更新，请重新登录")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := a.store.CreateSession(store.HashToken(token), user.ID, time.Now().Add(7*24*time.Hour)); err != nil {
		fail(c, http.StatusInternalServerError, "密码已更新，请重新登录")
		return
	}
	c.JSON(http.StatusOK, gin.H{"accessToken": token, "user": toAuthUser(user)})
}

var accountPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{3,32}$`)

func validAccount(value string) bool  { return accountPattern.MatchString(value) }
func validPassword(value string) bool { return len([]byte(value)) >= 1 && len([]byte(value)) <= 72 }
func currentUser(c *gin.Context) (store.User, bool) {
	value, ok := c.Get("authUser")
	if !ok {
		return store.User{}, false
	}
	user, ok := value.(store.User)
	return user, ok
}
func toAuthUser(user store.User) authUser {
	return authUser{ID: user.ID, Account: user.Account, Name: user.Name, Email: "", Avatar: ""}
}
func fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"message": message})
}

func validSection(section string) bool {
	switch section {
	case "tmdb", "emby", "115", "organize", "search", "pansou", "notifications":
		return true
	default:
		return false
	}
}

func (a *API) getSettings(c *gin.Context) {
	section := c.Param("section")
	if !validSection(section) {
		fail(c, http.StatusNotFound, "配置分类不存在")
		return
	}
	values, secrets, err := a.store.ReadSettings(section)
	if err != nil {
		fail(c, http.StatusInternalServerError, "读取配置失败")
		return
	}
	a.settingsResponse(c, section, values, secrets)
}

func (a *API) putSettings(c *gin.Context) {
	section := c.Param("section")
	if !validSection(section) {
		fail(c, http.StatusNotFound, "配置分类不存在")
		return
	}
	var body struct {
		Values       map[string]json.RawMessage `json:"values"`
		ClearSecrets []string                   `json:"clearSecrets"`
	}
	if c.ShouldBindJSON(&body) != nil {
		fail(c, http.StatusBadRequest, "请求格式不正确")
		return
	}
	if body.Values == nil {
		body.Values = map[string]json.RawMessage{}
	}
	if section == "pansou" {
		if err := pansoubridge.ValidateSettings(body.Values); err != nil {
			fail(c, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := a.store.SaveSettings(section, body.Values, body.ClearSecrets); err != nil {
		fail(c, http.StatusBadRequest, "配置保存失败："+err.Error())
		return
	}
	if section == "115" && a.animeUpdater != nil {
		a.animeUpdater.Wake()
	}
	if section == "115" && a.downloads != nil {
		if err := a.downloads.CredentialsChanged(); err != nil {
			fail(c, 500, "配置已保存，下载队列唤醒失败，请稍后重试")
			return
		}
	}
	values, secrets, err := a.store.ReadSettings(section)
	if err != nil {
		fail(c, http.StatusInternalServerError, "配置已保存但读取状态失败")
		return
	}
	a.settingsResponse(c, section, values, secrets)
}
