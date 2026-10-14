package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"media-center/internal/store"
	"media-center/internal/tmdb"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMediaHTTPSettings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	u, err := db.CreateUser("admin", "Admin", "unused")
	if err != nil {
		t.Fatal(err)
	}
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	token := hex.EncodeToString(b)
	if err := db.CreateSession(store.HashToken(token), u.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	api := &API{store: db, tmdb: tmdb.NewClient()}
	r := gin.New()
	r.GET("/api/media/discover", api.requireUser(), api.discoverMedia)
	r.GET("/api/media/:source/:sourceId", api.requireUser(), api.detailMedia)
	r.GET("/api/settings/:section", api.requireUser(), api.getSettings)
	r.PUT("/api/settings/:section", api.requireUser(), api.putSettings)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	for _, path := range []string{"/api/media/discover?source=tmdb&mediaType=all", "/api/media/discover?source=tmdb&mediaType=movie&pageSize=50", "/api/media/discover?source=tmdb&mediaType=movie&page=abc", "/api/media/discover?source=douban&mediaType=all"} {
		if w := request("GET", path, ""); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	if w := request("GET", "/api/media/discover?source=tmdb&mediaType=movie", ""); w.Code != 503 {
		t.Fatal(w.Code)
	}
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	key := hex.EncodeToString(b)
	body, _ := json.Marshal(map[string]any{"values": map[string]string{"tmdb.apiKey": key}})
	w := request("PUT", "/api/settings/tmdb", string(body))
	if w.Code != 200 || strings.Contains(w.Body.String(), key) || !strings.Contains(w.Body.String(), "tmdb.apiKey") {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request("GET", "/api/settings/tmdb", "")
	if w.Code != 200 || strings.Contains(w.Body.String(), key) {
		t.Fatal("secret exposed")
	}
	w = request("PUT", "/api/settings/tmdb", `{"values":{"tmdb.apiKey":""}}`)
	saved, e := db.ReadSecret("tmdb", "tmdb.apiKey")
	if e != nil || saved != key || w.Code != 200 {
		t.Fatal("blank secret")
	}
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("api_key") != key {
			t.Error("credential")
		}
		if r.URL.Path == "/movie/13" {
			w.WriteHeader(404)
			return
		}
		if r.URL.Path == "/movie/12" {
			w.Write([]byte(`{"id":12,"title":"测试电影","credits":{"cast":[{"id":3,"name":"演员","character":"主角"}]}}`))
			return
		}
		if r.URL.Path == "/tv/12" {
			w.Write([]byte(`{"id":12,"name":"测试剧集","seasons":[{"season_number":1,"episode_count":8}]}`))
			return
		}
		w.Write([]byte(`{"page":1,"total_results":1,"total_pages":1,"results":[{"id":12,"title":"测试电影"}]}`))
	})
	api.tmdb.BaseURL = "http://tmdb.test"
	api.tmdb.HTTP.Transport = handlerTransport{upstream}
	w = request("GET", "/api/media/discover?source=tmdb&mediaType=movie", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "tmdb:movie:12") || strings.Contains(w.Body.String(), key) {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, kind := range []string{"movie", "tv"} {
		w = request("GET", "/api/media/tmdb/12?mediaType="+kind, "")
		if w.Code != 200 || !strings.Contains(w.Body.String(), "tmdb:"+kind+":12") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	w = request("GET", "/api/media/tmdb/13?mediaType=movie", "")
	if w.Code != 404 || !strings.Contains(w.Body.String(), "message") {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request("GET", "/api/media/tmdb/12", "")
	if w.Code != 400 {
		t.Fatal("ambiguous detail")
	}
}

type handlerTransport struct{ handler http.Handler }

func (tr handlerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if err := r.Context().Err(); err != nil {
		return nil, err
	}
	w := httptest.NewRecorder()
	tr.handler.ServeHTTP(w, r)
	if err := r.Context().Err(); err != nil {
		return nil, err
	}
	return w.Result(), nil
}

func TestMediaErrorMapping(t *testing.T) {
	for _, tt := range []struct {
		err    error
		status int
		retry  string
	}{
		{&tmdb.Error{Status: 502, Message: "TMDB 服务暂不可用"}, 502, ""},
		{&tmdb.Error{Status: 503, Message: "TMDB 暂时限流", RetryAfter: "60"}, 503, "60"},
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		mediaFailure(c, tt.err)
		var body map[string]string
		if json.Unmarshal(w.Body.Bytes(), &body) != nil || body["message"] == "" || w.Code != tt.status || w.Header().Get("Retry-After") != tt.retry {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
