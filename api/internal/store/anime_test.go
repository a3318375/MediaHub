package store

import (
	"encoding/json"
	"errors"
	"media-center/internal/anime"
	"strings"
	"testing"
)

func TestAnimePersistsAndRejectsDuplicates(t *testing.T) {
	dir := t.TempDir()
	s, e := Open(dir)
	if e != nil {
		t.Fatal(e)
	}
	d := anime.Draft{Title: "动画", BangumiID: "123", Season: 1, Enabled: true}
	v, e := s.CreateAnime(d)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.CreateAnime(d); !errors.Is(e, ErrSubscriptionExists) {
		t.Fatal(e)
	}
	v, e = s.SetAnimeEnabled(v.ID, false)
	if e != nil || v.Enabled {
		t.Fatal(e)
	}
	s.Close()
	s, e = Open(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	list, e := s.ListAnime()
	if e != nil || len(list) != 1 || list[0].Enabled {
		t.Fatalf("%+v %v", list, e)
	}
}

func TestLegacyAnimeWeekBackfill(t *testing.T) {
	s, e := Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	raw := `{"id":"legacy","bangumiId":"123","season":1,"week":0,"releaseDate":"2026-01-08"}`
	if _, e = s.db.Exec(`INSERT INTO anime_subscriptions(id,bangumi_id,season,data,updated_at) VALUES('legacy','123',1,?,'original')`, raw); e != nil {
		t.Fatal(e)
	}
	list, e := s.ListAnime()
	if e != nil || len(list) != 1 || list[0].Week != 4 {
		t.Fatalf("%+v %v", list, e)
	}
	var stored string
	if e = s.db.QueryRow(`SELECT data FROM anime_subscriptions WHERE id='legacy'`).Scan(&stored); e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(stored, `"week":4`) {
		t.Fatal(stored)
	}
}

func Test115ReadinessUsesEncryptedNonemptySecret(t *testing.T) {
	s, e := Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	ready, e := s.Anime115Ready()
	if e != nil || ready {
		t.Fatal("new store ready")
	}
	if e = s.SaveSettings("115", map[string]json.RawMessage{"115.cookie": json.RawMessage(`"fixture-cookie"`)}, nil); e != nil {
		t.Fatal(e)
	}
	ready, e = s.Anime115Ready()
	if e != nil || !ready {
		t.Fatal("stored cookie not recognized")
	}
	if e = s.SaveSettings("115", nil, []string{"115.cookie"}); e != nil {
		t.Fatal(e)
	}
	ready, e = s.Anime115Ready()
	if e != nil || ready {
		t.Fatal("cleared cookie still ready")
	}
}
