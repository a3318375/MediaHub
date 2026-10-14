package organize_test

import (
	"context"
	"encoding/json"
	"fmt"
	"media-center/internal/download"
	"media-center/internal/organize"
	"media-center/internal/pan115"
	"media-center/internal/store"
	"testing"
)

type files struct {
	data                 map[string]pan115.File
	seq                  int
	renames, moves       int
	loseRename, loseMove bool
}

func (f *files) CheckAccount() error                        { return nil }
func (f *files) OfflineTasks() ([]pan115.RemoteTask, error) { panic("not needed") }
func (f *files) Submit(string, string) (string, error)      { panic("not needed") }
func (f *files) GetFile(id string) (pan115.File, error) {
	v, ok := f.data[id]
	if !ok {
		return v, &pan115.Error{Code: "not_found", Message: "not found", Certain: true}
	}
	return v, nil
}
func (f *files) ListFiles(id string) ([]pan115.File, error) {
	out := []pan115.File{}
	for _, v := range f.data {
		if v.ParentID == id {
			out = append(out, v)
		}
	}
	return out, nil
}
func (f *files) CreateDirectory(parent, name string) (pan115.File, error) {
	f.seq++
	v := pan115.File{ID: fmt.Sprint(f.seq + 100), ParentID: parent, Name: name, Directory: true}
	f.data[v.ID] = v
	return v, nil
}
func (f *files) RenameFile(id, name string) error {
	f.renames++
	v := f.data[id]
	v.Name = name
	f.data[id] = v
	if f.loseRename {
		f.loseRename = false
		return context.DeadlineExceeded
	}
	return nil
}
func (f *files) MoveFile(id, parent string) error {
	f.moves++
	v := f.data[id]
	v.ParentID = parent
	f.data[id] = v
	if f.loseMove {
		f.loseMove = false
		return context.DeadlineExceeded
	}
	return nil
}
func (f *files) DeleteEmptyDirectory(id string) error {
	items, _ := f.ListFiles(id)
	if len(items) != 0 || !f.data[id].Directory {
		return fmt.Errorf("not empty directory")
	}
	delete(f.data, id)
	return nil
}

func TestCleanupEmptyDirectories(t *testing.T) {
	db, g, s, r := setup(t)
	r.Recursive = true
	var err error
	r, err = db.SaveOrganizeRule(r)
	if err != nil {
		t.Fatal(err)
	}
	g.data["30"] = pan115.File{ID: "30", ParentID: "10", Directory: true}
	g.data["31"] = pan115.File{ID: "31", ParentID: "30", Directory: true}
	g.data["40"] = pan115.File{ID: "40", ParentID: "10", Directory: true}
	g.data["41"] = pan115.File{ID: "41", ParentID: "40", Name: "readme.txt", Size: 1}
	file := g.data["1"]
	file.ParentID = "31"
	g.data["1"] = file
	p, err := s.Preview(context.Background(), r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Start(p.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	p, _ = db.OrganizePlan(p.ID)
	if p.State != "completed" {
		t.Fatalf("%+v", p)
	}
	for _, id := range []string{"30", "31"} {
		if _, exists := g.data[id]; exists {
			t.Fatalf("empty directory %s remains", id)
		}
	}
	for _, id := range []string{"10", "20", "40", "41", "1"} {
		if _, exists := g.data[id]; !exists {
			t.Fatalf("protected/nonempty item %s deleted", id)
		}
	}
}
func setup(t *testing.T) (*store.Store, *files, *organize.Service, organize.Rule) {
	t.Helper()
	db, e := store.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	if e = db.SaveSettings("115", map[string]json.RawMessage{"115.cookie": json.RawMessage(`"UID=123_A1; CID=test; SEID=test"`)}, nil); e != nil {
		t.Fatal(e)
	}
	g := &files{data: map[string]pan115.File{"10": {ID: "10", ParentID: "0", Directory: true}, "20": {ID: "20", ParentID: "0", Directory: true}, "1": {ID: "1", ParentID: "10", Name: "Movie.mkv", Size: 100, SHA1: "abc"}}}
	s := &organize.Service{Store: db, Factory: func(context.Context, string) (pan115.Gateway, error) { return g, nil }}
	r, e := db.SaveOrganizeRule(organize.Rule{Name: "test", AccountID: "123", SourceID: "10", MovieTargetID: "20", DailyAt: "03:00", TypeHint: "auto", AllowExisting: true, Binding: &download.MediaContext{Type: "movie", Title: "Movie", Year: 2024}})
	if e != nil {
		t.Fatal(e)
	}
	return db, g, s, r
}
func TestLostResponsesResumeWithoutRepeatingMutation(t *testing.T) {
	db, g, s, r := setup(t)
	p, e := s.Preview(context.Background(), r.ID)
	if e != nil || g.renames != 0 || g.moves != 0 {
		t.Fatalf("preview mutated %v", e)
	}
	if _, e = s.Start(p.ID); e != nil {
		t.Fatal(e)
	}
	g.loseRename = true
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	p, e = db.OrganizePlan(p.ID)
	if e != nil || p.State != "paused" || g.renames != 1 || g.moves != 0 {
		t.Fatalf("%+v %v", p, e)
	}
	if _, e = s.Start(p.ID); e != nil {
		t.Fatal(e)
	}
	g.loseMove = true
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	p, _ = db.OrganizePlan(p.ID)
	if p.State != "paused" || g.renames != 1 || g.moves != 1 {
		t.Fatalf("%+v", p)
	}
	restarted := &organize.Service{Store: db, Factory: s.Factory}
	if _, e = restarted.Start(p.ID); e != nil {
		t.Fatal(e)
	}
	if e = restarted.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	p, _ = db.OrganizePlan(p.ID)
	if p.State != "completed" || g.renames != 1 || g.moves != 1 {
		t.Fatalf("%+v renames=%d moves=%d", p, g.renames, g.moves)
	}
}
func TestRuleChangeInvalidatesAndCAS(t *testing.T) {
	db, _, s, r := setup(t)
	p, e := s.Preview(context.Background(), r.ID)
	if e != nil {
		t.Fatal(e)
	}
	original := p
	p.Error = "first"
	if e = db.SaveOrganizePlan(p); e != nil {
		t.Fatal(e)
	}
	if e = db.SaveOrganizePlan(original); e != organize.ErrConflict {
		t.Fatalf("CAS %v", e)
	}
	r.Name = "changed"
	if _, e = db.SaveOrganizeRule(r); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Start(p.ID); e != organize.ErrConflict {
		t.Fatalf("stale plan %v", e)
	}
}
func TestTargetConflictPreservesSourceAndActiveTaskBlocks(t *testing.T) {
	db, g, s, r := setup(t)
	p, e := s.Preview(context.Background(), r.ID)
	if e != nil {
		t.Fatal(e)
	}
	g.data["30"] = pan115.File{ID: "30", ParentID: "20", Name: "Movie (2024)", Directory: true}
	g.data["31"] = pan115.File{ID: "31", ParentID: "30", Name: "Movie (2024).mkv", Size: 50}
	if _, e = s.Start(p.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if g.renames != 0 || g.moves != 0 {
		t.Fatal("conflict changed source")
	}
	delete(g.data, "31")
	p, e = s.Preview(context.Background(), r.ID)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Start(p.ID); e != nil {
		t.Fatal(e)
	}
	_, _, e = db.CreateDownload("123", "abc", download.Request{Kind: "offline", DirectoryID: "10", Reference: download.Reference{Source: "manual"}})
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if g.renames != 0 || g.moves != 0 {
		t.Fatal("unfinished download moved")
	}
}
func TestFileBindingSnapshotAndOncePerDay(t *testing.T) {
	db, g, s, r := setup(t)
	f := g.data["1"]
	b := organize.Binding{Media: download.MediaContext{Type: "movie", Title: "Bound"}, Ready: true}
	if e := db.BindOrganizeFile("123", f, b); e != nil {
		t.Fatal(e)
	}
	found, e := db.OrganizeLookup("123")(context.Background(), f)
	if e != nil || found.Media.Title != "Bound" || found.Size != 100 || !found.Ready {
		t.Fatalf("%+v %v", found, e)
	}
	r, e = db.OrganizeRule(r.ID)
	if e != nil {
		t.Fatal(e)
	}
	r.Enabled = true
	r.DailyAt = "00:00"
	if _, e = db.SaveOrganizeRule(r); e != nil {
		t.Fatal(e)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = s.Tick(context.Background()); e != nil {
		t.Fatal(e)
	}
	plans, e := db.OrganizePlans(false)
	if e != nil || len(plans) != 1 || plans[0].Mode != "scheduled" {
		t.Fatalf("%+v %v", plans, e)
	}
}

func TestBindingChangeInvalidatesPlanAndCancelledRemoteStillBlocks(t *testing.T) {
	db, g, s, r := setup(t)
	p, e := s.Preview(context.Background(), r.ID)
	if e != nil {
		t.Fatal(e)
	}
	if e = db.BindOrganizeFile("123", g.data["1"], organize.Binding{Media: download.MediaContext{Type: "movie", Title: "Changed"}, Ready: true}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Start(p.ID); e != organize.ErrConflict {
		t.Fatalf("stale binding plan accepted: %v", e)
	}
	task, _, e := db.CreateDownload("123", "fixture", download.Request{Kind: "offline", DirectoryID: "10", Reference: download.Reference{Source: "manual"}})
	if e != nil {
		t.Fatal(e)
	}
	task.State = "cancelled"
	task.SubmissionStartedAt = "2026-10-14T01:00:00Z"
	if e = db.SaveDownload(task); e != nil {
		t.Fatal(e)
	}
	active, e := db.OrganizeUnfinished("123")
	if e != nil || len(active) != 1 {
		t.Fatalf("cancelled remote omitted %+v %v", active, e)
	}
	p, e = s.Preview(context.Background(), r.ID)
	if e != nil || len(p.Actions) != 0 || len(p.Issues) != 1 {
		t.Fatalf("%+v %v", p, e)
	}
}
