package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"media-center/internal/store"
	"media-center/internal/tv"
)

// MountTV applies the same browser-session/API-key boundary as other application APIs.
func MountTV(router *gin.Engine, db *store.Store, service *tv.Service) {
	api := &API{store: db}
	group := router.Group("/api/v1/subscriptions/tv", api.requireAPI())
	failure := func(c *gin.Context, err error) {
		status := 500
		message := "追剧操作失败"
		switch {
		case errors.Is(err, store.ErrNotFound):
			status = 404
			message = "追剧订阅不存在"
		case errors.Is(err, store.ErrSubscriptionExists):
			status = 409
			message = "这一季已经订阅"
		case errors.Is(err, tv.ErrBusy):
			status = 409
			message = err.Error()
		case errors.Is(err, tv.ErrIdentityImmutable):
			status = 400
			message = err.Error()
		}
		fail(c, status, message)
	}
	bind := func(c *gin.Context) (tv.Draft, bool) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		var d tv.Draft
		if c.ShouldBindJSON(&d) != nil {
			fail(c, 400, "订阅参数无效")
			return d, false
		}
		if err := tv.Validate(&d); err != nil {
			fail(c, 400, err.Error())
			return d, false
		}
		return d, true
	}
	group.GET("", func(c *gin.Context) {
		items, err := db.ListTV()
		if err != nil {
			failure(c, err)
			return
		}
		c.JSON(200, items)
	})
	group.POST("", func(c *gin.Context) {
		d, ok := bind(c)
		if !ok {
			return
		}
		sub, err := db.CreateTV(d)
		if err != nil {
			failure(c, err)
			return
		}
		service.Wake()
		_ = db.RecordLog("追剧", "INFO", "添加追剧订阅《"+d.Title+"》")
		c.JSON(201, sub)
	})
	group.PUT("/:id", func(c *gin.Context) {
		d, ok := bind(c)
		if !ok {
			return
		}
		sub, err := db.UpdateTV(c.Param("id"), d)
		if err != nil {
			failure(c, err)
			return
		}
		service.Wake()
		c.JSON(200, sub)
	})
	group.DELETE("/:id", func(c *gin.Context) {
		if err := db.DeleteTV(c.Param("id")); err != nil {
			failure(c, err)
			return
		}
		c.Status(204)
	})
	group.POST("/:id/refresh", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		sub, err := service.Refresh(ctx, c.Param("id"))
		if err != nil {
			failure(c, err)
			return
		}
		c.JSON(200, sub)
	})
}
