package pansoubridge

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var cloudTypeRE = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,24}$`)

type searchRequest struct {
	Query      string   `json:"query"`
	Source     string   `json:"source"`
	CloudTypes []string `json:"cloudTypes"`
	Plugins    []string `json:"plugins"`
	Channels   []string `json:"channels"`
	Mode       string   `json:"mode"`
	Refresh    bool     `json:"refresh"`
}

// Handler is Media Center's own validated endpoint; mount behind requireAPI.
func (b *Bootstrap) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
		var req searchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid search request"})
			return
		}
		req.Query = strings.TrimSpace(req.Query)
		if n := len([]rune(req.Query)); n < 1 || n > 120 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query must contain 1 to 120 characters"})
			return
		}
		selected, err := b.ReadSearchSettings()
		if err != nil {
			c.JSON(500, gin.H{"error": "无法读取资源搜索配置"})
			return
		}
		if req.Channels == nil {
			req.Channels = selected.Channels
		}
		if req.Plugins == nil {
			req.Plugins = selected.Plugins
		}
		if req.CloudTypes == nil {
			req.CloudTypes = selected.CloudTypes
		}
		if req.Source == "" {
			req.Source = "all"
		}
		if req.Source != "all" && req.Source != "tg" && req.Source != "plugin" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "source must be all, tg, or plugin"})
			return
		}
		if len(req.CloudTypes) > len(supportedCloudTypes) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "too many cloud types"})
			return
		}
		for _, typ := range req.CloudTypes {
			if !knownCloudType(typ) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid cloud type"})
				return
			}
		}
		if len(req.Plugins) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at most 100 plugins are allowed"})
			return
		}
		if len(req.Channels) > 200 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at most 200 channels are allowed"})
			return
		}
		for _, name := range append(append([]string{}, req.Plugins...), req.Channels...) {
			if !cloudTypeRE.MatchString(name) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "plugin and channel names must match ^[a-zA-Z0-9_-]{1,24}$"})
				return
			}
		}
		if req.Mode == "" {
			req.Mode = "merge"
		}
		if req.Mode != "merge" && req.Mode != "results" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be merge or results"})
			return
		}
		// Empty source selections mean disabled, rather than PanSou's nil/all fallback.
		source := req.Source
		if source == "all" {
			if len(req.Channels) == 0 {
				source = "plugin"
			}
			if len(req.Plugins) == 0 {
				source = "tg"
			}
		}
		if (source == "tg" && len(req.Channels) == 0) || (source == "plugin" && len(req.Plugins) == 0) {
			c.JSON(200, gin.H{"data": emptySearchData()})
			return
		}
		allowed := map[string]bool{}
		for _, name := range b.plugins {
			allowed[name] = true
		}
		for _, name := range req.Plugins {
			if !allowed[name] {
				c.JSON(400, gin.H{"error": "unavailable plugin: " + name})
				return
			}
		}
		for i, cloud := range req.CloudTypes {
			if cloud == "other" {
				req.CloudTypes[i] = "others"
			}
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
		defer cancel()
		result, err := b.Search(ctx, req.Query, source, req.CloudTypes, req.Plugins, req.Channels, req.Mode, req.Refresh)
		if err != nil {
			status := http.StatusServiceUnavailable
			if errors.Is(err, ErrRefreshLimited) || errors.Is(err, ErrSearchBusy) {
				status = http.StatusTooManyRequests
				c.Header("Retry-After", "10")
			}
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": result})
	}
}
