package organize

import (
	"context"
	"media-center/internal/download"
	"media-center/internal/pan115"
	"testing"
	"time"
)

type fakeFiles struct {
	files map[string]pan115.File
	lists map[string][]pan115.File
}

func (f fakeFiles) CheckAccount() error { return nil }
func (f fakeFiles) OfflineTasks() ([]pan115.RemoteTask, error) {
	panic("preview must not inspect offline tasks")
}
func (f fakeFiles) Submit(string, string) (string, error) { panic("preview must not submit") }
func (f fakeFiles) GetFile(id string) (pan115.File, error) {
	if v, ok := f.files[id]; ok {
		return v, nil
	}
	return pan115.File{}, &pan115.Error{Code: "not_found", Message: "missing", Certain: true}
}
func (f fakeFiles) ListFiles(id string) ([]pan115.File, error) { return f.lists[id], nil }
func fixture() (fakeFiles, Rule) {
	return fakeFiles{files: map[string]pan115.File{"10": {ID: "10", ParentID: "0", Directory: true}, "20": {ID: "20", ParentID: "0", Directory: true}}, lists: map[string][]pan115.File{}}, Rule{Name: "test", SourceID: "10", TVTargetID: "20", DailyAt: "03:00", TypeHint: "anime", Binding: &download.MediaContext{Type: "anime", Title: "测试番剧", Season: 1}, AllowExisting: true}
}
func TestPreviewSubtitlesAndConflict(t *testing.T) {
	g, r := fixture()
	g.lists["10"] = []pan115.File{{ID: "1", ParentID: "10", Name: "Show - 02 [1080p].mkv", Size: 100}, {ID: "2", ParentID: "10", Name: "Show - 02 [1080p].zh-Hans.ass", Size: 10}}
	p, e := Preview(context.Background(), g, r, nil)
	if e != nil || len(p.Actions) != 2 || len(p.Issues) != 0 {
		t.Fatalf("%+v %v", p, e)
	}
	if p.Actions[1].TargetName != "测试番剧 - S01E02.zh-Hans.ass" {
		t.Fatal(p.Actions[1])
	}
	g.lists["10"] = append(g.lists["10"], pan115.File{ID: "3", ParentID: "10", Name: "Other - 02.mkv", Size: 100})
	p, e = Preview(context.Background(), g, r, nil)
	if e != nil || p.Actions[0].State != "conflict" || p.Actions[1].State != "conflict" {
		t.Fatalf("%+v %v", p, e)
	}
}
func TestPreviewRequiresCompletionAndExcludesTarget(t *testing.T) {
	g, r := fixture()
	r.AllowExisting = false
	r.Recursive = true
	g.lists["10"] = []pan115.File{{ID: "20", ParentID: "10", Name: "library", Directory: true}, {ID: "1", ParentID: "10", Name: "Show S01E02.mkv", Size: 100}}
	g.lists["20"] = []pan115.File{{ID: "2", ParentID: "20", Name: "Already S01E03.mkv", Size: 100}}
	p, e := Preview(context.Background(), g, r, nil)
	if e != nil || len(p.Actions) != 0 || len(p.Issues) != 1 || p.Issues[0].Code != "not_ready" {
		t.Fatalf("%+v %v", p, e)
	}
	p, e = Preview(context.Background(), g, r, func(context.Context, pan115.File) (Binding, error) { return Binding{Ready: true, Size: 101}, nil })
	if e != nil || p.Issues[0].Code != "changed" {
		t.Fatalf("%+v %v", p, e)
	}
}
func TestNamingAndEpisodeSafety(t *testing.T) {
	r := Rule{KeepQuality: true}
	m := download.MediaContext{Type: "movie", Title: "A/B", Year: 2024, Provider: "tmdb", ProviderID: "123"}
	dirs, name, e := naming(r, m, "x.1080p.mkv")
	if e != nil || dirs[0] != "A_B (2024) [tmdbid=123]" || name != "A_B (2024) [tmdbid=123] - 1080P.mkv" {
		t.Fatalf("%v %s %v", dirs, name, e)
	}
	m = download.MediaContext{Type: "tv", Title: "Show"}
	for _, name := range []string{"Show S01E01E02.mkv", "Show - 12.5.mkv", "Show - 01-02.mkv", "Show.mkv"} {
		if _, e = mediaForFile(m, name); e == nil {
			t.Fatalf("accepted ambiguous %s", name)
		}
	}
	m, e = mediaForFile(m, "Show - 03.mkv")
	if e != nil || m.Season != 1 || m.Episodes[0] != 3 {
		t.Fatalf("%+v %v", m, e)
	}
}

func TestSimpleRuleUsesOneTargetAndCategoryFolders(t *testing.T) {
	r := Rule{Name: "媒体整理", Simple: true, SourceID: "10", TargetID: "20", DailyAt: "03:00", Recursive: true, TypeHint: "auto"}
	if e := ValidateRule(r); e != nil {
		t.Fatal(e)
	}
	m := download.MediaContext{Type: "anime", Title: "Show", Season: 1, Episodes: []int{2}}
	dirs, name, e := naming(r, m, "test.mkv")
	if e != nil || len(dirs) != 3 || dirs[0] != "动漫" || dirs[2] != "Season 01" || name != "Show - S01E02.mkv" || r.Target("anime") != "20" {
		t.Fatalf("%+v %s %v", dirs, name, e)
	}
	r.TargetID = "10"
	if e = ValidateRule(r); e == nil {
		t.Fatal("same roots accepted")
	}
}
func TestBatchArtifactDoesNotReuseOneEpisode(t *testing.T) {
	task := download.Task{State: "completed", References: []download.Reference{{Media: download.MediaContext{Type: "anime", Title: "Show", Episodes: []int{2}}}}, Artifacts: []pan115.File{{ID: "1", Name: "Show - 01.mkv", Size: 10}, {ID: "2", Name: "Show - 02.mkv", Size: 20}}}
	b, e := MetadataForArtifact(task, task.Artifacts[0])
	if e != nil || !b.Ready || len(b.Media.Episodes) != 0 {
		t.Fatalf("%+v %v", b, e)
	}
	task.State = "downloading"
	if _, e = MetadataForArtifact(task, task.Artifacts[0]); e == nil {
		t.Fatal("accepted unfinished")
	}
}
func TestDueBeijingAndDisabled(t *testing.T) {
	r := Rule{Enabled: true, DailyAt: "03:00"}
	if Due(r, time.Date(2026, 10, 14, 18, 59, 0, 0, time.UTC)) || !Due(r, time.Date(2026, 10, 14, 19, 0, 0, 0, time.UTC)) {
		t.Fatal("Beijing schedule")
	}
	r.Enabled = false
	if Due(r, time.Now()) {
		t.Fatal("disabled rule ran")
	}
}
