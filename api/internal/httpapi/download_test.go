package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"media-center/internal/animesync"
	"media-center/internal/download"
	"media-center/internal/store"
)

func TestDownloadsAuthenticatedSharedQueueAndCancellation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	u, err := db.CreateUser("admin", "admin", "unused")
	if err != nil {
		t.Fatal(err)
	}
	token := "download-fixture-session"
	if err = db.CreateSession(store.HashToken(token), u.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	key := "mc_fixture_download"
	if _, err = db.CreateAPIKey("fixture", u.ID, "downloads", "mc_fixture", store.HashToken(key)); err != nil {
		t.Fatal(err)
	}
	if err = db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": json.RawMessage(`"UID=123_A1; CID=fixture; SEID=fixture"`)}, nil); err != nil {
		t.Fatal(err)
	}
	s := download.New(db)
	r := NewRouterWithServices(db, animesync.New(db, animeTestSource{}), s)
	call := func(method, path string, body any, auth string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if auth != "" {
			req.Header.Set("Authorization", "Bearer "+auth)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	for _, path := range []string{"/api/v1/downloads", "/api/v1/downloads/missing", "/api/v1/115/directories", "/api/v1/organize/rules", "/api/v1/organize/plans", "/api/v1/anime/sources/ani-bt/catalog", "/api/v1/anime/sources/anime-garden/catalog"} {
		if w := call("GET", path, nil, ""); w.Code != 401 {
			t.Fatal(path, w.Code)
		}
	}
	if w := call("GET", "/api/v1/organize/rules", nil, key); w.Code != 200 || w.Body.String() != "[]" {
		t.Fatal(w.Code, w.Body)
	}
	rule := map[string]any{"name": "测试规则", "sourceId": "100", "movieTargetId": "200", "dailyAt": "03:00", "typeHint": "auto", "enabled": false}
	if w := call("POST", "/api/v1/organize/rules", rule, key); w.Code != 401 {
		t.Fatal("API key changed settings", w.Code)
	}
	if w := call("POST", "/api/v1/organize/rules", rule, token); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := call("POST", "/api/v1/organize/plans/missing/start", nil, token); w.Code != 404 {
		t.Fatal(w.Code, w.Body)
	}
	config := map[string]any{"sourceId": "100", "targetId": "200", "cron": "*/30 * * * *", "enabled": false}
	if w := call("PUT", "/api/v1/organize/config", config, key); w.Code != 401 {
		t.Fatal("API key changed library settings", w.Code)
	}
	if w := call("PUT", "/api/v1/organize/config", config, token); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := call("GET", "/api/v1/organize/config", nil, token); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	simple, e := db.SimpleOrganizeRule()
	if e != nil || !simple.Recursive || simple.TargetID != "200" || simple.SourceID != "100" || simple.Cron != "*/30 * * * *" {
		t.Fatalf("%+v %v", simple, e)
	}
	if !simple.Enabled {
		t.Fatal("valid Cron did not enable schedule")
	}
	for _, cron := range []string{"not a cron", ""} {
		config["cron"] = cron
		config["enabled"] = true
		if w := call("PUT", "/api/v1/organize/config", config, token); w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
		saved, e := db.SimpleOrganizeRule()
		if e != nil || saved.Enabled || saved.Cron != cron {
			t.Fatalf("invalid/empty Cron kept schedule active: %+v %v", saved, e)
		}
		if cron != "" && saved.ScheduleError == "" {
			t.Fatal("invalid Cron missing explanation")
		}
		if cron == "" && saved.ScheduleError != "" {
			t.Fatal("blank Cron displayed invalid error")
		}
	}
	request := download.Request{Kind: "offline", URL: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567", DirectoryID: "100", Reference: download.Reference{Source: "media_search", SourceID: "tmdb:movie:99", Media: download.MediaContext{Type: "movie", Provider: "tmdb", ProviderID: "99"}}}
	w := call("POST", "/api/v1/downloads", request, token)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body)
	}
	var result struct {
		Task    download.Task `json:"task"`
		Created bool          `json:"created"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if w = call("POST", "/api/v1/downloads", request, key); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w = call("GET", "/api/v1/downloads/"+result.Task.ID, nil, key); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	request.Kind = "share_transfer"
	if w = call("POST", "/api/v1/downloads", request, token); w.Code != 400 {
		t.Fatal("unsupported kind accepted", w.Code)
	}
	if w = call("POST", "/api/v1/downloads/"+result.Task.ID+"/cancel", nil, token); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w = call("POST", "/api/v1/downloads/"+result.Task.ID+"/cancel", nil, token); w.Code != 409 {
		t.Fatal(w.Code, w.Body)
	}
	if w = call("GET", "/api/v1/downloads/missing", nil, token); w.Code != 404 {
		t.Fatal(w.Code, w.Body)
	}
}
