package store

import (
	"encoding/json"
	"media-center/internal/anime"
	"media-center/internal/download"
	"media-center/internal/organize"
	"testing"
)

func TestNewSubscriptionDownloadDefaultsAndDeferredAccount(t *testing.T) {
	db, e := Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	d := anime.Draft{Title: "自动订阅", BangumiID: "123", Season: 2, Enabled: true, Source: "other", URL: "https://example.com/rss"}
	sub, e := db.CreateAnimeWithDownload(d)
	if e != nil {
		t.Fatal(e)
	}
	rule, e := db.GetAnimeDownloadRule(sub.ID)
	if e != nil || !rule.Enabled || rule.DirectoryID != "library" || rule.AccountID != "" {
		t.Fatalf("%+v %v", rule, e)
	}
	n := float64(1)
	sub.Discovered = []anime.Entry{{Title: "番剧 - 01", URL: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567", ResourceID: "btih:0123456789abcdef0123456789abcdef01234567", DownloadKind: "magnet", Episode: &n, Accepted: true}}
	if _, e = db.SaveAnimeRefresh(sub); e != nil {
		t.Fatal(e)
	}
	if ready, e := db.ReadyAnimeCandidates("123"); e != nil || len(ready) != 0 {
		t.Fatalf("downloaded before config %+v %v", ready, e)
	}
	if e = db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": json.RawMessage(`"UID=123_A1; CID=test; SEID=test"`)}, nil); e != nil {
		t.Fatal(e)
	}
	if _, e = db.SaveOrganizeRule(organize.Rule{Name: "媒体整理", Simple: true, AccountID: "123", SourceID: "10", TargetID: "20", Cron: "0 3 * * *", TypeHint: "auto", Recursive: true}); e != nil {
		t.Fatal(e)
	}
	ready, e := db.ReadyAnimeCandidates("123")
	if e != nil || len(ready) != 1 || ready[0].DirectoryID != "library" {
		t.Fatalf("not automatically eligible %+v %v", ready, e)
	}
	if ready, e = db.ReadyAnimeCandidates("456"); e != nil || len(ready) != 0 {
		t.Fatal("rebound to another account")
	}
	if _, e = db.CreateAnimeWithDownload(d); e != ErrSubscriptionExists {
		t.Fatalf("duplicate %v", e)
	}
}
func TestManualRefreshInitializesOnlyUnsetDownloadChoice(t *testing.T) {
	db, e := Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	sub, e := db.CreateAnime(anime.Draft{Title: "旧订阅", BangumiID: "123", Season: 1, Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	if e = db.EnsureAnimeDownloadDefaults(sub.ID); e != nil {
		t.Fatal(e)
	}
	rule, _ := db.GetAnimeDownloadRule(sub.ID)
	if !rule.Enabled {
		t.Fatal("refresh did not initialize")
	}
	if e = db.SetAnimeDownloadRule(sub.ID, download.AnimeDownloadRule{Enabled: false, DirectoryID: "library", FromEpisode: 5}); e != nil {
		t.Fatal(e)
	}
	if e = db.EnsureAnimeDownloadDefaults(sub.ID); e != nil {
		t.Fatal(e)
	}
	rule, _ = db.GetAnimeDownloadRule(sub.ID)
	if rule.Enabled || rule.FromEpisode != 5 {
		t.Fatal("explicit download choice overwritten")
	}
}
