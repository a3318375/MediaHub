package pansoubridge

import (
	"github.com/gin-gonic/gin"
	"pansou/config"
	"pansou/plugin"
	"pansou/service"
	"sort"
)

var supportedCloudTypes = []string{"baidu", "aliyun", "115", "123", "xunlei", "quark", "guangya", "mobile", "tianyi", "uc", "pikpak", "ed2k", "magnet", "others"}

// Kept for small adapter tests; production uses the initialized manager's options.
func MetaHandler() gin.HandlerFunc {
	b := &Bootstrap{}
	if config.AppConfig != nil {
		b.channels = config.AppConfig.DefaultChannels
		b.plugins = config.AppConfig.EnabledPlugins
	}
	return b.MetaHandler()
}

func (b *Bootstrap) MetaHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		selected, err := b.ReadSearchSettings()
		if err != nil {
			c.JSON(500, gin.H{"error": "无法读取资源搜索配置"})
			return
		}
		names := append([]string{}, b.plugins...)
		if b.settings == nil && len(names) == 0 {
			for _, p := range plugin.GetRegisteredPlugins() {
				names = append(names, p.Name())
			}
		}
		sort.Strings(names)
		options := make([]gin.H, 0, len(names))
		for _, name := range names {
			options = append(options, gin.H{"name": name})
		}
		channels := append([]string{}, b.channels...)
		seen := map[string]bool{}
		for _, name := range channels {
			seen[name] = true
		}
		for _, name := range append(append([]string{}, selected.CustomChannels...), selected.Channels...) {
			if !seen[name] {
				channels = append(channels, name)
				seen[name] = true
			}
		}
		c.JSON(200, gin.H{"data": gin.H{"plugins": options, "channels": channels, "cloudTypes": supportedCloudTypes, "defaults": b.defaultSettings(), "selection": selected, "upstreamRevision": embeddedPanSouCommit, "tg": service.TGReachabilitySnapshot()}})
	}
}
