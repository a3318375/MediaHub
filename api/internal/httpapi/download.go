package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"media-center/internal/download"
	"media-center/internal/pan115"
)

func downloadFailure(c *gin.Context, err error) {
	var upstream *pan115.Error
	switch {
	case errors.Is(err, download.ErrNotFound):
		fail(c, 404, "下载任务不存在")
	case errors.Is(err, download.ErrConflict):
		fail(c, 409, "任务已变更或同一资源的目标目录不同，请刷新后核对")
	case errors.Is(err, download.ErrQueueFull):
		fail(c, 429, "下载队列已满")
	case errors.As(err, &upstream):
		fail(c, 503, upstream.Message)
	default:
		fail(c, 500, "下载任务处理失败")
	}
}
func (a *API) mountDownloads(v1 *gin.RouterGroup) {
	v1.POST("/downloads/:id/retry", func(c *gin.Context) {
		t, err := a.downloads.Retry(c.Param("id"))
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, t)
	})
	v1.POST("/downloads/:id/resume", func(c *gin.Context) {
		t, err := a.downloads.Resume(c.Param("id"))
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, t)
	})
	v1.POST("/115/share/list", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		var body struct {
			URL         string `json:"url"`
			ReceiveCode string `json:"receiveCode"`
			DirectoryID string `json:"directoryId"`
		}
		if c.ShouldBindJSON(&body) != nil {
			fail(c, 400, "分享请求格式无效")
			return
		}
		_, code, password, err := download.ParseShare(body.URL, body.ReceiveCode)
		if err != nil {
			fail(c, 400, err.Error())
			return
		}
		if body.DirectoryID == "" {
			body.DirectoryID = "0"
		}
		if !pan115.ValidDirectory(body.DirectoryID) {
			fail(c, 400, "分享目录 ID 无效")
			return
		}
		cookie, err := a.store.ReadSecret("115", "115.cookie")
		if err != nil {
			downloadFailure(c, err)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()
		g, err := a.downloads.Factory(ctx, cookie)
		if err == nil {
			err = g.CheckAccount()
		}
		if err != nil {
			downloadFailure(c, err)
			return
		}
		share, ok := g.(pan115.ShareGateway)
		if !ok {
			fail(c, 503, "分享查询尚不可用")
			return
		}
		files, err := share.ListShare(code, password, body.DirectoryID)
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, gin.H{"items": files})
	})
	v1.POST("/downloads", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
		var r download.Request
		if err := c.ShouldBindJSON(&r); err != nil {
			fail(c, 400, "下载请求格式无效")
			return
		}
		automatic := r.DirectoryID == ""
		if automatic {
			r.DirectoryID = "1"
		}
		if _, err := download.Validate(&r); err != nil {
			fail(c, 400, err.Error())
			return
		}
		if automatic {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
			defer cancel()
			var err error
			r.DirectoryID, err = a.downloads.ResolveLibraryDirectory(ctx, r.Reference.Media.Type)
			if err != nil {
				organizeFailure(c, err)
				return
			}
		}
		t, created, err := a.downloads.Enqueue(r)
		if err != nil {
			downloadFailure(c, err)
			return
		}
		status := 200
		if created {
			status = 202
		}
		c.JSON(status, gin.H{"task": t, "created": created})
	})
	v1.GET("/downloads", func(c *gin.Context) {
		list, err := a.store.ListDownloads(false)
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, gin.H{"items": list, "limit": 200})
	})
	v1.GET("/downloads/:id", func(c *gin.Context) {
		t, err := a.store.GetDownload(c.Param("id"))
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, t)
	})
	v1.POST("/downloads/:id/cancel", func(c *gin.Context) {
		t, err := a.downloads.Cancel(c.Param("id"))
		if err != nil {
			downloadFailure(c, err)
			return
		}
		c.JSON(200, gin.H{"task": t, "message": "已停止本地提交或跟踪；115 已接受的任务可能继续，不删除网盘文件"})
	})
	v1.GET("/115/directories", func(c *gin.Context) {
		id := c.DefaultQuery("parentId", "0")
		if !pan115.ValidDirectory(id) {
			fail(c, 400, "目录 ID 无效")
			return
		}
		cookie, err := a.store.ReadSecret("115", "115.cookie")
		if err != nil {
			downloadFailure(c, err)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		g, err := a.downloads.Factory(ctx, cookie)
		if err == nil {
			err = g.CheckAccount()
		}
		if err != nil {
			downloadFailure(c, err)
			return
		}
		files, err := g.ListFiles(id)
		if err != nil {
			downloadFailure(c, err)
			return
		}
		dirs := []pan115.File{}
		for _, f := range files {
			if f.Directory {
				dirs = append(dirs, f)
			}
		}
		c.JSON(200, gin.H{"items": dirs})
	})
}
