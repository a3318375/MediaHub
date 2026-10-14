package httpapi

import (
	"context"
	"errors"
	"github.com/gin-gonic/gin"
	"media-center/internal/organize"
	"media-center/internal/pan115"
	"net/http"
	"strings"
	"time"
)

func organizeFailure(c *gin.Context, e error) {
	switch {
	case errors.Is(e, organize.ErrNotFound):
		fail(c, 404, "整理规则或计划不存在")
	case errors.Is(e, organize.ErrConflict):
		fail(c, 409, "整理计划已变更，请刷新或重新预览")
	default:
		fail(c, 422, e.Error())
	}
}
func (a *API) mountOrganize(v1 *gin.RouterGroup) {
	v1.GET("/organize/config", func(c *gin.Context) {
		r, e := a.store.SimpleOrganizeRule()
		if errors.Is(e, organize.ErrNotFound) {
			c.JSON(200, gin.H{"sourceId": "", "targetId": "", "cron": "", "enabled": false})
			return
		}
		if e != nil {
			fail(c, 500, "读取整理设置失败")
			return
		}
		r.Cron = organize.CronExpression(r)
		c.JSON(200, r)
	})
	v1.PUT("/organize/config", a.requireUser(), func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var body struct {
			Cron     string `json:"cron"`
			SourceID string `json:"sourceId"`
			TargetID string `json:"targetId"`
			DailyAt  string `json:"dailyAt"`
			Enabled  bool   `json:"enabled"`
		}
		if c.ShouldBindJSON(&body) != nil {
			fail(c, 400, "目录设置格式无效")
			return
		}
		a.credentialMu.Lock()
		defer a.credentialMu.Unlock()
		r := organize.Rule{Name: "媒体整理", Simple: true, SourceID: body.SourceID, TargetID: body.TargetID, Cron: body.Cron, DailyAt: body.DailyAt, Enabled: body.Enabled, Recursive: true, TypeHint: "auto", KeepQuality: true}
		r.Cron = strings.TrimSpace(r.Cron)
		if r.Cron == "" && body.DailyAt != "" {
			r.Cron = organize.CronExpression(r)
		}
		r.DailyAt = ""
		r.Enabled = false
		if r.Cron != "" {
			if _, e := organize.ParseCron(r.Cron); e == nil {
				r.Enabled = true
			} else {
				r.ScheduleError = e.Error()
			}
		}
		if e := organize.ValidateRule(r); e != nil {
			fail(c, 400, e.Error())
			return
		}
		cookie, e := a.store.ReadSecret("115", "115.cookie")
		if e != nil {
			fail(c, 503, "读取 115 凭据失败")
			return
		}
		r.AccountID, e = pan115.AccountID(cookie)
		if e != nil {
			organizeFailure(c, e)
			return
		}
		old, e := a.store.SimpleOrganizeRule()
		if e == nil {
			r.ID = old.ID
		} else if !errors.Is(e, organize.ErrNotFound) {
			fail(c, 500, "读取整理设置失败")
			return
		}
		saved, e := a.store.SaveOrganizeRule(r)
		if e != nil {
			organizeFailure(c, e)
			return
		}
		legacy, e := a.store.OrganizeRules()
		if e != nil {
			organizeFailure(c, e)
			return
		}
		for _, rule := range legacy {
			if !rule.Simple && rule.Enabled {
				rule.Enabled = false
				if _, e = a.store.SaveOrganizeRule(rule); e != nil {
					organizeFailure(c, e)
					return
				}
			}
		}
		saved.Cron = organize.CronExpression(saved)
		c.JSON(200, saved)
	})
	v1.GET("/organize/rules", func(c *gin.Context) {
		rules, e := a.store.OrganizeRules()
		if e != nil {
			fail(c, 500, "读取整理规则失败")
			return
		}
		c.JSON(200, rules)
	})
	v1.POST("/organize/rules", a.requireUser(), func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
		var r organize.Rule
		if c.ShouldBindJSON(&r) != nil {
			fail(c, 400, "整理规则格式无效")
			return
		}
		if e := organize.ValidateRule(r); e != nil {
			fail(c, 400, e.Error())
			return
		}
		cookie, e := a.store.ReadSecret("115", "115.cookie")
		if e != nil {
			fail(c, 503, "读取 115 凭据失败")
			return
		}
		r.AccountID, e = pan115.AccountID(cookie)
		if e != nil {
			organizeFailure(c, e)
			return
		}
		r, e = a.store.SaveOrganizeRule(r)
		if e != nil {
			organizeFailure(c, e)
			return
		}
		c.JSON(200, r)
	})
	v1.GET("/organize/plans", func(c *gin.Context) {
		plans, e := a.store.OrganizePlans(false)
		if e != nil {
			fail(c, 500, "读取整理计划失败")
			return
		}
		c.JSON(200, plans)
	})
	v1.POST("/organize/rules/:id/preview", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 50*time.Second)
		defer cancel()
		p, e := a.organizer.Preview(ctx, c.Param("id"))
		if e != nil {
			organizeFailure(c, e)
			return
		}
		c.JSON(200, p)
	})
	v1.POST("/organize/plans/:id/start", func(c *gin.Context) {
		p, e := a.organizer.Start(c.Param("id"))
		if e != nil {
			organizeFailure(c, e)
			return
		}
		c.JSON(202, p)
	})
	v1.POST("/organize/files/:id/binding", a.requireUser(), func(c *gin.Context) {
		if !pan115.ValidDirectory(c.Param("id")) {
			fail(c, 400, "文件 ID 无效")
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		var b organize.Binding
		if c.ShouldBindJSON(&b) != nil {
			fail(c, 400, "作品绑定格式无效")
			return
		}
		if e := organize.ValidateMedia(b.Media); e != nil {
			fail(c, 400, e.Error())
			return
		}
		cookie, e := a.store.ReadSecret("115", "115.cookie")
		if e != nil {
			fail(c, 503, "读取 115 凭据失败")
			return
		}
		account, e := pan115.AccountID(cookie)
		if e != nil {
			organizeFailure(c, e)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		g, e := a.downloads.Factory(ctx, cookie)
		if e == nil {
			e = g.CheckAccount()
		}
		if e != nil {
			organizeFailure(c, pan115.SafeError(e))
			return
		}
		f, e := g.GetFile(c.Param("id"))
		if e != nil {
			organizeFailure(c, pan115.SafeError(e))
			return
		}
		if f.Directory {
			fail(c, 400, "请选择具体媒体文件")
			return
		}
		if e = a.store.BindOrganizeFile(account, f, b); e != nil {
			organizeFailure(c, e)
			return
		}
		c.JSON(200, gin.H{"saved": true})
	})
}
