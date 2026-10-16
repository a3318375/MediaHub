package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"mediahub/internal/store"
	"mediahub/internal/tv"
)

func TestTVRoutesAuthRulesAndLifecycle(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	user, err := db.CreateUser("admin", "admin", "unused")
	if err != nil {
		t.Fatal(err)
	}
	if err = db.CreateSession(store.HashToken("tv-session"), user.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	router := NewRouter(db)
	MountTV(router, db, tv.New(db))
	request := func(method, path string, body any, auth bool) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if auth {
			req.Header.Set("Authorization", "Bearer tv-session")
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	base := "/api/v1/subscriptions/tv"
	draft := tv.Draft{TMDBID: "123", Title: "测试", Season: 1, Enabled: true}
	if w := request("POST", base, draft, false); w.Code != 401 {
		t.Fatalf("unprotected create: %d", w.Code)
	}
	if w := request("GET", base, nil, false); w.Code != 401 {
		t.Fatalf("unprotected list: %d", w.Code)
	}
	if w := request("POST", base, draft, true); w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body)
	}
	if w := request("POST", base, draft, true); w.Code != 409 {
		t.Fatalf("duplicate: %d", w.Code)
	}
	draft.Match = "["
	if w := request("PUT", base+"/tmdb-123-s1", draft, true); w.Code != 400 {
		t.Fatalf("bad regex: %d", w.Code)
	}
	draft.Match = "4K"
	draft.Season = 2
	if w := request("PUT", base+"/tmdb-123-s1", draft, true); w.Code != 400 {
		t.Fatalf("immutable season should be a client error: %d %s", w.Code, w.Body)
	}
	draft.Season = 1
	draft.Enabled = false
	if w := request("PUT", base+"/tmdb-123-s1", draft, true); w.Code != 200 {
		t.Fatalf("pause: %d %s", w.Code, w.Body)
	}
	if w := request("DELETE", base+"/tmdb-123-s1", nil, true); w.Code != 204 {
		t.Fatalf("delete: %d", w.Code)
	}
	if w := request("POST", base+"/tmdb-123-s1/refresh", nil, true); w.Code != 404 {
		t.Fatalf("missing refresh: %d", w.Code)
	}
}
