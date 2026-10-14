//go:build realupstream

package providers_test

import (
	"context"
	"media-center/internal/discovery"
	"media-center/internal/providers/anilist"
	"media-center/internal/providers/bangumi"
	"media-center/internal/providers/douban"
	tmdbprovider "media-center/internal/providers/tmdb"
	legacy "media-center/internal/tmdb"
	"os"
	"strconv"
	"testing"
	"time"
)

// No database or browser session access. TMDB credentials must be supplied explicitly by the caller.
// Each source gets one exploration, one search and one detail; no automatic real-request retries for Douban.
func TestRealUpstreamSmoke(t *testing.T) {
	sources := []struct {
		source, kind, id, keyword string
		p                         discovery.Provider
	}{
		{"bangumi", "anime", "253", "星际牛仔", bangumi.New()},
		{"anilist", "anime", "9253", "命运石之门", anilist.New()},
		{"douban", "movie", "1292052", "肖申克的救赎", douban.New()},
	}
	key := os.Getenv("TMDB_API_KEY")
	if key != "" {
		sources = append(sources, struct {
			source, kind, id, keyword string
			p                         discovery.Provider
		}{"tmdb", "movie", "550", "搏击俱乐部", &tmdbprovider.Provider{Client: legacy.NewClient(), Key: func(context.Context) (string, error) { return key, nil }}})
	} else {
		t.Log("TMDB: SKIP（未设置 TMDB_API_KEY；按要求不读取本地数据库）")
	}
	for _, source := range sources {
		t.Run(source.source, func(t *testing.T) {
			service := discovery.NewService(discovery.NewRegistry(source.p))
			service.Cache.Timeout = 25 * time.Second
			for _, operation := range []string{"discover", "search", "detail"} {
				t.Run(operation, func(t *testing.T) {
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					if operation == "detail" {
						d, e := service.Detail(ctx, source.source, source.kind, source.id, "")
						if e != nil {
							t.Fatal(e)
						}
						if d.SourceID != source.id || d.Title == "" {
							t.Fatal("invalid detail identity/title")
						}
						t.Logf("id=%s title=%s", d.MediaID, d.Title)
						return
					}
					q := discovery.Query{MediaType: source.kind, Page: 1, PageSize: 20}
					if operation == "search" {
						q.Search = source.keyword
					}
					page, e := service.Discover(ctx, source.source, q)
					if e != nil {
						t.Fatal(e)
					}
					total := "unknown"
					if page.Total != nil {
						total = fmtInt(*page.Total)
					}
					t.Logf("items=%d total=%s capped=%v", len(page.Items), total, page.TotalCapped)
					if source.source != "douban" && len(page.Items) == 0 {
						t.Fatal("no hits")
					}
					if source.source == "anilist" && operation == "search" {
						matched := false
						for _, item := range page.Items {
							if item.SourceID == source.id {
								matched = true
							}
						}
						if !matched {
							t.Fatal("中文搜索未命中命运石之门 9253")
						}
					}
				})
			}
		})
	}
}
func fmtInt(n int) string { return strconv.Itoa(n) }
