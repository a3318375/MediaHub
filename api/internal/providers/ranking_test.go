package providers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"media-center/internal/discovery"
	"media-center/internal/providers/anilist"
	"media-center/internal/providers/bangumi"
	tmdbprovider "media-center/internal/providers/tmdb"
)

func TestTMDBChartsAndPlatformIsolation(t *testing.T) {
	calls := 0
	var path string
	var region, monetization string
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		path = r.URL.Path
		if strings.HasPrefix(path, "/watch/providers/") {
			region = r.URL.Query().Get("watch_region")
			response(w, `{"results":[{"provider_id":8,"provider_name":"Netflix","logo_path":"/netflix.jpg"}]}`)
			return
		}
		if strings.HasPrefix(path, "/discover/") {
			if r.URL.Query().Get("watch_region") != region || r.URL.Query().Get("with_watch_providers") != "8" || r.URL.Query().Get("with_watch_monetization_types") != monetization || r.URL.Query().Get("sort_by") != "popularity.desc" {
				t.Errorf("incorrect platform query: %s", r.URL.RawQuery)
			}
		}
		response(w, `{"results":[{"id":42,"title":"电影","name":"剧集","release_date":"2025-01-01","first_air_date":"2026-01-02","overview":"<b>简介</b>","vote_average":8,"vote_count":10}],"total_results":1,"total_pages":1}`)
	}))
	defer srv.Close()
	p := newProvider("tmdb", srv.URL).(*tmdbprovider.Provider)
	service := discovery.NewService(discovery.NewRegistry(p))
	now := time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)
	service.Cache.Now = func() time.Time { return now }
	cases := []struct{ name, path, kind string }{
		{"movie_day", "/trending/movie/day", "movie"}, {"movie_week", "/trending/movie/week", "movie"},
		{"tv_day", "/trending/tv/day", "tv"}, {"tv_week", "/trending/tv/week", "tv"},
		{"movie_popular", "/movie/popular", "movie"}, {"tv_popular", "/tv/popular", "tv"},
		{"movie_top", "/movie/top_rated", "movie"}, {"tv_top", "/tv/top_rated", "tv"},
		{"movie_now", "/movie/now_playing", "movie"}, {"movie_upcoming", "/movie/upcoming", "movie"},
		{"tv_airing", "/tv/airing_today", "tv"}, {"tv_on_air", "/tv/on_the_air", "tv"},
	}
	for _, tt := range cases {
		page, e := service.Ranking(context.Background(), "tmdb", tt.name)
		if e != nil || path != tt.path || len(page.Items) != 1 || string(page.Items[0].MediaType) != tt.kind || page.Items[0].Overview != "简介" {
			t.Fatalf("%s: %+v %v path=%s", tt.name, page, e, path)
		}
		before := calls
		_, e = service.Ranking(context.Background(), "tmdb", tt.name)
		if e != nil || calls != before {
			t.Fatal("chart cache miss", e)
		}
	}
	for _, kind := range []string{"movie", "tv"} {
		for _, country := range []string{"US", "JP"} {
			platforms, e := service.Platforms(context.Background(), kind, country)
			if e != nil || len(platforms) != 1 || platforms[0].Logo != "https://image.tmdb.org/t/p/w92/netflix.jpg" || region != country {
				t.Fatal(platforms, e, region)
			}
			before := calls
			_, e = service.Platforms(context.Background(), kind, country)
			if e != nil || calls != before {
				t.Fatal("platform cache miss", e)
			}
			for _, mode := range []string{"flatrate", "free", "ads", "rent", "buy"} {
				monetization = mode
				page, e := service.Ranking(context.Background(), "tmdb", fmt.Sprintf("platform_%s_%s_8_%s", kind, country, mode))
				if e != nil || len(page.Items) != 1 || string(page.Items[0].MediaType) != kind {
					t.Fatal(page, e)
				}
			}
		}
	}
	before := calls
	for _, bad := range []string{"unknown", "platform_tv_US_8_bad", "platform_tv_global_8", "platform_tv_US_0", "platform_person_US_8"} {
		if _, e := p.Ranking(context.Background(), bad); e == nil {
			t.Fatal("accepted", bad)
		}
	}
	if calls != before {
		t.Fatal("invalid chart reached upstream")
	}
	now = now.Add(time.Hour + time.Second)
	_, e := service.Ranking(context.Background(), "tmdb", "movie_day")
	if e != nil || calls != before+1 {
		t.Fatal("chart TTL", e)
	}
	before = calls
	_, e = service.Platforms(context.Background(), "movie", "US")
	if e != nil || calls != before {
		t.Fatal("platform TTL too short", e)
	}
	now = now.Add(24 * time.Hour)
	_, e = service.Platforms(context.Background(), "movie", "US")
	if e != nil || calls != before+1 {
		t.Fatal("platform TTL", e)
	}
}

func TestBangumiCalendarUsesBeijingDayAndDayCache(t *testing.T) {
	calls := 0
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/calendar" {
			t.Error(r.URL.Path)
		}
		response(w, `[{"weekday":{"id":1},"items":[{"id":1,"name":"周一","type":2,"air_date":"2026-10-12"}]},{"weekday":{"id":7},"items":[{"id":7,"name":"周日","type":2,"air_date":"2026-10-11"}]}]`)
	}))
	defer srv.Close()
	p := newProvider("bangumi", srv.URL).(*bangumi.Provider)
	service := discovery.NewService(discovery.NewRegistry(p))
	now := time.Date(2026, 10, 11, 15, 59, 0, 0, time.UTC)
	service.Cache.Now = func() time.Time { return now }
	page, e := service.Ranking(context.Background(), "bangumi", "airing")
	if e != nil || len(page.Items) != 1 || page.Items[0].Title != "周日" || page.Items[0].ReleaseDate != "2026-10-11" {
		t.Fatal(page, e)
	}
	_, e = service.Ranking(context.Background(), "bangumi", "airing")
	if e != nil || calls != 1 {
		t.Fatal("calendar cache miss", e)
	}
	now = now.Add(2 * time.Minute)
	page, e = service.Ranking(context.Background(), "bangumi", "airing")
	if e != nil || len(page.Items) != 1 || page.Items[0].Title != "周一" || calls != 2 {
		t.Fatal("yesterday's calendar survived midnight", page, e)
	}
	if _, e = p.Ranking(context.Background(), "airing:not-a-date"); e == nil {
		t.Fatal("invalid date accepted")
	}
}

func TestAniListChartSorts(t *testing.T) {
	expected := ""
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Query string }
		if json.NewDecoder(r.Body).Decode(&body) != nil || !strings.Contains(body.Query, "sort:"+expected) {
			t.Error("wrong sort", body.Query)
		}
		response(w, `{"data":{"Page":{"pageInfo":{"total":1,"hasNextPage":false},"media":[`+aniItem+`]}}}`)
	}))
	defer srv.Close()
	p := newProvider("anilist", srv.URL).(*anilist.Provider)
	for name, sort := range map[string]string{"popularity": "POPULARITY_DESC", "trending": "TRENDING_DESC", "score": "SCORE_DESC"} {
		expected = sort
		page, e := p.Ranking(context.Background(), name)
		if e != nil || len(page.Items) != 1 {
			t.Fatal(name, page, e)
		}
	}
	if _, e := p.Ranking(context.Background(), "unknown"); e == nil {
		t.Fatal("invalid chart accepted")
	}
}
