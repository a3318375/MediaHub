//go:build realupstream

package anilist

import (
	"context"
	"media-center/internal/discovery"
	"testing"
	"time"
)

func TestRealNativeSorts(t *testing.T) {
	p := New()
	p.ProxyURL = ""
	for _, sort := range []string{"POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC"} {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		page, e := p.discover(ctx, discovery.Query{MediaType: "anime", Page: 1, PageSize: 1}, sort)
		cancel()
		if e != nil {
			t.Errorf("%s: %v", sort, e)
		} else if len(page.Items) != 1 {
			t.Errorf("%s: empty", sort)
		} else {
			t.Logf("%s: %s %s", sort, page.Items[0].SourceID, page.Items[0].Title)
		}
	}
}

// Run explicitly with -run TestChineseSearchReal to assess real Chinese hit rates.
func TestChineseSearchReal(t *testing.T) {
	p := New()
	for _, keyword := range []string{"命运石之门", "进击的巨人", "间谍过家家", "孤独摇滚", "鬼灭之刃", "不存在的作品zzzz-test-20261012"} {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		page, e := p.Discover(ctx, discovery.Query{MediaType: "anime", Page: 1, PageSize: 20, Search: keyword})
		cancel()
		if e != nil {
			t.Errorf("%s: %v", keyword, e)
			continue
		}
		if keyword == "不存在的作品zzzz-test-20261012" {
			if len(page.Items) != 0 {
				t.Error("nonexistent keyword returned works")
			}
		} else if len(page.Items) == 0 {
			t.Errorf("%s: no hits", keyword)
		} else {
			t.Logf("%s: hits=%d first=%s %s", keyword, len(page.Items), page.Items[0].SourceID, page.Items[0].Title)
		}
	}
}

func TestRealNativeFilters(t *testing.T) {
	p := New()
	p.ProxyURL = ""
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	// Use Discover to exercise the public filter mapping, then inspect raw metadata
	// with the same native arguments because season is not part of the summary DTO.
	page, err := p.Discover(ctx, discovery.Query{MediaType: "anime", Page: 1, PageSize: 3, Genre: "Action", Season: "WINTER", Year: "2024", Region: "JP"})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) == 0 {
		t.Fatal("empty filtered page")
	}
	for _, item := range page.Items {
		if !discovery.Contains(item.Genres, "Action") {
			t.Fatal(item)
		}
	}
	var raw struct{ Page struct{ Media []record } }
	err = p.graphql(ctx, `query{Page(page:1,perPage:3){media(type:ANIME,genre:"Action",season:WINTER,seasonYear:2024,countryOfOrigin:"JP",sort:POPULARITY_DESC){`+fields+`}}}`, nil, &raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw.Page.Media) == 0 {
		t.Fatal("empty raw page")
	}
	for _, r := range raw.Page.Media {
		if !discovery.Contains(r.Genres, "Action") || r.Season != "WINTER" || r.SeasonYear != 2024 || r.Country != "JP" {
			t.Fatalf("filter mismatch: %+v", r)
		}
	}
	t.Logf("Action/WINTER/2024/JP: %d results, totalCapped=%v", len(page.Items), page.TotalCapped)
}

func TestRealGenreCollection(t *testing.T) {
	p := New()
	p.ProxyURL = ""
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var raw struct{ GenreCollection []string }
	if err := p.graphql(ctx, "{GenreCollection}", nil, &raw); err != nil {
		t.Fatal(err)
	}
	genres := p.Capabilities().Filters.Genre
	if len(genres) != len(raw.GenreCollection) {
		t.Fatalf("genre snapshot differs: official=%v local=%v", raw.GenreCollection, genres)
	}
	for _, genre := range raw.GenreCollection {
		if !discovery.Contains(genres, genre) {
			t.Fatalf("missing official genre %q", genre)
		}
	}
	t.Logf("GenreCollection: %v", raw.GenreCollection)
}
