package tv_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"mediahub/internal/store"
	"mediahub/internal/tv"
)

func TestMissedMondayRetriesUntilThursdayThenWaitsForNextMonday(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	sub, err := db.CreateTV(tv.Draft{Source: "tg", TMDBID: "123", Title: "测试", Season: 1, Enabled: true, Rules: tv.Rules{Channels: []string{"vip115hot"}}})
	if err != nil {
		t.Fatal(err)
	}
	monday := time.Date(2026, 10, 19, 10, 0, 0, 0, tv.Location)
	now := monday
	s := tv.New(db)
	s.Now = func() time.Time { return now }
	s.Metadata = func(context.Context, string, int) (tv.Metadata, error) {
		return tv.Metadata{Episodes: []tv.Episode{{Number: 1, AirDate: "2026-10-19"}, {Number: 2, AirDate: "2026-10-26"}}}, nil
	}
	tgCalls, panCalls := 0, 0
	s.Search = func(context.Context, tv.Draft) ([]tv.Candidate, error) { panCalls++; return nil, nil }
	s.TGSearch = func(context.Context, tv.Draft) ([]tv.Candidate, error) {
		tgCalls++
		out := []tv.Candidate{}
		if now.Day() >= 22 {
			out = append(out, tv.Candidate{Title: "测试 S01E01", URL: "https://115.com/s/first", Channel: "vip115hot"})
		}
		if now.Day() >= 26 {
			out = append(out, tv.Candidate{Title: "测试 S01E02", URL: "https://115.com/s/second", Channel: "vip115hot"})
		}
		return out, nil
	}
	for day := 0; day < 4; day++ {
		now = monday.AddDate(0, 0, day)
		sub, err = s.Refresh(context.Background(), sub.ID)
		if err != nil {
			t.Fatal(err)
		}
		if tgCalls != day+1 || panCalls != 0 {
			t.Fatalf("wrong source/calls at day %d: %d/%d", day, tgCalls, panCalls)
		}
		if day < 3 {
			next, _ := time.Parse(time.RFC3339, sub.NextCheckAt)
			if !next.Equal(now.Add(24 * time.Hour)) {
				t.Fatalf("not daily retry: %+v", sub)
			}
		}
	}
	if sub.NextCheckAt != "2026-10-25T16:00:00Z" {
		t.Fatalf("did not stop until next release: %+v", sub)
	}
	for day := 4; day < 7; day++ {
		now = monday.AddDate(0, 0, day)
		if _, err = s.Refresh(context.Background(), sub.ID); err != nil {
			t.Fatal(err)
		}
	}
	if tgCalls != 4 {
		t.Fatalf("kept searching after Thursday: %d", tgCalls)
	}
	now = monday.AddDate(0, 0, 7)
	sub, err = s.Refresh(context.Background(), sub.ID)
	if err != nil {
		t.Fatal(err)
	}
	if tgCalls != 5 || len(sub.Resources) != 2 || sub.NextCheckAt != "" {
		t.Fatalf("next Monday handling: %+v calls=%d", sub, tgCalls)
	}
}

func TestSourceFailureDoesNotTriggerOtherSource(t *testing.T) {
	for _, source := range []string{"tg", "pansou"} {
		t.Run(source, func(t *testing.T) {
			db, err := store.Open(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			d := tv.Draft{Source: source, TMDBID: "1", Title: "测试", Season: 1, Enabled: true}
			if source == "tg" {
				d.Channels = []string{"vip115hot"}
			}
			sub, err := db.CreateTV(d)
			if err != nil {
				t.Fatal(err)
			}
			s := tv.New(db)
			tg, pan := 0, 0
			s.TGSearch = func(context.Context, tv.Draft) ([]tv.Candidate, error) {
				tg++
				return nil, errors.New("TG unavailable")
			}
			s.Search = func(context.Context, tv.Draft) ([]tv.Candidate, error) {
				pan++
				return nil, errors.New("PanSou unavailable")
			}
			sub, err = s.Refresh(context.Background(), sub.ID)
			if err != nil {
				t.Fatal(err)
			}
			if (source == "tg" && (tg != 1 || pan != 0)) || (source == "pansou" && (pan != 1 || tg != 0)) || sub.LastError == "" {
				t.Fatalf("source fallback occurred: tg=%d pan=%d %+v", tg, pan, sub)
			}
		})
	}
}

func TestPanSouClearsChannelSelection(t *testing.T) {
	d := tv.Draft{Source: "pansou", TMDBID: "1", Title: "测试", Season: 1, Rules: tv.Rules{Channels: []string{"vip115hot"}}}
	if err := tv.Validate(&d); err != nil || len(d.Channels) != 0 {
		t.Fatalf("PanSou retained TG subscription: %+v %v", d, err)
	}
}
