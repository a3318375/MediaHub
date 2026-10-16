package tv

import (
	"context"
	"testing"
	"time"
)

func TestWholeShowSelectionAndPriority(t *testing.T) {
	d := Draft{Source: "pansou", TMDBID: "1", Title: "绿灯军团", Season: 0, Rules: Rules{Sources: []string{"plugin:first", "plugin:second"}, Match: `(?i)^(?=.*绿灯军团)(?=.*(?:4K|2160P|UHD)).*$`}}
	if err := Validate(&d); err != nil {
		t.Fatal(err)
	}
	items := []Candidate{
		{Title: "绿灯军团 S01E01 2160p", URL: "https://115.com/s/second", Source: "plugin:second", Size: 100},
		{Title: "绿灯军团 S01E01 UHD", URL: "https://115.com/s/first", Source: "plugin:first", Size: 1},
		{Title: "绿灯军团 S02E01 4K", URL: "https://115.com/s/season2", Source: "plugin:second"},
		{Title: "绿灯军团 S02E02 4K", URL: "https://115.com/s/notselected", Source: "plugin:other"},
		{Title: "绿灯军团 S02E03 1080p", URL: "https://115.com/s/quality", Source: "plugin:first"},
	}
	got := Select(d, items)
	if len(got) != 2 || got[0].URL != "https://115.com/s/first" || got[0].Season != 1 || got[1].Season != 2 {
		t.Fatalf("%+v", got)
	}
	if Covers(got[0], 1, 2) {
		t.Fatal("season 1 must not cover season 2")
	}
}

type wholeShowRepo struct{ sub Subscription }

func (r *wholeShowRepo) ListTV() ([]Subscription, error)                    { return []Subscription{r.sub}, nil }
func (r *wholeShowRepo) GetTV(string) (Subscription, error)                 { return r.sub, nil }
func (r *wholeShowRepo) SaveTVRefresh(s Subscription) (Subscription, error) { r.sub = s; return s, nil }

func TestWholeShowRefreshKeepsSameEpisodeAcrossSeasons(t *testing.T) {
	r := &wholeShowRepo{sub: Subscription{ID: "show", Draft: Draft{Source: "pansou", TMDBID: "1", Title: "剧集", Season: 0}}}
	s := New(r)
	s.Now = func() time.Time { return time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC) }
	s.Metadata = func(context.Context, string, int) (Metadata, error) {
		return Metadata{Episodes: []Episode{{Season: 1, Number: 1, AirDate: "2025-01-01"}, {Season: 2, Number: 1, AirDate: "2026-01-01"}}}, nil
	}
	s.Search = func(context.Context, Draft) ([]Candidate, error) {
		return []Candidate{{Title: "剧集 S01E01", URL: "https://115.com/s/one1"}, {Title: "剧集 S02E01", URL: "https://115.com/s/two2"}}, nil
	}
	got, err := s.Refresh(context.Background(), "show")
	if err != nil || len(got.Resources) != 2 {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestWholeShowChineseSeasonAndLegacySeasonFilter(t *testing.T) {
	items := []Candidate{{Title: "剧集 第三季 更新至8集", URL: "https://115.com/s/three"}}
	got := Select(Draft{Source: "pansou", Season: 0}, items)
	if len(got) != 1 || got[0].Season != 3 || got[0].CollectionEnd != 8 {
		t.Fatalf("%+v", got)
	}
	if len(Select(Draft{Source: "pansou", Season: 1}, items)) != 0 {
		t.Fatal("legacy single-season subscription accepted another season")
	}
}
