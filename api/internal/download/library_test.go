package download_test

import (
	"context"
	"fmt"
	"media-center/internal/anime"
	"media-center/internal/download"
	"media-center/internal/organize"
	"media-center/internal/pan115"
	"testing"
)

type libraryGateway struct {
	*gateway
	created int
}

func TestAddedSubscriptionAutomaticallySubmitsMatchingResource(t *testing.T) {
	db, s, g, _ := setup(t)
	if _, e := db.SaveOrganizeRule(organize.Rule{Name: "媒体整理", Simple: true, AccountID: "123", SourceID: "100", TargetID: "200", Cron: "0 3 * * *", TypeHint: "auto", Recursive: true}); e != nil {
		t.Fatal(e)
	}
	fake := &libraryGateway{gateway: g}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return fake, nil }
	sub, e := db.CreateAnimeWithDownload(anime.Draft{Title: "自动番剧", BangumiID: "123", Season: 2, Enabled: true})
	if e != nil {
		t.Fatal(e)
	}
	episode := float64(1)
	sub.Discovered = []anime.Entry{{Title: "自动番剧 - 01", URL: "magnet:?xt=urn:btih:" + hash, ResourceID: "btih:" + hash, DownloadKind: "magnet", Episode: &episode, Accepted: true}}
	if _, e = db.SaveAnimeRefresh(sub); e != nil {
		t.Fatal(e)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	tasks, e := db.ListDownloads(false)
	if e != nil || len(tasks) != 1 || g.submits != 1 || g.files[tasks[0].DirectoryID].Name != "动漫" || tasks[0].References[0].Media.Season != 2 {
		t.Fatalf("automatic submit failed %+v %v submits=%d", tasks, e, g.submits)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if g.submits != 1 {
		t.Fatal("duplicate initial submission")
	}
}

func (g *libraryGateway) CreateDirectory(parent, name string) (pan115.File, error) {
	g.created++
	f := pan115.File{ID: fmt.Sprint(200 + g.created), ParentID: parent, Name: name, Directory: true}
	g.children[parent] = append(g.children[parent], f)
	g.files[f.ID] = f
	return f, nil
}
func TestLibraryRoutesMediaAndReusesDirectories(t *testing.T) {
	db, s, g, _ := setup(t)
	if _, e := s.ResolveLibraryDirectory(context.Background(), "movie"); e == nil {
		t.Fatal("missing config accepted")
	}
	r, e := db.SaveOrganizeRule(organize.Rule{Name: "媒体整理", Simple: true, AccountID: "123", SourceID: "100", TargetID: "200", DailyAt: "03:00", Recursive: true, TypeHint: "auto"})
	if e != nil {
		t.Fatal(e)
	}
	fake := &libraryGateway{gateway: g}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return fake, nil }
	first, e := s.ResolveLibraryDirectory(context.Background(), "movie")
	if e != nil {
		t.Fatal(e)
	}
	again, e := s.ResolveLibraryDirectory(context.Background(), "movie")
	if e != nil || first != again || fake.created != 1 {
		t.Fatalf("%s %s %d %v", first, again, fake.created, e)
	}
	anime, e := s.ResolveLibraryDirectory(context.Background(), "anime")
	if e != nil || anime == first || g.files[anime].Name != "动漫" {
		t.Fatalf("%s %v", anime, e)
	}
	r.AccountID = "456"
	if _, e = db.SaveOrganizeRule(r); e != nil {
		t.Fatal(e)
	}
	if _, e = s.ResolveLibraryDirectory(context.Background(), "movie"); e == nil {
		t.Fatal("changed account accepted")
	}
	if download.Category("program") != "节目" || download.Category("") != "待识别" {
		t.Fatal("category")
	}
}
