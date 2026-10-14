package httpapi

import (
	"bytes"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"media-center/internal/store"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStoredSecretsMaskRevealAndPreserve(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, e := store.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	user, e := db.CreateUser("admin", "Admin", "unused")
	if e != nil {
		t.Fatal(e)
	}
	token := "fixture-secret-display-session"
	if e = db.CreateSession(store.HashToken(token), user.ID, time.Now().Add(time.Hour)); e != nil {
		t.Fatal(e)
	}
	r := NewRouter(db)
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
	for _, section := range []string{"tmdb", "emby", "115", "notifications"} {
		key := section + ".apiKey"
		if section == "115" {
			key = "115.cookie"
		}
		if section == "notifications" {
			key = "notifications.botToken"
		}
		secret := "fixture-" + section + "-secret-value-9876"
		w := request("PUT", "/api/settings/"+section, map[string]any{"values": map[string]string{key: secret}}, true)
		if w.Code != 200 || strings.Contains(w.Body.String(), secret) {
			t.Fatalf("save response leaked or failed %d", w.Code)
		}
		w = request("GET", "/api/settings/"+section, nil, true)
		var result struct {
			Values        map[string]any
			MaskedSecrets map[string]string
		}
		if e = json.Unmarshal(w.Body.Bytes(), &result); e != nil {
			t.Fatal(e)
		}
		if _, ok := result.Values[key]; ok {
			t.Fatal("plaintext in values")
		}
		if result.MaskedSecrets[key] != store.MaskSecret(secret) {
			t.Fatalf("wrong mask %+v", result)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("cache enabled")
		}
		path := "/api/settings/" + section + "/secrets/reveal"
		w = request("POST", path, map[string]string{"key": key}, false)
		if w.Code != 401 {
			t.Fatal("reveal unauthenticated")
		}
		w = request("POST", path, map[string]string{"key": key}, true)
		var revealed struct{ Value string }
		_ = json.Unmarshal(w.Body.Bytes(), &revealed)
		if w.Code != 200 || revealed.Value != secret || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("reveal failed")
		}
		request("PUT", "/api/settings/"+section, map[string]any{"values": map[string]string{key: ""}}, true)
		stored, e := db.ReadSecret(section, key)
		if e != nil || stored != secret {
			t.Fatal("blank overwrote stored secret")
		}
	}
	for _, key := range []string{"115.cookie", "tmdb.url", "not-a-secret"} {
		w := request("POST", "/api/settings/tmdb/secrets/reveal", map[string]string{"key": key}, true)
		if w.Code != 400 {
			t.Fatal("invalid reveal key", key, w.Code)
		}
	}
	w := request("POST", "/api/settings/notifications/secrets/reveal", map[string]string{"key": "notifications.webhookSecret"}, true)
	if w.Code != 404 {
		t.Fatal("missing secret", w.Code)
	}
}
