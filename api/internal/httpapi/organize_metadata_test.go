package httpapi

import (
	"context"
	"media-center/internal/discovery"
	"media-center/internal/download"
	"media-center/internal/media"
	"media-center/internal/pan115"
	"testing"
)

type namingProvider struct {
	contractProvider
	items []media.Summary
	total int
}

func (p namingProvider) Capabilities() discovery.Capabilities {
	return discovery.NewCapabilities("tmdb", "TMDB", []string{"movie", "tv"}, []string{"popular"}, 20, 100)
}
func (p namingProvider) Validate(discovery.Query) error { return nil }
func (p namingProvider) Discover(context.Context, discovery.Query) (discovery.Page, error) {
	return discovery.Page{Items: p.items, Total: &p.total}, nil
}
func TestNamingResolverRequiresUniqueIdentityAndPreservesMikan(t *testing.T) {
	year := 2024
	item := media.Summary{Identity: media.Identity{ProviderID: "77"}, Title: "Film", Year: &year}
	a := &API{discovery: discovery.NewService(discovery.NewRegistry(namingProvider{items: []media.Summary{item}, total: 1}))}
	f := pan115.File{Name: "Film.2024.1080p.mkv"}
	m, e := a.resolveOrganizeMedia(context.Background(), download.MediaContext{}, f)
	if e != nil || m.Title != "Film" || m.ProviderID != "77" || m.Year != 2024 {
		t.Fatalf("%+v %v", m, e)
	}
	a.discovery = discovery.NewService(discovery.NewRegistry(namingProvider{items: []media.Summary{item, item}, total: 2}))
	if _, e = a.resolveOrganizeMedia(context.Background(), download.MediaContext{}, f); e == nil {
		t.Fatal("ambiguous identity selected")
	}
	saved := download.MediaContext{Type: "anime", Title: "订阅标题", BangumiID: "123", MikanID: "456", Season: 2, Episodes: []int{3}}
	m, e = a.resolveOrganizeMedia(context.Background(), saved, f)
	if e != nil || m.BangumiID != "123" || m.ProviderID != "" || m.Episodes[0] != 3 {
		t.Fatalf("subscription identity replaced %+v %v", m, e)
	}
}
