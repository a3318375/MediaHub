package tv_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"media-center/internal/store"
	"media-center/internal/tv"
)

func TestScheduleFallbackMissingEpisodesAndRestart(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	sub, err := db.CreateTV(tv.Draft{TMDBID: "123", Title: "测试", Season: 1, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 15, 10, 0, 0, 0, tv.Location)
	service := tv.New(db)
	service.Now = func() time.Time { return now }
	calls := 0
	episodes := []tv.Episode{{Number: 1, AirDate: "2026-10-16"}}
	service.Metadata = func(context.Context, string, int) (tv.Metadata, error) { return tv.Metadata{Episodes: episodes}, nil }
	service.Search = func(context.Context, tv.Draft) ([]tv.Candidate, error) {
		calls++
		return []tv.Candidate{{Title: "测试 S01E01 4K 5GB", URL: "https://115.com/s/one1"}}, nil
	}
	sub, err = service.Refresh(context.Background(), sub.ID)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 0 || sub.NextCheckAt != "2026-10-15T16:00:00Z" {
		t.Fatalf("searched before release: %+v calls=%d", sub, calls)
	}
	now = now.Add(24 * time.Hour)
	sub, err = service.Refresh(context.Background(), sub.ID)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || len(sub.Resources) != 1 {
		t.Fatalf("did not collect released episode: %+v", sub)
	}
	_, err = service.Refresh(context.Background(), sub.ID)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("already found episode was re-searched")
	}
	episodes = append(episodes, tv.Episode{Number: 2})
	sub, err = service.Refresh(context.Background(), sub.ID)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatal("undated episode did not use fallback")
	}
	next, _ := time.Parse(time.RFC3339, sub.NextCheckAt)
	if !next.Equal(now.Add(24 * time.Hour)) {
		t.Fatal("fallback is not daily")
	}
	service.Metadata = func(context.Context, string, int) (tv.Metadata, error) {
		return tv.Metadata{}, errors.New("unavailable")
	}
	sub, err = service.Refresh(context.Background(), sub.ID)
	if err != nil || sub.MetadataError == "" || calls != 3 {
		t.Fatalf("metadata outage fallback: %+v %v", sub, err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sub, err = db.GetTV(sub.ID)
	if err != nil || len(sub.Resources) != 1 || sub.NextCheckAt == "" {
		t.Fatalf("restart lost state: %+v %v", sub, err)
	}
}

func TestConcurrentRuleEditAndPauseSurviveRefresh(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sub, err := db.CreateTV(tv.Draft{TMDBID: "9", Title: "测试", Season: 1, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.CreateTV(sub.Draft); !errors.Is(err, store.ErrSubscriptionExists) {
		t.Fatalf("duplicate accepted: %v", err)
	}
	d := sub.Draft
	d.Enabled = false
	d.Match = "4K"
	if _, err = db.UpdateTV(sub.ID, d); err != nil {
		t.Fatal(err)
	}
	sub.Resources = []tv.Candidate{{Episode: 1, URL: "https://115.com/s/stale"}}
	got, err := db.SaveTVRefresh(sub)
	if err != nil {
		t.Fatal(err)
	}
	if got.Enabled || got.Match != "4K" || len(got.Resources) != 0 {
		t.Fatalf("stale refresh overwrote rules: %+v", got)
	}
	if err = db.DeleteTV(sub.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.SaveTVRefresh(sub); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("deleted subscription resurrected: %v", err)
	}
}

func TestInFlightRefreshCannotOverwritePauseResumeOrRecreatedSubscription(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sub, err := db.CreateTV(tv.Draft{TMDBID: "19", Title: "测试", Season: 1, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	d := sub.Draft
	d.Enabled = false
	if _, err = db.UpdateTV(sub.ID, d); err != nil {
		t.Fatal(err)
	}
	d.Enabled = true
	current, err := db.UpdateTV(sub.ID, d)
	if err != nil {
		t.Fatal(err)
	}
	sub.NextCheckAt = "2099-01-01T00:00:00Z"
	got, err := db.SaveTVRefresh(sub)
	if err != nil {
		t.Fatal(err)
	}
	if got.Revision != current.Revision || got.NextCheckAt != "" {
		t.Fatalf("pause/resume refresh was lost: %+v", got)
	}
	if err = db.DeleteTV(sub.ID); err != nil {
		t.Fatal(err)
	}
	created, err := db.CreateTV(d)
	if err != nil {
		t.Fatal(err)
	}
	got, err = db.SaveTVRefresh(sub)
	if err != nil {
		t.Fatal(err)
	}
	if got.CreatedAt != created.CreatedAt || got.LastCheckedAt != "" || got.NextCheckAt != "" {
		t.Fatalf("old refresh changed recreated subscription: %+v", got)
	}
}

func TestLaterSearchCannotDowngradeExistingShare(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sub, err := db.CreateTV(tv.Draft{TMDBID: "21", Title: "测试", Season: 1, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	sub.Resources = []tv.Candidate{{Title: "测试 S01E01 4K 8GB", URL: "https://115.com/s/large"}}
	sub, err = db.SaveTVRefresh(sub)
	if err != nil {
		t.Fatal(err)
	}
	s := tv.New(db)
	s.Metadata = func(context.Context, string, int) (tv.Metadata, error) { return tv.Metadata{}, nil }
	s.Search = func(context.Context, tv.Draft) ([]tv.Candidate, error) {
		return []tv.Candidate{{Title: "测试 S01E01 4K 2GB", URL: "https://115.com/s/small"}}, nil
	}
	got, err := s.Refresh(context.Background(), sub.ID)
	if err != nil || len(got.Resources) != 1 || got.Resources[0].URL != "https://115.com/s/large" {
		t.Fatalf("quality downgrade: %+v %v", got, err)
	}
}
