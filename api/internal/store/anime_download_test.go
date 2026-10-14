package store

import (
	"encoding/json"
	"fmt"
	"testing"

	"media-center/internal/anime"
	"media-center/internal/download"
)

func TestAnimeCandidatesAreTransactionalAndSurviveDisplayTruncation(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err = s.SaveSettings("115", map[string]json.RawMessage{"115.cookie": json.RawMessage(`"UID=123_A1; CID=fixture; SEID=fixture"`)}, nil); err != nil {
		t.Fatal(err)
	}
	sub, err := s.CreateAnime(anime.Draft{Title: "动画", BangumiID: "123", Season: 1, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 150; i++ {
		episode := float64(i)
		sub.Discovered = append(sub.Discovered, anime.Entry{Title: fmt.Sprintf("第%d集", i), Episode: &episode, Accepted: true, URL: fmt.Sprintf("magnet:?xt=urn:btih:%040x", i)})
	}
	sub.LastCheckedAt = "fixture"
	sub.LastError = ""
	anime.UpdateProgress(&sub, anime.Preview{Items: sub.Discovered})
	if _, err = s.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	items, err := s.ListAnimeCandidates(sub.ID)
	if err != nil || len(items) != 150 {
		t.Fatal(len(items), err)
	}
	if ready, err := s.ReadyAnimeCandidates("123"); err != nil || len(ready) != 0 {
		t.Fatal("enabled without opt-in", len(ready), err)
	}
	if err = s.SetAnimeDownloadRule(sub.ID, download.AnimeDownloadRule{Enabled: true, DirectoryID: "100", FromEpisode: 148}); err != nil {
		t.Fatal(err)
	}
	ready, err := s.ReadyAnimeCandidates("123")
	if err != nil || len(ready) != 3 {
		t.Fatal(len(ready), err)
	}
	if _, err = s.SetAnimeEnabled(sub.ID, false); err != nil {
		t.Fatal(err)
	}
	if ready, err = s.ReadyAnimeCandidates("123"); err != nil || len(ready) != 0 {
		t.Fatal("paused subscription queued", len(ready), err)
	}
	if _, err = s.SetAnimeEnabled(sub.ID, true); err != nil {
		t.Fatal(err)
	}
	// RSS-complete must not suppress already discovered, selected downloads.
	sub.Completed = true
	sub.Discovered = nil
	if _, err = s.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	if ready, err = s.ReadyAnimeCandidates("123"); err != nil || len(ready) != 3 {
		t.Fatal("completed RSS suppressed downloads", len(ready), err)
	}
	if _, err = s.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	if items, err = s.ListAnimeCandidates(sub.ID); err != nil || len(items) != 150 {
		t.Fatal("duplicate/lost candidates", len(items), err)
	}
}
