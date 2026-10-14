package pansoubridge

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"pansou/config"
	"pansou/plugin"
	"pansou/service"
	"pansou/util"
	"pansou/util/cache"
)

const (
	maxSearches      = 2
	maxAsyncSearches = 8
	asyncLifetime    = 30 * time.Second
)

type Bootstrap struct {
	adapter     searchAdapter
	settings    SettingsStore
	cacheDir    string
	checker     linkChecker
	checkGate   chan struct{}
	channels    []string
	plugins     []string
	cache       *cache.DelayedBatchWriteManager
	mainCache   *cache.EnhancedTwoLevelCache
	gate        chan struct{}
	mu          sync.Mutex
	closed      bool
	async       map[string]*searchLifetime
	flights     map[string]*searchFlight
	doneRefresh map[string]time.Time
	active      sync.WaitGroup
	shutdown    sync.Once
	shutdownErr error
}

// New mirrors PanSou main.go initialization without starting its HTTP server.
func New(dataDir string) (*Bootstrap, error) {
	if err := initializeProxyEnvironment(); err != nil {
		return nil, fmt.Errorf("initialize proxy environment: %w", err)
	}
	plugins, configured := os.LookupEnv("MEDIA_CENTER_PANSOU_PLUGINS")
	if !configured {
		plugins, configured = os.LookupEnv("ENABLED_PLUGINS")
	}
	if !configured {
		plugins = recommendedPlugins
	}
	plugins = strings.TrimSpace(plugins)
	_ = os.Setenv("ENABLED_PLUGINS", plugins)
	// An all-plugins cache key is normalized to nil by PanSou. Isolate it across
	// upstream revisions and enabled-plugin changes so an update cannot reuse an
	// older instance's incomplete or differently scoped all-source cache.
	enabledNames := strings.Split(plugins, ",")
	sort.Strings(enabledNames)
	namespace := fmt.Sprintf("%x", sha256.Sum256([]byte(embeddedPanSouCommit+":"+strings.Join(enabledNames, ","))))
	cacheDir := filepath.Join(dataDir, "pansou-cache", namespace[:16])
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return nil, fmt.Errorf("create PanSou cache directory: %w", err)
	}
	setDefault("CACHE_ENABLED", "true")
	_ = os.Setenv("CACHE_PATH", cacheDir)
	setDefault("ASYNC_PLUGIN_ENABLED", "true")
	setDefault("CHANNELS", recommendedChannels)

	config.Init()
	// Bound cache storage; let PanSou size search scheduling from its configuration.
	config.AppConfig.CacheEnabled = true
	config.AppConfig.CachePath = cacheDir
	config.AppConfig.CacheMaxSizeMB = min(256, max(32, config.AppConfig.CacheMaxSizeMB))
	config.AppConfig.CacheTTLMinutes = min(24*60, max(1, config.AppConfig.CacheTTLMinutes))
	config.AppConfig.AsyncCacheTTLHours = min(24, max(1, config.AppConfig.AsyncCacheTTLHours))

	util.InitHTTPClient()
	writer, err := cache.NewDelayedBatchWriteManager()
	if err != nil {
		return nil, fmt.Errorf("create PanSou cache writer: %w", err)
	}
	if err := writer.Initialize(); err != nil {
		return nil, fmt.Errorf("initialize PanSou cache writer: %w", err)
	}
	service.SetGlobalCacheWriteManager(writer)
	plugin.InitAsyncPluginSystem()
	service.StartTGReachabilityProbe()
	manager := plugin.NewPluginManager()
	if config.AppConfig.AsyncPluginEnabled {
		manager.RegisterGlobalPluginsWithFilter(config.AppConfig.EnabledPlugins)
	}
	config.UpdateDefaultConcurrency(len(manager.GetPlugins()))
	search := service.NewSearchService(manager) // cache initialization and updater installation are synchronous here
	names := make([]string, 0, len(manager.GetPlugins()))
	for _, p := range manager.GetPlugins() {
		names = append(names, p.Name())
	}
	return &Bootstrap{cacheDir: cacheDir, checker: service.NewCheckServiceWithCachePath(filepath.Join(cacheDir, "link-checks.db")), checkGate: make(chan struct{}, 2), channels: append([]string{}, config.AppConfig.DefaultChannels...), plugins: names, adapter: searchAdapter{service: search}, cache: writer, mainCache: service.GetEnhancedTwoLevelCache(), gate: make(chan struct{}, maxSearches), async: make(map[string]*searchLifetime), flights: make(map[string]*searchFlight), doneRefresh: make(map[string]time.Time)}, nil
}

func setDefault(key, value string) {
	if strings.TrimSpace(os.Getenv(key)) == "" {
		_ = os.Setenv(key, value)
	}
}

var (
	ErrSearchBusy     = errors.New("too many pending resource searches")
	ErrRefreshLimited = errors.New("refresh rate limited; retry later")
	ErrShuttingDown   = errors.New("resource search is shutting down")
)

type searchLifetime struct {
	ctx    context.Context
	cancel context.CancelFunc
}
type searchFlight struct {
	done   chan struct{}
	result interface{}
	err    error
}

func searchScope(keyword string, clouds, plugins, channels []string) string {
	sorted := func(values []string) []string { out := append([]string{}, values...); sort.Strings(out); return out }
	data, _ := json.Marshal([]any{strings.ToLower(strings.TrimSpace(keyword)), sorted(clouds), sorted(plugins), sorted(channels)})
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

func (b *Bootstrap) Search(parent context.Context, keyword, source string, cloudTypes, plugins, channels []string, mode string, refresh bool) (interface{}, error) {
	if parent == nil {
		parent = context.Background()
	}
	if err := parent.Err(); err != nil {
		return nil, err
	}
	if source != "all" && source != "tg" && source != "plugin" {
		return nil, errors.New("unsupported source")
	}
	scope := searchScope(keyword, cloudTypes, plugins, channels)
	key := scope + ":" + source + ":" + mode
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, ErrShuttingDown
	}
	if b.flights == nil {
		b.flights = map[string]*searchFlight{}
	}
	if flight := b.flights[key]; !refresh && flight != nil {
		b.mu.Unlock()
		select {
		case <-parent.Done():
			return nil, parent.Err()
		case <-flight.done:
			return flight.result, flight.err
		}
	}
	if b.async == nil {
		b.async = map[string]*searchLifetime{}
	}
	// Polls and TG/plugin phases share one bounded lifetime for the same search scope.
	// Cache reads must not consume a new 30-second slot on every round.
	life := b.async[scope]
	if life != nil && life.ctx.Err() != nil {
		delete(b.async, scope)
		life = nil
	}
	if life == nil {
		if len(b.async) >= maxAsyncSearches {
			b.mu.Unlock()
			return nil, ErrSearchBusy
		}
		ctx, cancel := context.WithTimeout(context.Background(), asyncLifetime)
		life = &searchLifetime{ctx: ctx, cancel: cancel}
		b.async[scope] = life
		current := life
		go func() {
			<-ctx.Done()
			b.mu.Lock()
			if b.async[scope] == current {
				delete(b.async, scope)
			}
			b.mu.Unlock()
		}()
	}
	if refresh {
		if b.doneRefresh == nil {
			b.doneRefresh = map[string]time.Time{}
		}
		if at, ok := b.doneRefresh[key]; ok && time.Since(at) < 10*time.Second {
			b.mu.Unlock()
			return nil, ErrRefreshLimited
		}
		if len(b.doneRefresh) >= 256 {
			var oldestKey string
			var oldest time.Time
			for k, at := range b.doneRefresh {
				if oldest.IsZero() || at.Before(oldest) {
					oldestKey, oldest = k, at
				}
			}
			delete(b.doneRefresh, oldestKey)
		}
		b.doneRefresh[key] = time.Now()
	}
	flight := &searchFlight{done: make(chan struct{})}
	b.flights[key] = flight
	b.active.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.active.Done()
		select {
		case b.gate <- struct{}{}:
			flight.result, flight.err = b.adapter.Search(life.ctx, keyword, source, cloudTypes, plugins, channels, mode, refresh)
			<-b.gate
		case <-life.ctx.Done():
			flight.err = life.ctx.Err()
		}
		b.mu.Lock()
		if b.flights[key] == flight {
			delete(b.flights, key)
		}
		close(flight.done)
		b.mu.Unlock()
	}()
	// Cancelling a browser request stops waiting immediately, while PanSou can
	// finish its bounded background work and populate caches for the next round.
	select {
	case <-parent.Done():
		return nil, parent.Err()
	case <-flight.done:
		return flight.result, flight.err
	}
}
func (b *Bootstrap) Shutdown(ctx context.Context) error {
	b.shutdown.Do(func() {
		b.mu.Lock()
		b.closed = true
		for _, life := range b.async {
			life.cancel()
		}
		b.mu.Unlock()
		done := make(chan struct{})
		go func() { b.active.Wait(); close(done) }()
		select {
		case <-done:
		case <-ctx.Done():
			b.shutdownErr = ctx.Err()
			return
		}
		if closer, ok := b.checker.(interface{ Close() error }); ok {
			if err := closer.Close(); err != nil {
				b.shutdownErr = err
			}
		}
		if err := plugin.WaitForAsyncTasks(ctx); err != nil {
			b.shutdownErr = err
			return // Active upstream tasks still own these caches; do not close them underneath writes.
		}
		if err := b.cache.Shutdown(5 * time.Second); err != nil {
			b.shutdownErr = err
		}
		cache.StopGlobalCleanupTask()
		if b.mainCache != nil {
			if err := b.mainCache.FlushMemoryToDisk(); err != nil && b.shutdownErr == nil {
				b.shutdownErr = err
			}
		}
	})
	return b.shutdownErr
}
