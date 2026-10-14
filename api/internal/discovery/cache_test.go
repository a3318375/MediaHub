package discovery

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCacheLifecycle(t *testing.T) {
	c := NewCache()
	now := time.Now()
	c.Now = func() time.Time { return now }
	calls := 0
	fetch := func(context.Context) ([]byte, bool, error) { calls++; return []byte(`{"items":[1]}`), false, nil }
	load := func(key string) []byte {
		b, e := c.Load(context.Background(), "test", key, time.Minute, fetch)
		if e != nil {
			t.Fatal(e)
		}
		return b
	}
	b := load("a")
	b[0] = 'x'
	if !json.Valid(load("a")) || calls != 1 {
		t.Fatal("hit/defensive copy")
	}
	now = now.Add(time.Minute)
	load("a")
	if calls != 2 {
		t.Fatal("expiry")
	}
	c.Capacity = 2
	load("b")
	load("a")
	load("c")
	load("b")
	if calls != 5 {
		t.Fatal("LRU", calls)
	}
	c.Invalidate("test")
	load("a")
	if calls != 6 {
		t.Fatal("invalidation")
	}
}
func TestCacheNegativeAndErrors(t *testing.T) {
	for _, tt := range []struct {
		name     string
		negative bool
		err      error
		cached   bool
	}{{"empty", true, nil, true}, {"404", false, Problem(404, "不存在"), true}, {"network", false, Problem(502, "连接失败"), false}, {"rate", false, Problem(503, "限流"), false}, {"cancel", false, context.Canceled, false}} {
		t.Run(tt.name, func(t *testing.T) {
			c := NewCache()
			now := time.Now()
			c.Now = func() time.Time { return now }
			n := 0
			f := func(context.Context) ([]byte, bool, error) { n++; return []byte(`[]`), tt.negative, tt.err }
			for i := 0; i < 2; i++ {
				_, e := c.Load(context.Background(), "s", "k", time.Hour, f)
				var got, want *Error
				matching := errors.Is(e, tt.err)
				if errors.As(e, &got) && errors.As(tt.err, &want) {
					matching = got.Status == want.Status
				}
				if !matching {
					t.Fatal(e)
				}
			}
			want := 2
			if tt.cached {
				want = 1
			}
			if n != want {
				t.Fatal(n, want)
			}
			now = now.Add(301 * time.Second)
			c.Load(context.Background(), "s", "k", time.Hour, f)
			if n != want+1 {
				t.Fatal("negative expiry")
			}
		})
	}
}
func TestCacheSingleflightAndCancellation(t *testing.T) {
	c := NewCache()
	started := make(chan struct{})
	release := make(chan struct{})
	var n atomic.Int32
	fetch := func(ctx context.Context) ([]byte, bool, error) {
		if n.Add(1) == 1 {
			close(started)
		}
		select {
		case <-release:
			return []byte(`[]`), false, nil
		case <-ctx.Done():
			return nil, false, ctx.Err()
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	first := make(chan error, 1)
	go func() { _, e := c.Load(ctx, "s", "k", time.Minute, fetch); first <- e }()
	<-started
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, e := c.Load(context.Background(), "s", "k", time.Minute, fetch)
			if e != nil || string(b) != "[]" {
				t.Error(e)
			}
		}()
	}
	cancel()
	if e := <-first; !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	close(release)
	wg.Wait()
	if n.Load() != 1 {
		t.Fatal("upstream calls", n.Load())
	}
}
func TestCachePartitionBytesTimeout(t *testing.T) {
	c := NewCache()
	c.MaxBytes = 3
	c.Timeout = 10 * time.Millisecond
	var n int
	f := func(context.Context) ([]byte, bool, error) { n++; return []byte("1234"), false, nil }
	for i := 0; i < 2; i++ {
		c.Load(context.Background(), "s", "a", time.Hour, f)
	}
	if n != 2 {
		t.Fatal("oversize cached")
	}
	_, e := c.Load(context.Background(), "s", "timeout", time.Hour, func(ctx context.Context) ([]byte, bool, error) { <-ctx.Done(); return nil, false, ctx.Err() })
	if !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	c.MaxBytes = 100
	c.Capacity = 1
	f = func(context.Context) ([]byte, bool, error) { n++; return []byte("1"), false, nil }
	c.Load(context.Background(), "s", "a", time.Hour, f)
	c.Load(context.Background(), "other", "b", time.Hour, f)
	before := n
	c.Load(context.Background(), "s", "a", time.Hour, f)
	if n != before {
		t.Fatal("partition eviction")
	}
}
func TestKeysAndValidation(t *testing.T) {
	q := Query{MediaType: "anime", Page: 1, PageSize: 20, Search: " x "}
	if q.Key("a") == q.Key("b") || q.Key("a") != (Query{MediaType: "anime", Page: 1, PageSize: 20, Search: "x", Locale: "zh-CN"}).Key("a") {
		t.Fatal("keys")
	}
	q.Page = 2
	if q.Key("a") == (Query{MediaType: "anime", Page: 1, PageSize: 20, Search: "x"}).Key("a") {
		t.Fatal("page")
	}
	if DetailKey("a", "movie", "1", "zh-CN") == DetailKey("a", "tv", "1", "zh-CN") {
		t.Fatal("native type")
	}
	c := NewCapabilities("a", "A", []string{"anime"}, []string{"rank"}, 20, 0)
	for _, q := range []Query{{MediaType: "movie", Page: 1, PageSize: 20}, {MediaType: "anime", Page: 0, PageSize: 20}, {MediaType: "anime", Page: 1, PageSize: 21}, {MediaType: "anime", Page: 1, PageSize: 20, Genre: "x"}, {MediaType: "anime", Page: 1, PageSize: 20, Year: "2024"}} {
		if Validate(c, q) == nil {
			t.Fatal(q)
		}
	}
}

func TestNegativeErrorCopy(t *testing.T) {
	c := NewCache()
	f := func(context.Context) ([]byte, bool, error) { return nil, false, Problem(404, "不存在") }
	_, e := c.Load(context.Background(), "s", "k", time.Hour, f)
	e.(*Error).Status = 400
	_, e = c.Load(context.Background(), "s", "k", time.Hour, f)
	if e.(*Error).Status != 404 {
		t.Fatal("cached error mutated")
	}
}

func TestConcurrentSourceIsolation(t *testing.T) {
	c := NewCache()
	start := make(chan struct{})
	finish := make(chan struct{})
	done := make(chan string, 1)
	go func() {
		b, _ := c.Load(context.Background(), "a", "same", time.Hour, func(context.Context) ([]byte, bool, error) { close(start); <-finish; return []byte("a"), false, nil })
		done <- string(b)
	}()
	<-start
	b, e := c.Load(context.Background(), "b", "same", time.Hour, func(context.Context) ([]byte, bool, error) { return []byte("b"), false, nil })
	close(finish)
	if e != nil || string(b) != "b" || <-done != "a" {
		t.Fatal("source collision", e)
	}
}
