package pansoubridge

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"media-center/internal/store"
	"net/http/httptest"
	"pansou/model"
	"sync/atomic"
	"testing"
	"time"
)

func testConfiguredBridge(t *testing.T) (*Bootstrap, *store.Store, *captureSearch) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fake := &captureSearch{}
	b := &Bootstrap{adapter: searchAdapter{service: fake}, channels: []string{"default_channel"}, plugins: []string{"diduan", "huban"}, gate: make(chan struct{}, 2)}
	if err := b.InitializeSettings(db); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		b.mu.Lock()
		for _, life := range b.async {
			life.cancel()
		}
		b.mu.Unlock()
		b.active.Wait()
	})
	return b, db, fake
}

func TestStartupSeedsOnlyMissingSettings(t *testing.T) {
	b, db, _ := testConfiguredBridge(t)
	selected, err := b.ReadSearchSettings()
	if err != nil || len(selected.Channels) != 1 || len(selected.Plugins) != 2 || selected.DetectionEnabled {
		t.Fatalf("startup defaults: %+v %v", selected, err)
	}
	if err := db.SaveSettings("pansou", map[string]json.RawMessage{"pansou.channels": json.RawMessage(`[]`), "pansou.plugins": json.RawMessage(`[]`), "pansou.cloudTypes": json.RawMessage(`["quark"]`), "pansou.detectionEnabled": json.RawMessage(`false`)}, nil); err != nil {
		t.Fatal(err)
	}
	if err := b.InitializeSettings(db); err != nil {
		t.Fatal(err)
	}
	selected, err = b.ReadSearchSettings()
	if err != nil || len(selected.Channels) != 0 || len(selected.Plugins) != 0 || len(selected.CloudTypes) != 1 || selected.CloudTypes[0] != "quark" {
		t.Fatalf("restart overwrote saved choices: %+v %v", selected, err)
	}
}

func TestHandlerUsesSavedSelectionsAndAllowsDisabledSources(t *testing.T) {
	gin.SetMode(gin.TestMode)
	b, db, fake := testConfiguredBridge(t)
	save := func(values map[string]json.RawMessage) {
		t.Helper()
		if err := db.SaveSettings("pansou", values, nil); err != nil {
			t.Fatal(err)
		}
	}
	save(map[string]json.RawMessage{"pansou.channels": json.RawMessage(`[]`), "pansou.plugins": json.RawMessage(`["huban"]`), "pansou.cloudTypes": json.RawMessage(`["quark"]`)})
	router := gin.New()
	router.POST("/search", b.Handler())
	call := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/search", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := call(`{"query":"movie"}`); w.Code != 200 {
		t.Fatalf("saved search: %d %s", w.Code, w.Body.String())
	}
	if fake.args[5] != "plugin" || fake.args[6].([]string)[0] != "huban" || fake.args[7].([]string)[0] != "quark" {
		t.Fatalf("saved settings ignored: %v", fake.args)
	}
	fake.args = nil
	save(map[string]json.RawMessage{"pansou.plugins": json.RawMessage(`[]`)})
	if w := call(`{"query":"disabled"}`); w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"total":0`)) {
		t.Fatalf("disabled search: %s", w.Body.String())
	}
	if fake.args != nil {
		t.Fatal("disabled sources still searched")
	}
	if w := call(`{"query":"invalid","plugins":["not_registered"],"source":"plugin"}`); w.Code != 400 {
		t.Fatalf("unavailable plugin accepted: %d", w.Code)
	}
}

func TestSettingsValidationAndMetadata(t *testing.T) {
	for _, value := range []string{`null`, `"quark"`, `["wrong type"]`, `["unknown"]`} {
		if ValidateSettings(map[string]json.RawMessage{"pansou.cloudTypes": json.RawMessage(value)}) == nil {
			t.Fatalf("accepted %s", value)
		}
	}
	b, _, _ := testConfiguredBridge(t)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/meta", b.MetaHandler())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/meta", nil))
	var response struct {
		Data struct {
			Plugins   []struct{ Name string }
			Selection SearchSettings
			Defaults  SearchSettings
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data.Plugins) != 2 || len(response.Data.Selection.Channels) != 1 {
		t.Fatalf("metadata does not match initialized manager: %s", w.Body.String())
	}
}

type blockingSearch struct {
	started chan struct{}
	release chan struct{}
	calls   atomic.Int32
}

func (f *blockingSearch) Search(string, []string, int, bool, string, string, []string, []string, map[string]interface{}) (model.SearchResponse, error) {
	if f.calls.Add(1) == 1 {
		close(f.started)
	}
	<-f.release
	return model.SearchResponse{}, nil
}

func TestCancelledCallerDoesNotBlockAndDuplicateSearchCoalesces(t *testing.T) {
	f := &blockingSearch{started: make(chan struct{}), release: make(chan struct{})}
	b := &Bootstrap{adapter: searchAdapter{service: f}, gate: make(chan struct{}, 2)}
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, err := b.Search(ctx, "movie", "plugin", nil, nil, nil, "merge", false); first <- err }()
	<-f.started
	cancel()
	select {
	case err := <-first:
		if err != context.Canceled {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled caller kept waiting")
	}
	go func() { time.Sleep(20 * time.Millisecond); close(f.release) }()
	if _, err := b.Search(context.Background(), "movie", "plugin", nil, nil, nil, "merge", false); err != nil {
		t.Fatal(err)
	}
	if got := f.calls.Load(); got != 1 {
		t.Fatalf("duplicate in-flight search executed %d times", got)
	}
	// Whether the original flight finishes before the second caller joins, all
	// polling rounds must share one lifetime and must never consume 8 slots.
	for i := 0; i < 20; i++ {
		if _, err := b.Search(context.Background(), "movie", "plugin", nil, nil, nil, "merge", false); err != nil {
			t.Fatalf("poll %d rejected: %v", i, err)
		}
	}
	b.mu.Lock()
	if len(b.async) != 1 {
		t.Errorf("polls consumed %d lifetimes", len(b.async))
	}
	for _, life := range b.async {
		life.cancel()
	}
	b.mu.Unlock()
	b.active.Wait()
}

func TestAdapterOmitsUnknownDates(t *testing.T) {
	data := mapSearchResponse(model.SearchResponse{MergedByType: model.MergedLinks{"quark": []model.MergedLink{{URL: "https://pan.quark.cn/s/a"}}}})
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("0001-")) {
		t.Fatalf("zero date leaked: %s", raw)
	}
}

type fakeChecker struct{ calls atomic.Int32 }

func (f *fakeChecker) Check(items []model.CheckItem) model.CheckResponse {
	f.calls.Add(1)
	return model.CheckResponse{Results: []model.CheckResult{{DiskType: items[0].DiskType, URL: items[0].URL, State: "ok"}}}
}

func TestCheckHandlerRestrictsTargetsAndReturnsUpstreamStates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fake := &fakeChecker{}
	b := &Bootstrap{checker: fake, checkGate: make(chan struct{}, 2)}
	r := gin.New()
	r.POST("/check", b.CheckHandler())
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"items":[{"disk_type":"baidu","url":"http://127.0.0.1/admin"}]}`, 400},
		{`{"items":[{"disk_type":"baidu","url":"https://pan.baidu.com.evil.example/s/a"}]}`, 400},
		{`{"items":[{"disk_type":"baidu","url":"https://pan.baidu.com/s/a"}]}`, 200},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/check", bytes.NewBufferString(tc.body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatalf("check status %d: %s", w.Code, w.Body.String())
		}
	}
	if fake.calls.Load() != 1 {
		t.Fatalf("unvalidated targets reached checker: %d", fake.calls.Load())
	}
	b.active.Wait()
}

func TestStartupMigratesUnversionedPlaceholderSelections(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.SaveSettings("pansou", map[string]json.RawMessage{"pansou.channels": json.RawMessage(`[]`), "pansou.plugins": json.RawMessage(`[]`)}, nil); err != nil {
		t.Fatal(err)
	}
	b := &Bootstrap{channels: []string{"default_channel"}, plugins: []string{"diduan"}}
	if err := b.InitializeSettings(db); err != nil {
		t.Fatal(err)
	}
	selected, err := b.ReadSearchSettings()
	if err != nil || len(selected.Channels) != 1 || len(selected.Plugins) != 1 {
		t.Fatalf("legacy placeholders not initialized: %+v %v", selected, err)
	}
}

func TestWindowsProxyAddressParsing(t *testing.T) {
	for _, tc := range []struct{ raw, http, https string }{
		{"127.0.0.1:7897", "http://127.0.0.1:7897", "http://127.0.0.1:7897"},
		{"http=localhost:8080;https=localhost:8081", "http://localhost:8080", "http://localhost:8081"},
		{"https=http://localhost:8081", "http://localhost:8081", "http://localhost:8081"},
	} {
		first, second := windowsProxyAddresses(tc.raw)
		if first != tc.http || second != tc.https {
			t.Fatalf("proxy %q: %q %q", tc.raw, first, second)
		}
	}
}
