package download_test

import (
	"context"
	"strings"
	"testing"

	"media-center/internal/download"
	"media-center/internal/pan115"
)

type shareGateway struct {
	*gateway
	source   map[string][]pan115.File
	receives int
	partial  bool
}

func (g *shareGateway) ListShare(code, password, directory string) ([]pan115.File, error) {
	return g.source[directory], nil
}
func (g *shareGateway) CreateDirectory(parent, name string) (pan115.File, error) {
	f := pan115.File{ID: "500", ParentID: parent, Name: name, Directory: true}
	g.files[f.ID] = f
	g.children[parent] = append(g.children[parent], f)
	return f, nil
}
func (g *shareGateway) ReceiveShare(code, password string, ids []string, directory string) error {
	g.receives++
	if password != "fixture" {
		return &pan115.Error{Code: "share_password", Message: "提取码不正确", Certain: true}
	}
	g.children[directory] = []pan115.File{{ID: "701", ParentID: directory, Name: "movie.mkv", Size: 4, SHA1: "abc"}}
	if g.partial {
		return context.DeadlineExceeded
	}
	g.children[directory] = append(g.children[directory], pan115.File{ID: "702", ParentID: directory, Name: "movie.ass", Size: 1})
	return nil
}
func shareRequest() download.Request {
	return download.Request{Kind: "share_transfer", URL: "https://115.com/s/fixture123?password=fixture", FileIDs: []string{"7", "8"}, DirectoryID: "100", Reference: download.Reference{Source: "media_search", Media: download.MediaContext{Type: "movie", Provider: "tmdb", ProviderID: "99"}}}
}
func TestShareTransferConfirmsNewIDsAndDoesNotExposePassword(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	task, created, err := s.Enqueue(shareRequest())
	if err != nil || !created {
		t.Fatal(task, created, err)
	}
	if strings.Contains(task.URL, "password") {
		t.Fatal("password leaked", task.URL)
	}
	password, err := db.DownloadReceiveCode(task.ID)
	if err != nil || password != "fixture" {
		t.Fatal("missing encrypted secret", err)
	}
	tick(t, s)
	v := read(t, db, task.ID)
	if v.State != "completed" || len(v.Artifacts) != 2 || v.Artifacts[0].ID == "7" || base.submits != 0 || base.queries != 0 || g.receives != 1 {
		t.Fatal(v, g.receives, base.submits, base.queries)
	}
	if _, created, err = s.Enqueue(shareRequest()); err != nil || created {
		t.Fatal(created, err)
	}
	tick(t, s)
	if g.receives != 1 {
		t.Fatal("duplicate transfer")
	}
}
func TestShareUncertainPartialTransferOnlyReconciles(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, partial: true, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	task, _, err := s.Enqueue(shareRequest())
	if err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if v := read(t, db, task.ID); v.State == "completed" {
		t.Fatal("partial transfer completed", v)
	}
	tick(t, s)
	if g.receives != 1 {
		t.Fatal("uncertain transfer resubmitted")
	}
	g.children["500"] = append(g.children["500"], pan115.File{ID: "702", ParentID: "500", Name: "movie.ass", Size: 1})
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "completed" || g.receives != 1 {
		t.Fatal(v, g.receives)
	}
}
func TestShareSelectionIdentityAndURLValidation(t *testing.T) {
	for _, raw := range []string{"https://evil.test/s/fixture", "https://115.com/s/fixture/extra", "https://user@115.com/s/fixture", "javascript:alert(1)"} {
		if _, _, _, e := download.ParseShare(raw, ""); e == nil {
			t.Fatal("accepted", raw)
		}
	}
	r := shareRequest()
	hash, err := download.Validate(&r)
	if err != nil || !strings.HasPrefix(hash, "share:") {
		t.Fatal(hash, err)
	}
	r.FileIDs = []string{"8", "7"}
	again, err := download.Validate(&r)
	if err != nil || again != hash {
		t.Fatal(again, hash, err)
	}
}

func TestWholeShareDiscoversAndPersistsSelectionInBackground(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &shareGateway{gateway: base, source: map[string][]pan115.File{"0": {{ID: "7", Name: "movie.mkv", Size: 4, SHA1: "abc"}, {ID: "8", Name: "movie.ass", Size: 1}}}}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	r := shareRequest()
	r.WholeShare = true
	r.FileIDs = nil
	task, created, e := s.Enqueue(r)
	if e != nil || !created || len(task.FileIDs) != 0 || !task.WholeShare {
		t.Fatalf("%+v %v", task, e)
	}
	tick(t, s)
	v := read(t, db, task.ID)
	if v.State != "completed" || len(v.FileIDs) != 2 || len(v.Manifest) != 2 || g.receives != 1 {
		t.Fatalf("%+v receives=%d", v, g.receives)
	}
	if _, created, e = s.Enqueue(r); e != nil || created {
		t.Fatal("whole-share duplicate", e)
	}
	tick(t, s)
	if g.receives != 1 {
		t.Fatal("whole share submitted twice")
	}
}
