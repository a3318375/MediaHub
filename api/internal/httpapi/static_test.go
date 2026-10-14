package httpapi

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFrontendRouting(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("frontend"), 0600); err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	router.GET("/api/health", func(c *gin.Context) { c.String(200, "ok") })
	if err := MountFrontend(router, root); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		method, path string
		status       int
		body         string
	}{
		{"GET", "/", 200, "frontend"},
		{"GET", "/settings", 200, "frontend"},
		{"GET", "/api/health", 200, "ok"},
		{"GET", "/api/missing", 404, "404 page not found"},
		{"GET", "/assets/missing.js", 404, "404 page not found"},
		{"POST", "/settings", 404, "404 page not found"},
	} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(tt.method, tt.path, nil))
		if w.Code != tt.status || w.Body.String() != tt.body {
			t.Fatalf("%s %s: %d %q", tt.method, tt.path, w.Code, w.Body.String())
		}
	}
}
