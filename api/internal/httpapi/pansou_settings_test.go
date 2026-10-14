package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"github.com/gin-gonic/gin"
	"media-center/internal/store"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPanSouSettingsValidationAndResourceAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	user, err := db.CreateUser("admin", "Admin", "unused")
	if err != nil {
		t.Fatal(err)
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		t.Fatal(err)
	}
	token := hex.EncodeToString(raw)
	if err := db.CreateSession(store.HashToken(token), user.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	noop := func(c *gin.Context) { c.Status(204) }
	router := NewRouter(db, noop, noop, noop)
	for _, path := range []string{"/api/v1/resources/search", "/api/v1/resources/meta", "/api/v1/resources/check"} {
		method := "POST"
		if strings.HasSuffix(path, "meta") {
			method = "GET"
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(method, path, nil))
		if w.Code != 401 {
			t.Fatalf("unprotected route %s: %d", path, w.Code)
		}
	}
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"values":{"pansou.channels":[] ,"pansou.plugins":[],"pansou.detectionEnabled":false}}`, 200},
		{`{"values":{"pansou.plugins":"huban"}}`, 400},
		{`{"values":{"pansou.detectionEnabled":"true"}}`, 400},
		{`{"values":{"pansou.cloudTypes":["invalid"]}}`, 400},
		{`{"values":{"pansou.customChannels":["../../private"]}}`, 400},
	} {
		req := httptest.NewRequest("PUT", "/api/settings/pansou", strings.NewReader(tc.body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatalf("settings %d: %s", w.Code, w.Body.String())
		}
	}
}
