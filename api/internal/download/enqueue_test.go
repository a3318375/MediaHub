package download_test

import (
	"context"
	"encoding/json"
	"testing"

	"mediahub/internal/download"
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

func TestTVUsesPublicDownloadWithSeasonContextAndDedup(t *testing.T) {
	db, s, g, _ := setup(t)
	if _, err := db.SaveOrganizeRule(organize.Rule{Name: "整理", Simple: true, AccountID: "123", SourceID: "100", TargetID: "200", TypeHint: "auto", Recursive: true}); err != nil {
		t.Fatal(err)
	}
	fake := &libraryGateway{gateway: g}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return fake, nil }
	r := request()
	r.Reference = download.Reference{Source: "tv_subscription", SourceID: "tmdb-123-s1", Media: download.MediaContext{Type: "tv", Title: "剧集", Provider: "tmdb", ProviderID: "123", Season: 1, Episodes: []int{2}}}
	task, created, err := s.EnqueueToLibrary(context.Background(), r)
	if err != nil || !created {
		t.Fatalf("enqueue: %+v %v", task, err)
	}
	if task.References[0].Media.Episodes[0] != 2 || g.files[task.DirectoryID].Name != "电视剧" {
		t.Fatalf("lost context: %+v", task)
	}
	again, created, err := s.EnqueueToLibrary(context.Background(), r)
	if err != nil || created || again.ID != task.ID {
		t.Fatalf("not idempotent: %+v %v", again, err)
	}
}

func TestPublicLibraryEnqueueRejectsAccountChangeDuringResolution(t *testing.T) {
	db, s, g, _ := setup(t)
	if _, err := db.SaveOrganizeRule(organize.Rule{Name: "整理", Simple: true, AccountID: "123", SourceID: "100", TargetID: "200", TypeHint: "auto", Recursive: true}); err != nil {
		t.Fatal(err)
	}
	fake := &libraryGateway{gateway: g}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) {
		raw, _ := json.Marshal("UID=456_A1; CID=x; SEID=x; KID=x")
		if err := db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": raw}, nil); err != nil {
			t.Fatal(err)
		}
		return fake, nil
	}
	if _, _, err := s.EnqueueToLibrary(context.Background(), request()); err == nil {
		t.Fatal("account changed but download enqueued")
	}
	tasks, err := db.ListDownloads(false)
	if err != nil || len(tasks) != 0 {
		t.Fatalf("unexpected task: %+v %v", tasks, err)
	}
}
