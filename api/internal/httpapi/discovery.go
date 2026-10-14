package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"media-center/internal/discovery"
	"media-center/internal/providers/anilist"
	"media-center/internal/providers/bangumi"
	"media-center/internal/providers/douban"
	tmdbprovider "media-center/internal/providers/tmdb"
	"media-center/internal/tmdb"
	"net/http"
	"strconv"
	"time"
)

func (a *API) mediaKey(c *gin.Context) (string, bool) {
	key, err := a.readTMDBKey()
	if err != nil || key == "" {
		fail(c, 503, "请先在设置中配置 TMDB API Key")
		return "", false
	}
	return key, true
}
func mediaFailure(c *gin.Context, err error) {
	var de *discovery.Error
	if errors.As(err, &de) {
		if de.RetryAfter != "" {
			c.Header("Retry-After", de.RetryAfter)
		}
		fail(c, de.Status, de.Message)
		return
	}
	var e *tmdb.Error
	if errors.As(err, &e) {
		if e.RetryAfter != "" {
			c.Header("Retry-After", e.RetryAfter)
		}
		fail(c, e.Status, e.Message)
	} else if errors.Is(err, context.DeadlineExceeded) {
		fail(c, 504, "上游请求超时")
	} else if errors.Is(err, context.Canceled) {
		fail(c, 408, "请求已取消")
	} else {
		fail(c, 502, "读取媒体来源失败")
	}
}

func (a *API) discoveryService() *discovery.Service {
	a.discoveryMu.Lock()
	defer a.discoveryMu.Unlock()
	if a.discovery == nil {
		a.doubanImages = douban.New()
		adapter := &tmdbprovider.Provider{Client: a.tmdb, Key: func(ctx context.Context) (string, error) {
			key, e := a.readTMDBKey()
			if e != nil || key == "" {
				return "", discovery.Problem(503, "请先在设置中配置 TMDB API Key")
			}
			return key, nil
		}}
		a.discovery = discovery.NewService(discovery.NewRegistry(adapter, bangumi.New(), anilist.New(), a.doubanImages))
	}
	return a.discovery
}
func parseDiscovery(c *gin.Context) (discovery.Query, error) {
	q := discovery.Query{MediaType: c.Query("mediaType"), Page: 1, PageSize: 20, Genre: c.Query("genre"), Region: c.Query("region"), Year: c.Query("year"), Month: c.Query("month"), Season: c.Query("season"), Status: c.Query("status"), Sort: c.Query("sort"), Search: c.Query("query"), Locale: c.Query("locale")}
	allowed := map[string]bool{}
	for _, k := range []string{"source", "mediaType", "page", "pageSize", "genre", "region", "year", "month", "season", "status", "sort", "query", "locale"} {
		allowed[k] = true
	}
	for k, v := range c.Request.URL.Query() {
		if c.Query("source") == "bangumi" && discovery.Contains([]string{"genre", "region", "season", "status", "platform", "cat"}, k) {
			return q, discovery.Problem(400, "Bangumi 官方接口不支持该筛选（"+k+"）")
		}
		if !allowed[k] || len(v) != 1 {
			return q, discovery.Unsupported(k)
		}
	}
	for _, v := range []struct {
		name string
		dest *int
	}{{"page", &q.Page}, {"pageSize", &q.PageSize}} {
		if raw := c.Query(v.name); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil {
				return q, discovery.Unsupported(v.name)
			}
			*v.dest = n
		}
	}
	return q, nil
}
func (a *API) discoverMedia(c *gin.Context) {
	q, e := parseDiscovery(c)
	if e != nil {
		mediaFailure(c, e)
		return
	}
	service := a.discoveryService()
	p, e := service.Registry.Get(c.Query("source"))
	if e != nil {
		mediaFailure(c, e)
		return
	}
	if e = p.Validate(q); e != nil {
		mediaFailure(c, e)
		return
	}
	if c.Query("source") == "tmdb" {
		if _, ok := a.mediaKey(c); !ok {
			return
		}
	}
	page, e := service.Discover(c.Request.Context(), c.Query("source"), q)
	if e != nil {
		mediaFailure(c, e)
		return
	}
	c.JSON(http.StatusOK, page)
}
func (a *API) detailMedia(c *gin.Context) {
	for k, v := range c.Request.URL.Query() {
		if k != "mediaType" && k != "locale" || len(v) != 1 {
			mediaFailure(c, discovery.Unsupported(k))
			return
		}
	}
	if c.Param("source") == "tmdb" {
		if _, ok := a.mediaKey(c); !ok {
			return
		}
	}
	d, e := a.discoveryService().Detail(c.Request.Context(), c.Param("source"), c.Query("mediaType"), c.Param("sourceId"), c.Query("locale"))
	if e != nil {
		mediaFailure(c, e)
		return
	}
	c.JSON(200, d)
}
func (a *API) mediaProviders(c *gin.Context) {
	service := a.discoveryService()
	if provider, e := service.Registry.Get("anilist"); e == nil {
		if verifier, ok := provider.(interface{ VerifyCapabilities(context.Context) }); ok {
			verifier.VerifyCapabilities(c.Request.Context())
		}
	}
	caps := service.Registry.Capabilities()
	for i := range caps {
		if caps[i].Source == "tmdb" {
			key, e := a.readTMDBKey()
			if e != nil || key == "" {
				caps[i].Available = false
				caps[i].UnavailableReason = "请先在设置中配置 TMDB API Key"
			}
		}
	}
	c.JSON(200, gin.H{"providers": caps})
}
func (a *API) mediaImage(c *gin.Context) {
	for k, v := range c.Request.URL.Query() {
		if k != "source" && k != "url" || len(v) != 1 {
			mediaFailure(c, discovery.Unsupported(k))
			return
		}
	}
	if c.Query("source") != "douban" {
		mediaFailure(c, discovery.Unsupported("source"))
		return
	}
	service := a.discoveryService()
	raw := c.Query("url")
	key := discovery.DetailKey("douban", "image", raw, "zh-CN")
	type image struct {
		Body    []byte
		Content string
	}
	b, e := service.Cache.Load(c.Request.Context(), "douban", key, time.Hour, func(ctx context.Context) ([]byte, bool, error) {
		body, content, e := a.doubanImages.Image(ctx, raw)
		if e != nil {
			return nil, false, e
		}
		b, e := json.Marshal(image{body, content})
		return b, false, e
	})
	if e != nil {
		mediaFailure(c, e)
		return
	}
	var img image
	if json.Unmarshal(b, &img) != nil {
		mediaFailure(c, discovery.Invalid())
		return
	}
	c.Header("Cache-Control", "private, max-age=3600")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, img.Content, img.Body)
}

type rankingDTO struct {
	Source    string          `json:"source"`
	Name      string          `json:"name"`
	Supported bool            `json:"supported"`
	Available bool            `json:"available"`
	Message   string          `json:"message,omitempty"`
	Page      *discovery.Page `json:"result,omitempty"`
}

func (a *API) mediaRankings(c *gin.Context) {
	if len(c.Request.URL.Query()) > 0 {
		mediaFailure(c, discovery.Unsupported("榜单筛选"))
		return
	}
	service := a.discoveryService()
	if _, e := service.Registry.Get("tmdb"); e == nil {
		_, _ = a.readTMDBKey()
	}
	out := []rankingDTO{{Source: "imdb", Name: "top250", Message: "IMDb 榜单暂不支持"}, {Source: "imdb", Name: "popular", Message: "IMDb 榜单暂不支持"}}
	type result struct {
		index int
		page  discovery.Page
		err   error
	}
	defs := [][2]string{{"tmdb", "trending"}, {"douban", "movie_top250"}, {"douban", "tv_hot"}, {"bangumi", "rank"}, {"anilist", "popularity"}}
	ch := make(chan result, len(defs))
	for i, def := range defs {
		go func(i int, def [2]string) {
			page, e := service.Ranking(c.Request.Context(), def[0], def[1])
			ch <- result{i, page, e}
		}(i, def)
	}
	items := make([]rankingDTO, len(defs))
	available := false
	for range defs {
		r := <-ch
		def := defs[r.index]
		d := rankingDTO{Source: def[0], Name: def[1], Supported: true}
		if r.err == nil {
			d.Available = true
			d.Page = &r.page
			available = true
		} else {
			d.Message = r.err.Error()
			var e *discovery.Error
			if errors.As(r.err, &e) && e.Status == 400 {
				d.Supported = false
			}
		}
		items[r.index] = d
	}
	out = append(out, items...)
	if !available {
		c.Header("Retry-After", "60")
		c.JSON(503, gin.H{"rankings": out, "message": "所有榜单来源暂不可用"})
		return
	}
	c.JSON(200, gin.H{"rankings": out})
}

func (a *API) readTMDBKey() (string, error) {
	key, err := a.store.ReadSecret("tmdb", "tmdb.apiKey")
	digest := sha256.Sum256([]byte(key))
	a.discoveryMu.Lock()
	cacheService := a.discovery
	a.discoveryMu.Unlock()
	a.credentialMu.Lock()
	defer a.credentialMu.Unlock()
	if digest != a.tmdbFingerprint {
		a.tmdbFingerprint = digest
		if cacheService != nil {
			cacheService.Cache.Invalidate("tmdb")
		}
	}
	return key, err
}
