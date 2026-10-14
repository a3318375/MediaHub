package httpapi

import (
	"context"
	"errors"
	"github.com/gin-gonic/gin"
	"media-center/internal/anime"
	"media-center/internal/animesync"
	"media-center/internal/download"
	"media-center/internal/pan115"
	"media-center/internal/store"
	"net/http"
	"time"
)

func (s *API) mountAnime(v1 *gin.RouterGroup) {
	service := anime.New()
	for _, source := range []string{"ani-bt", "anime-garden"} {
		v1.GET("/anime/sources/"+source+"/catalog", func(c *gin.Context) {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
			defer cancel()
			out, e := service.SourceCatalog(ctx, source, c.Query("query"), c.Query("season"), c.Query("refresh") == "true")
			if e != nil {
				fail(c, 502, e.Error())
				return
			}
			c.JSON(200, out)
		})
		v1.GET("/anime/sources/"+source+"/:id/groups", func(c *gin.Context) {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
			defer cancel()
			out, e := service.SourceGroups(ctx, source, c.Param("id"), c.Query("refresh") == "true")
			if e != nil {
				fail(c, 502, e.Error())
				return
			}
			c.JSON(200, out)
		})
	}
	v1.POST("/subscriptions/anime/:id/downloads/retry", func(c *gin.Context) {
		count, err := s.store.RetryAnimeCandidates(c.Param("id"))
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				fail(c, 404, "订阅不存在")
			} else {
				downloadFailure(c, err)
			}
			return
		}
		s.downloads.Wake()
		c.JSON(200, gin.H{"count": count})
	})
	v1.GET("/subscriptions/anime/:id/downloads", func(c *gin.Context) {
		id := c.Param("id")
		rule, err := s.store.GetAnimeDownloadRule(id)
		if errors.Is(err, store.ErrNotFound) {
			fail(c, 404, "订阅不存在")
			return
		}
		if err != nil {
			fail(c, 500, "读取下载配置失败")
			return
		}
		items, err := s.store.ListAnimeCandidates(id)
		if err != nil {
			fail(c, 500, "读取下载候选失败")
			return
		}
		c.JSON(200, gin.H{"rule": rule, "items": items, "limit": 1000})
	})
	v1.PUT("/subscriptions/anime/:id/downloads", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		var rule download.AnimeDownloadRule
		if err := c.ShouldBindJSON(&rule); err != nil {
			fail(c, 400, "下载配置格式无效")
			return
		}
		if err := s.store.SetAnimeDownloadRule(c.Param("id"), rule); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				fail(c, 404, "订阅不存在")
			} else if _, ok := err.(*pan115.Error); ok {
				downloadFailure(c, err)
			} else {
				fail(c, 400, "请填写具体的 115 目录 ID 和有效起始集数")
			}
			return
		}
		s.downloads.Wake()
		c.JSON(200, rule)
	})
	v1.GET("/anime/sources/mikan/catalog", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		out, e := service.Catalog(ctx, c.Query("query"), c.Query("year"), c.Query("season"), c.Query("refresh") == "true")
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.JSON(200, out)
	})
	v1.GET("/anime/sources/mikan/:id/groups", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		out, e := service.Groups(ctx, c.Param("id"), c.Query("refresh") == "true")
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.JSON(200, out)
	})
	bind := func(c *gin.Context) (anime.Draft, bool) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
		var d anime.Draft
		if e := c.ShouldBindJSON(&d); e != nil {
			fail(c, 400, "订阅请求格式无效")
			return d, false
		}
		return d, true
	}
	v1.POST("/subscriptions/anime/resolve", func(c *gin.Context) {
		d, ok := bind(c)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		out, e := service.Resolve(ctx, d)
		if e != nil {
			fail(c, 422, e.Error())
			return
		}
		c.JSON(200, out)
	})
	v1.POST("/subscriptions/anime/preview", func(c *gin.Context) {
		d, ok := bind(c)
		if !ok {
			return
		}
		if e := anime.Validate(&d); e != nil {
			fail(c, 400, e.Error())
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 40*time.Second)
		defer cancel()
		out, e := service.Preview(ctx, d)
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		c.JSON(200, out)
	})
	v1.GET("/subscriptions/anime", func(c *gin.Context) {
		out, e := s.store.ListAnime()
		if e != nil {
			fail(c, 500, "读取订阅失败")
			return
		}
		c.JSON(200, out)
	})
	v1.POST("/subscriptions/anime", func(c *gin.Context) {
		d, ok := bind(c)
		if !ok {
			return
		}
		if e := anime.Validate(&d); e != nil {
			fail(c, 400, e.Error())
			return
		}
		out, e := s.store.CreateAnimeWithDownload(d)
		if errors.Is(e, store.ErrSubscriptionExists) {
			fail(c, 409, "该 Bangumi 作品的这一季已订阅，请勿重复添加")
			return
		}
		if e != nil {
			fail(c, 500, "保存订阅失败")
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		if refreshed, refreshErr := s.animeUpdater.Refresh(ctx, out.ID); refreshErr == nil {
			out = refreshed
		} else if saved, loadErr := s.store.GetAnime(out.ID); loadErr == nil {
			out = saved
		}
		s.downloads.Wake()
		c.JSON(201, out)
	})
	v1.POST("/subscriptions/anime/:id/refresh", func(c *gin.Context) {
		if e := s.store.EnsureAnimeDownloadDefaults(c.Param("id")); e != nil {
			if errors.Is(e, store.ErrNotFound) {
				fail(c, 404, "订阅不存在")
			} else {
				fail(c, 500, "初始化下载规则失败")
			}
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		out, e := s.animeUpdater.Refresh(ctx, c.Param("id"))
		if errors.Is(e, store.ErrNotFound) {
			fail(c, 404, "订阅不存在")
			return
		}
		if errors.Is(e, animesync.ErrBusy) {
			fail(c, 409, e.Error())
			return
		}
		if e != nil {
			fail(c, 502, e.Error())
			return
		}
		s.downloads.Wake()
		c.JSON(200, out)
	})
	v1.PATCH("/subscriptions/anime/:id", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		var body struct {
			Enabled *bool `json:"enabled"`
		}
		if c.ShouldBindJSON(&body) != nil || body.Enabled == nil {
			fail(c, 400, "需要 enabled 状态")
			return
		}
		out, e := s.store.SetAnimeEnabled(c.Param("id"), *body.Enabled)
		if errors.Is(e, store.ErrNotFound) {
			fail(c, 404, "订阅不存在")
			return
		}
		if e != nil {
			fail(c, 500, "保存订阅失败")
			return
		}
		c.JSON(200, out)
	})
}
