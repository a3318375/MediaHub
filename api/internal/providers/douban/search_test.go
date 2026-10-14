package douban

import (
	"context"
	"encoding/json"
	"media-center/internal/discovery"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestSearchCoverAndFiltering(t *testing.T) {
	signed := "https://qnmob3-sign.doubanio.com/view/photo/large/public/p.jpg?sa_cv=abc&imageView2/0/q/80/format/webp"
	img := "https://img3.doubanio.com/view/subject/m/public/p.jpg"
	for _, kind := range []string{"movie", "tv"} {
		t.Run(kind, func(t *testing.T) {
			items := []any{}
			for i, cover := range []string{signed, img, "", "https://evil.test/p.jpg"} {
				items = append(items, map[string]any{"layout": "subject", "target_type": kind, "target": map[string]any{"id": 100 + i, "title": "作品", "cover_url": cover}})
			}
			for _, typ := range []string{"book", "collection", "movie"} {
				layout := "subject"
				if typ == "movie" {
					layout = "doulist_cards"
				}
				items = append(items, map[string]any{"layout": layout, "target_type": typ, "target": map[string]any{"id": "999", "title": "排除", "cover_url": signed}})
			}
			p := New()
			p.Transport.Interval = 0
			p.Transport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/api/v2/search/weixin" {
					t.Fatal(r.URL.Path)
				}
				w := httptest.NewRecorder()
				json.NewEncoder(w).Encode(map[string]any{"items": items, "start": 0, "count": 20, "total": 7})
				return w.Result(), nil
			})
			page, err := p.Discover(context.Background(), discovery.Query{MediaType: kind, Search: "奥本海默", Page: 1, PageSize: 20})
			if err != nil || len(page.Items) != 4 {
				t.Fatalf("page=%+v err=%v", page, err)
			}
			for i, want := range []string{"/api/media/image?source=douban&url=" + url.QueryEscape(signed), "/api/media/image?source=douban&url=" + url.QueryEscape(img)} {
				if page.Items[i].PosterPath == nil || *page.Items[i].PosterPath != want {
					t.Fatalf("poster %d: %v", i, page.Items[i].PosterPath)
				}
			}
			for _, item := range page.Items[2:] {
				if item.PosterPath != nil {
					t.Fatalf("unexpected poster %v", *item.PosterPath)
				}
			}
		})
	}
}

func TestRecommendationPostersRemainProxied(t *testing.T) {
	for _, kind := range []string{"movie", "tv"} {
		t.Run(kind, func(t *testing.T) {
			img := "https://img1.doubanio.com/view/photo/large/public/p.jpg"
			p := New()
			p.Transport.Interval = 0
			p.Transport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/api/v2/"+kind+"/recommend" {
					t.Fatal(r.URL.Path)
				}
				w := httptest.NewRecorder()
				json.NewEncoder(w).Encode(map[string]any{"start": 0, "count": 20, "total": 1, "items": []any{map[string]any{"id": "123", "title": "作品", "uri": "douban://douban.com/" + kind + "/123", "pic": map[string]string{"large": img}, "cover_url": "https://qnmob3-sign.doubanio.com/p.jpg?sig=abc"}}})
				return w.Result(), nil
			})
			page, err := p.Discover(context.Background(), discovery.Query{MediaType: kind, Page: 1, PageSize: 20})
			if err != nil || len(page.Items) != 1 {
				t.Fatalf("page=%+v err=%v", page, err)
			}
			want := "/api/media/image?source=douban&url=" + url.QueryEscape(img)
			if page.Items[0].PosterPath == nil || *page.Items[0].PosterPath != want {
				t.Fatalf("poster=%v", page.Items[0].PosterPath)
			}
		})
	}
}

func TestSearchPosterRejectsUnsafeURLs(t *testing.T) {
	for _, raw := range []string{"http://cdn.doubanio.com/p.jpg", "https://doubanio.com.evil.test/p.jpg", "https://evil.test/p.jpg", "https://user@cdn.doubanio.com/p.jpg", "https://cdn.doubanio.com:443/p.jpg", "https://cdn.doubanio.com/p.jpg#fragment"} {
		if searchPoster(raw) != nil {
			t.Fatal(raw)
		}
	}
}
