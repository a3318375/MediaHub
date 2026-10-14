package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"media-center/internal/anime"
	"media-center/internal/animesync"
	"media-center/internal/store"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAnimeAuthenticatedCreateConflictAndPause(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, e := store.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	user, e := db.CreateUser("admin", "admin", "unused")
	if e != nil {
		t.Fatal(e)
	}
	token := "test-anime-session"
	if e = db.CreateSession(store.HashToken(token), user.ID, time.Now().Add(time.Hour)); e != nil {
		t.Fatal(e)
	}
	r := NewRouterWithAnime(db, animesync.New(db, animeTestSource{}))
	request := func(method, path string, body any, auth bool) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if auth {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	for _, path := range []string{"/api/v1/subscriptions/anime", "/api/v1/subscriptions/anime/resolve", "/api/v1/subscriptions/anime/preview", "/api/v1/anime/sources/mikan/catalog"} {
		w := request("GET", path, nil, false)
		if path[len(path)-7:] == "resolve" || path[len(path)-7:] == "preview" {
			w = request("POST", path, nil, false)
		}
		if w.Code != 401 {
			t.Fatalf("%s not protected: %d", path, w.Code)
		}
	}
	d := anime.Draft{Title: "测试番剧", BangumiID: "123", Source: "other", URL: "https://example.com/rss", Season: 1, Enabled: true, Match: []string{}, Exclude: []string{}, Standby: []anime.Feed{}}
	w := request("POST", "/api/v1/subscriptions/anime", d, true)
	if w.Code != 201 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	var saved anime.Subscription
	if e = json.Unmarshal(w.Body.Bytes(), &saved); e != nil {
		t.Fatal(e)
	}
	if saved.LastCheckedAt == "" {
		t.Fatal("creation did not refresh RSS")
	}
	rule, e := db.GetAnimeDownloadRule(saved.ID)
	if e != nil || !rule.Enabled || rule.DirectoryID != "library" || rule.FromEpisode != 1 || !saved.AutoDownload {
		t.Fatalf("new subscription did not auto-enable download: %+v %v", rule, e)
	}
	refreshPath := "/api/v1/subscriptions/anime/" + saved.ID + "/refresh"
	if got := request("POST", refreshPath, nil, false); got.Code != 401 {
		t.Fatal("refresh lacks auth")
	}
	if got := request("POST", refreshPath, nil, true); got.Code != 200 {
		t.Fatalf("manual refresh without 115: %d %s", got.Code, got.Body)
	}
	if got := request("POST", "/api/v1/subscriptions/anime/unknown/refresh", nil, true); got.Code != 404 {
		t.Fatal("missing subscription", got.Code)
	}
	if w = request("POST", "/api/v1/subscriptions/anime", d, true); w.Code != 409 {
		t.Fatal(w.Code)
	}
	if w = request("PATCH", "/api/v1/subscriptions/anime/"+saved.ID, map[string]bool{"enabled": false}, true); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request("PATCH", "/api/v1/subscriptions/anime/"+saved.ID, map[string]any{}, true); w.Code != 400 {
		t.Fatal(w.Code)
	}
	d.Match = []string{"["}
	if w = request("POST", "/api/v1/subscriptions/anime/preview", d, true); w.Code != 400 {
		t.Fatal(w.Code)
	}
	w = request("GET", "/api/v1/subscriptions/anime", nil, true)
	var list []anime.Subscription
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 || list[0].Enabled {
		t.Fatal(w.Body)
	}
}

type animeTestSource struct{}

func (animeTestSource) Preview(context.Context, anime.Draft) (anime.Preview, error) {
	return anime.Preview{Items: []anime.Entry{}}, nil
}
func (animeTestSource) Metadata(_ context.Context, d anime.Draft, _ bool) (anime.Draft, error) {
	return d, nil
}
