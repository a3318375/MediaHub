package httpapi

import (
	"errors"
	"github.com/gin-gonic/gin"
	"media-center/internal/store"
	"net/http"
)

// Explicit reveal is limited to the existing administrator session, like other settings APIs.
func (a *API) revealSetting(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	section := c.Param("section")
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var body struct {
		Key string `json:"key"`
	}
	if !validSection(section) || c.ShouldBindJSON(&body) != nil || !store.IsSecretSetting(section, body.Key) {
		fail(c, 400, "凭证字段无效")
		return
	}
	value, e := a.store.ReadSecret(section, body.Key)
	if errors.Is(e, store.ErrNotFound) {
		fail(c, 404, "该凭证尚未保存")
		return
	}
	if e != nil {
		fail(c, 500, "读取凭证失败")
		return
	}
	c.JSON(200, gin.H{"value": value})
}
func (a *API) settingsResponse(c *gin.Context, section string, values map[string]any, secrets []string) {
	masks, e := a.store.ReadSettingMasks(section, secrets)
	if e != nil {
		fail(c, 500, "读取凭证显示信息失败")
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"values": values, "configuredSecrets": secrets, "maskedSecrets": masks})
}
