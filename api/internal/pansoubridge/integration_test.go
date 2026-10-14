package pansoubridge

import (
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"pansou/config"
	"pansou/model"
	"pansou/util"
	"pansou/util/cache"
)

func TestAdapterPreservesLinksAndExtractionCodes(t *testing.T) {
	got := mapSearchResponse(model.SearchResponse{Total: 1, Results: []model.SearchResult{{Title: "样例", Links: []model.Link{{Type: "quark", URL: "https://pan.example/x", Password: "a1b2"}}}}})
	if got.Total != 1 || len(got.Items) != 1 || len(got.Items[0].Links) != 1 || got.Items[0].Links[0].Password != "a1b2" {
		t.Fatalf("adapter dropped a link or extraction code: %+v", got)
	}
}

func TestLiveInProcessSearchPOC(t *testing.T) {
	if os.Getenv("PANSOU_INTEGRATION") != "1" {
		t.Skip("set PANSOU_INTEGRATION=1 to call live upstreams")
	}
	dataDir := t.TempDir()
	var before, initialized, after runtime.MemStats
	runtime.ReadMemStats(&before)
	b, err := New(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&initialized)
	pluginResult, err := b.Search(context.Background(), "流浪地球2", "plugin", nil, nil, nil, "merge", false)
	if err != nil {
		t.Fatalf("plugin search: %v", err)
	}
	first := pluginResult.(searchData)
	t.Logf("plugin immediate response: total=%d rows=%d links=%d codes=%d heapAlloc=%dMiB", first.Total, len(first.Items), countLinks(first), countPasswords(first), initialized.HeapAlloc>>20)
	time.Sleep(6 * time.Second)
	pluginCached, err := b.Search(context.Background(), "流浪地球2", "plugin", nil, nil, nil, "merge", false)
	if err != nil {
		t.Fatalf("plugin repeat search: %v", err)
	}
	cached := pluginCached.(searchData)
	t.Logf("plugin response after async backfill/cache: total=%d rows=%d links=%d codes=%d", cached.Total, len(cached.Items), countLinks(cached), countPasswords(cached))
	tgResult, err := b.Search(context.Background(), "流浪地球2", "tg", nil, nil, nil, "merge", false)
	if err != nil {
		t.Fatalf("TG search: %v", err)
	}
	tg := tgResult.(searchData)
	t.Logf("TG search: total=%d rows=%d links=%d", tg.Total, len(tg.Items), countLinks(tg))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := b.Shutdown(ctx); err != nil {
		cancel()
		t.Fatalf("shutdown/flush: %v", err)
	}
	cancel()
	cmd := exec.Command(os.Args[0], "-test.run=^TestPanSouCacheRestoreChild$")
	cmd.Env = append(os.Environ(), "PANSOU_CACHE_RESTORE_DIR="+b.cacheDir, "PANSOU_CACHE_RESTORE_KEY="+cache.GeneratePluginCacheKey("流浪地球2", nil, util.ExtDigest(map[string]interface{}{"referer": "https://dm.xueximeng.com"})))
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("cache restore subprocess: %v\n%s", err, out)
	} else {
		t.Logf("cache restore subprocess: %s", out)
	}
	files := 0
	err = filepath.WalkDir(filepath.Join(dataDir, "pansou-cache"), func(_ string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !d.IsDir() {
			files++
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	runtime.ReadMemStats(&after)
	t.Logf("disk cache files=%d; Go heap before=%dMiB initialized=%dMiB afterGC=%dMiB", files, before.HeapAlloc>>20, initialized.HeapAlloc>>20, after.HeapAlloc>>20)
}

func TestPanSouCacheRestoreChild(t *testing.T) {
	dir, key := os.Getenv("PANSOU_CACHE_RESTORE_DIR"), os.Getenv("PANSOU_CACHE_RESTORE_KEY")
	if dir == "" || key == "" {
		t.Skip("subprocess helper")
	}
	_ = os.Setenv("CACHE_ENABLED", "true")
	_ = os.Setenv("CACHE_PATH", dir)
	config.Init()
	c, err := cache.NewEnhancedTwoLevelCache()
	if err != nil {
		t.Fatal(err)
	}
	data, ok, err := c.Get(key)
	if err != nil || !ok || len(data) == 0 {
		t.Fatalf("cache entry not restored: hit=%t bytes=%d err=%v", ok, len(data), err)
	}
	t.Logf("restored %d bytes", len(data))
}

func countLinks(r searchData) int {
	n := 0
	for _, item := range r.Items {
		n += len(item.Links)
	}
	if n > 0 {
		return n
	} // the grouped representation contains the same links in another view
	for _, group := range r.LinksByCloud {
		n += len(group)
	}
	return n
}
func countPasswords(r searchData) int {
	n := 0
	for _, item := range r.Items {
		for _, link := range item.Links {
			if link.Password != "" {
				n++
			}
		}
	}
	if n > 0 {
		return n
	}
	for _, group := range r.LinksByCloud {
		for _, link := range group {
			if link.Password != "" {
				n++
			}
		}
	}
	return n
}
