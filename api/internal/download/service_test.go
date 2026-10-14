package download_test

import (
	"context"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"media-center/internal/anime"
	"media-center/internal/download"
	"media-center/internal/pan115"
	"media-center/internal/store"
)

const hash = "0123456789abcdef0123456789abcdef01234567"
const cookie = "UID=123_A1; CID=fixture; SEID=fixture; KID=fixture"

type gateway struct {
	tasks    []pan115.RemoteTask
	files    map[string]pan115.File
	children map[string][]pan115.File
	submits  int
	err      error
	onSubmit func()
	queryErr error
	queries  int
}

func (g *gateway) CheckAccount() error { return nil }
func (g *gateway) OfflineTasks() ([]pan115.RemoteTask, error) {
	g.queries++
	return g.tasks, g.queryErr
}
func (g *gateway) Submit(string, string) (string, error) {
	g.submits++
	if g.onSubmit != nil {
		g.onSubmit()
	}
	return hash, g.err
}
func (g *gateway) GetFile(id string) (pan115.File, error) {
	if f, ok := g.files[id]; ok {
		return f, nil
	}
	return pan115.File{}, &pan115.Error{Code: "not_found", Message: "文件尚不可见", Certain: true}
}
func (g *gateway) ListFiles(id string) ([]pan115.File, error) { return g.children[id], nil }
func request() download.Request {
	return download.Request{Kind: "offline", URL: "magnet:?xt=urn:btih:" + hash, DirectoryID: "100", Reference: download.Reference{Source: "manual", Media: download.MediaContext{Type: "anime", BangumiID: "42", Season: 1, Episodes: []int{3}}}}
}
func setup(t *testing.T) (*store.Store, *download.Service, *gateway, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	raw, _ := json.Marshal(cookie)
	if err = db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": raw}, nil); err != nil {
		t.Fatal(err)
	}
	g := &gateway{files: map[string]pan115.File{"100": {ID: "100", Directory: true}}, children: map[string][]pan115.File{}}
	s := download.New(db)
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	return db, s, g, dir
}
func enqueue(t *testing.T, s *download.Service) download.Task {
	t.Helper()
	task, created, err := s.Enqueue(request())
	if err != nil || !created {
		t.Fatal(task, created, err)
	}
	return task
}
func tick(t *testing.T, s *download.Service) {
	t.Helper()
	if err := s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
}
func read(t *testing.T, db *store.Store, id string) download.Task {
	t.Helper()
	v, err := db.GetDownload(id)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestMagnetNormalizesBase32AndRejectsWrongSources(t *testing.T) {
	b, _ := hex.DecodeString(hash)
	m, h, e := download.NormalizeMagnet("magnet:?xt=urn:btih:" + base32.StdEncoding.EncodeToString(b) + "&dn=test")
	if e != nil || h != hash || m == "" {
		t.Fatal(m, h, e)
	}
	for _, raw := range []string{"https://example.com/a.torrent", "https://115.com/s/test", "magnet:?xt=urn:btmh:1220abc", "magnet:?xt=urn:btih:bad", "magnet:?xt=urn:btih:" + hash + "&xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"} {
		if _, _, e = download.NormalizeMagnet(raw); e == nil {
			t.Fatal("accepted", raw)
		}
	}
}
func TestDownloadDeduplicatesAndKeepsBusinessReferences(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	r := request()
	r.Reference.Source = "media_search"
	r.Reference.Media = download.MediaContext{Type: "tv", Provider: "tmdb", ProviderID: "99"}
	again, created, err := s.Enqueue(r)
	if err != nil || created || again.ID != task.ID || len(again.References) != 2 {
		t.Fatal(again, created, err)
	}
	if _, created, err = s.Enqueue(r); err != nil || created {
		t.Fatal(err)
	}
	r.DirectoryID = "200"
	if _, _, err = s.Enqueue(r); !errors.Is(err, download.ErrConflict) {
		t.Fatal(err)
	}
	tick(t, s)
	tick(t, s)
	if g.submits != 1 {
		t.Fatal("duplicate submission", g.submits)
	}
	if v := read(t, db, task.ID); v.State != "unknown" || len(v.References) != 2 {
		t.Fatal(v)
	}
}
func TestUncertainSubmitReconcilesAfterRestartWithoutResubmitting(t *testing.T) {
	db, s, g, dir := setup(t)
	task := enqueue(t, s)
	g.err = context.DeadlineExceeded
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "unknown" {
		t.Fatal(v)
	}
	db.Close()
	reopened, e := store.Open(dir)
	if e != nil {
		t.Fatal(e)
	}
	defer reopened.Close()
	s = download.New(reopened)
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	tick(t, s)
	if g.submits != 1 {
		t.Fatal("resubmitted after restart")
	}
	g.tasks = []pan115.RemoteTask{{Hash: hash, Status: 1, Percent: 33, Speed: 20, DirectoryID: "100"}}
	tick(t, s)
	if v := read(t, reopened, task.ID); v.State != "downloading" || v.Progress != 33 || g.submits != 1 {
		t.Fatal(v)
	}
}
func TestReportedCompleteWaitsForFilesAndPersistsArtifacts(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	g.tasks = []pan115.RemoteTask{{Hash: hash, Status: 1, Percent: 100, DirectoryID: "100"}}
	tick(t, s)
	if v := read(t, db, task.ID); v.State == "completed" {
		t.Fatal("percent incorrectly completed")
	}
	g.tasks[0].Status = 2
	g.tasks[0].FileID = "300"
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "awaiting_files" {
		t.Fatal(v)
	}
	g.files["300"] = pan115.File{ID: "300", ParentID: "100", Directory: true}
	g.children["300"] = []pan115.File{{ID: "301", ParentID: "300", Name: "episode.mkv", Size: 100}, {ID: "302", ParentID: "300", Name: "episode.ass", Size: 3}}
	// Completed task disappears from remote list, but its confirmed root ID remains usable.
	g.tasks = nil
	tick(t, s)
	v := read(t, db, task.ID)
	if v.State != "completed" || len(v.Artifacts) != 2 || v.RootFileID != "300" || v.References[0].Media.BangumiID != "42" {
		t.Fatal(v)
	}
}
func TestAccountChangeAndExistingRemoteDestinationNeverSubmit(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	g.tasks = []pan115.RemoteTask{{Hash: hash, Status: 2, DirectoryID: "999", FileID: "301"}}
	tick(t, s)
	if v := read(t, db, task.ID); v.ErrorCode != "destination_conflict" || g.submits != 0 {
		t.Fatal(v)
	}
	raw, _ := json.Marshal("UID=456_A1; CID=fixture; SEID=fixture")
	if err := db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": raw}, nil); err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if v := read(t, db, task.ID); v.ErrorCode != "account_changed" || g.submits != 0 {
		t.Fatal(v)
	}
}
func TestCancellationCannotBeOverwrittenBySubmitResponse(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	g.onSubmit = func() {
		if _, err := s.Cancel(task.ID); err != nil {
			t.Fatal(err)
		}
	}
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "cancelled" {
		t.Fatal(v)
	}
	tick(t, s)
	if g.submits != 1 {
		t.Fatal(g.submits)
	}
	if _, err := s.Resume(task.ID); err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if g.submits != 1 {
		t.Fatal("uncertain cancelled submission repeated")
	}
}

func TestKnownRejectionCanRetryButUncertainCannot(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	g.err = &pan115.Error{Code: "quota", Message: "配额不足", Certain: true}
	tick(t, s)
	if v := read(t, db, task.ID); v.State != "failed" {
		t.Fatal(v)
	}
	if _, err := s.Retry(task.ID); err != nil {
		t.Fatal(err)
	}
	g.err = context.DeadlineExceeded
	tick(t, s)
	if _, err := s.Retry(task.ID); !errors.Is(err, download.ErrConflict) {
		t.Fatal("uncertain retry allowed", err)
	}
}
func TestNoActiveTaskMakesNoCredentialOrNetworkRequests(t *testing.T) {
	db, s, _, _ := setup(t)
	if err := db.SaveSettings("115", nil, []string{"115.cookie"}); err != nil {
		t.Fatal(err)
	}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) {
		t.Fatal("network used without tasks")
		return nil, nil
	}
	tick(t, s)
}

func TestQueryFailureBackoffAndCredentialWake(t *testing.T) {
	db, s, g, _ := setup(t)
	task := enqueue(t, s)
	now := s.Now()
	s.Now = func() time.Time { return now }
	g.queryErr = errors.New("private upstream details")
	tick(t, s)
	tick(t, s)
	if g.queries != 1 {
		t.Fatal("did not back off", g.queries)
	}
	if v := read(t, db, task.ID); v.NextCheckAt == "" || strings.Contains(v.Error, "private") {
		t.Fatal(v)
	}
	if err := s.CredentialsChanged(); err != nil {
		t.Fatal(err)
	}
	g.queryErr = nil
	tick(t, s)
	if g.queries != 2 || g.submits != 1 {
		t.Fatal(g.queries, g.submits)
	}
}
func TestAnimeOptInQueuesDurableCandidateOnce(t *testing.T) {
	db, s, g, _ := setup(t)
	sub, err := db.CreateAnime(anime.Draft{Title: "动画", BangumiID: "123", Season: 2, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	number := float64(3)
	sub.Discovered = []anime.Entry{{Title: "动画 - 03", URL: request().URL, Episode: &number, Accepted: true}}
	sub.LastCheckedAt = "fixture"
	if _, err = db.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if g.submits != 0 {
		t.Fatal("submitted before opt-in")
	}
	if err = db.SetAnimeDownloadRule(sub.ID, download.AnimeDownloadRule{Enabled: true, DirectoryID: "100", FromEpisode: 4}); err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	if g.submits != 0 {
		t.Fatal("ignored episode boundary")
	}
	if err = db.SetAnimeDownloadRule(sub.ID, download.AnimeDownloadRule{Enabled: true, DirectoryID: "100", FromEpisode: 3}); err != nil {
		t.Fatal(err)
	}
	tick(t, s)
	tick(t, s)
	if g.submits != 1 {
		t.Fatal("missing/duplicate submit", g.submits)
	}
	items, err := db.ListAnimeCandidates(sub.ID)
	if err != nil || len(items) != 1 || items[0].TaskID == "" {
		t.Fatal(items, err)
	}
	task := read(t, db, items[0].TaskID)
	if task.References[0].Media.Season != 2 || task.References[0].Media.BangumiID != "123" {
		t.Fatal(task)
	}
}
