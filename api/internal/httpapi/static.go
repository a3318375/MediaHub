package httpapi

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// MountFrontend serves the production SPA without changing API routing.
func MountFrontend(router *gin.Engine, directory string) error {
	root, err := filepath.Abs(directory)
	if err != nil {
		return err
	}
	if info, err := os.Stat(filepath.Join(root, "index.html")); err != nil || info.IsDir() {
		return fmt.Errorf("frontend index.html missing in %s", root)
	}
	router.NoRoute(func(c *gin.Context) {
		requested := c.Request.URL.Path
		if requested == "/api" || strings.HasPrefix(requested, "/api/") || (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) {
			c.Status(http.StatusNotFound)
			return
		}
		cleaned := path.Clean("/" + requested)
		name := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(cleaned, "/")))
		info, err := os.Stat(name)
		if err == nil && info.Mode().IsRegular() {
			if strings.HasPrefix(cleaned, "/assets/") {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				c.Header("Cache-Control", "no-cache")
			}
			c.File(name)
			return
		}
		if strings.HasPrefix(cleaned, "/assets/") || path.Ext(cleaned) != "" {
			c.Status(http.StatusNotFound)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.File(filepath.Join(root, "index.html"))
	})
	return nil
}
