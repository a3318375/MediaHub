package pansoubridge

import (
	"context"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/url"
	"pansou/model"
	"strings"
	"sync"
	"time"
)

type linkChecker interface {
	Check([]model.CheckItem) model.CheckResponse
}

// Only public share hosts are forwarded. Browser requests cannot choose proxies
// or use this endpoint to issue arbitrary requests to the local network.
var checkHosts = map[string][]string{
	"baidu": {"pan.baidu.com"}, "quark": {"pan.quark.cn"}, "uc": {"drive.uc.cn"},
	"aliyun": {"www.alipan.com", "alipan.com", "www.aliyundrive.com", "aliyundrive.com"},
	"115":    {"115.com", "115cdn.com"}, "123": {"www.123pan.com", "123pan.com", "www.123865.com", "123865.com", "www.123684.com", "123684.com"},
	"xunlei": {"pan.xunlei.com"}, "tianyi": {"cloud.189.cn"}, "mobile": {"caiyun.139.com", "yun.139.com", "caiyun.feixin.10086.cn"},
	"pikpak": {"mypikpak.com"}, "guangya": {"pan.guangya.com", "www.guangya.com"},
}

func validCheckItem(item model.CheckItem) bool {
	if len(item.URL) > 2048 || len(item.Password) > 64 {
		return false
	}
	if item.DiskType == "magnet" {
		return strings.HasPrefix(item.URL, "magnet:?")
	}
	if item.DiskType == "ed2k" {
		return strings.HasPrefix(item.URL, "ed2k://")
	}
	parsed, err := url.Parse(item.URL)
	if err != nil || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Port() != "" {
		return false
	}
	for _, host := range checkHosts[item.DiskType] {
		if strings.ToLower(parsed.Hostname()) == host {
			return true
		}
	}
	return false
}

func (b *Bootstrap) CheckHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
		var req struct {
			Items []model.CheckItem `json:"items"`
		}
		if c.ShouldBindJSON(&req) != nil || len(req.Items) == 0 || len(req.Items) > 6 {
			c.JSON(400, gin.H{"error": "检测批次必须包含 1–6 个链接"})
			return
		}
		for _, item := range req.Items {
			if !validCheckItem(item) {
				c.JSON(400, gin.H{"error": "无效的网盘分享链接"})
				return
			}
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		select {
		case b.checkGate <- struct{}{}:
		case <-ctx.Done():
			c.JSON(504, gin.H{"error": "链接检测超时"})
			return
		}
		b.mu.Lock()
		if b.closed || b.checker == nil {
			b.mu.Unlock()
			<-b.checkGate
			c.JSON(503, gin.H{"error": "链接检测不可用"})
			return
		}
		b.active.Add(1)
		b.mu.Unlock()
		done := make(chan model.CheckResponse, 1)
		go func() {
			defer b.active.Done()
			defer func() { <-b.checkGate }()
			results := make([]model.CheckResult, len(req.Items))
			var group sync.WaitGroup
			for i, item := range req.Items {
				group.Add(1)
				go func(index int, value model.CheckItem) {
					defer group.Done()
					response := b.checker.Check([]model.CheckItem{value})
					if len(response.Results) > 0 {
						results[index] = response.Results[0]
					}
				}(i, item)
			}
			group.Wait()
			done <- model.CheckResponse{Results: results}
		}()
		select {
		case result := <-done:
			c.JSON(200, result)
		case <-ctx.Done():
			c.JSON(504, gin.H{"error": "链接检测超时"})
		}
	}
}
