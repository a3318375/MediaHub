package tmdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

func testKey(t *testing.T) string {
	t.Helper()
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		t.Fatal(e)
	}
	return hex.EncodeToString(b)
}
func testClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	c := NewClient()
	c.BaseURL = "http://tmdb.test"
	c.HTTP.Transport = handlerTransport{h}

	return c
}
func TestIdentityNormalization(t *testing.T) {
	a, b := Identity("movie", 12), Identity("tv", 12)
	if a.MediaID == b.MediaID || a.ProviderID != "12" || a.Provider != "tmdb" {
		t.Fatal(a, b)
	}
	s, e := normalize(record{ID: 12, Name: "剧集", OriginalName: "Original", AirDate: "2025-01-02", Votes: 8, Vote: 7.2, GenreIDs: []int{18}}, "tv")
	if e != nil || s.Title != "剧集" || s.Year == nil || *s.Year != 2025 || s.Genres[0] != "剧情" || s.Ratings[0].VoteCount != 8 {
		t.Fatal(s, e)
	}
	s, e = normalize(record{ID: 2, Title: "未知日期"}, "movie")
	if e != nil || s.Year != nil || len(s.Ratings) != 0 || s.PosterPath != nil {
		t.Fatal(s, e)
	}
	if _, e = normalize(record{ID: 0, Title: "bad"}, "movie"); e == nil {
		t.Fatal("invalid ID")
	}
}
func TestDiscoverPaginationCache(t *testing.T) {
	key := testKey(t)
	var calls atomic.Int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		q := r.URL.Query()
		if r.URL.Path != "/discover/tv" || q.Get("api_key") != key || q.Get("language") != "zh-CN" || q.Get("with_genres") != "18" || q.Get("with_origin_country") != "CN" || q.Get("first_air_date_year") != "2025" || q.Get("sort_by") != "first_air_date.desc" || q.Get("page") != "2" {
			t.Error("unexpected request parameters")
		}
		w.Write([]byte(`{"page":2,"total_results":61,"total_pages":4,"results":[{"id":12,"name":"剧集"}]}`))
	})
	q := Query{Type: "tv", Page: 2, Genre: "18", Region: "CN", Year: "2025", Sort: "date.desc"}
	p, e := c.Discover(context.Background(), key, q)
	if e != nil || p.Page != 2 || p.Total == nil || *p.Total != 61 || !p.HasMore || p.PageSize != 20 || len(p.Items) != 1 {
		t.Fatal(p, e)
	}
	cached, e := c.Discover(context.Background(), key, q)
	if e != nil || calls.Load() != 1 || cached.FetchedAt != p.FetchedAt {
		t.Fatal("cache")
	}
}
func TestSearchDetails(t *testing.T) {
	key := testKey(t)
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		switch r.URL.Path {
		case "/search/movie":
			if q.Get("query") != "作品" || q.Get("year") != "2024" || q.Has("sort_by") {
				t.Error("search parameters")
			}
			w.Write([]byte(`{"page":1,"total_results":0,"total_pages":0,"results":[]}`))
		case "/movie/12":
			if q.Get("append_to_response") != "credits" {
				t.Error("credits")
			}
			w.Write([]byte(`{"id":12,"title":"电影","runtime":90,"genres":[{"id":18,"name":"剧情"}],"credits":{"cast":[{"id":3,"name":"演员","character":"角色","profile_path":"/actor.jpg"}]}}`))
		case "/movie/12/external_ids", "/tv/12/external_ids":
			w.Write([]byte(`{"id":12}`))
		case "/tv/12":
			w.Write([]byte(`{"id":12,"name":"电视剧","seasons":[{"season_number":1,"episode_count":8,"name":"第一季"}]}`))
		default:
			t.Error("unexpected path")
			w.WriteHeader(404)
		}
	})
	p, e := c.Discover(context.Background(), key, Query{Type: "movie", Page: 1, Search: "作品", Year: "2024"})
	if e != nil || p.HasMore || p.Total == nil || *p.Total != 0 || len(p.Items) != 0 {
		t.Fatal(p, e)
	}
	m, e := c.Detail(context.Background(), key, "movie", "12")
	if e != nil || m.RuntimeMinutes == nil || *m.RuntimeMinutes != 90 || len(m.Credits) != 1 || m.Credits[0].ProfilePath == nil || *m.Credits[0].ProfilePath != "/actor.jpg" {
		t.Fatal(m, e)
	}
	tv, e := c.Detail(context.Background(), key, "tv", "12")
	if e != nil || tv.MediaID == m.MediaID || len(tv.Seasons) != 1 || *tv.Seasons[0].EpisodeCount != 8 {
		t.Fatal(tv, e)
	}
}
func TestErrors(t *testing.T) {
	for _, tt := range []struct {
		up, status, calls int
		body              string
	}{{404, 404, 1, ""}, {401, 503, 1, ""}, {403, 503, 1, ""}, {500, 502, 3, ""}, {429, 503, 3, ""}, {200, 502, 1, "not-json"}, {200, 502, 1, `{"page":1,"results":[]}`}, {200, 502, 1, `{"page":2,"total_pages":3,"results":[]}`}} {
		t.Run(strconv.Itoa(tt.up)+tt.body, func(t *testing.T) {
			var n atomic.Int32
			c := testClient(t, func(w http.ResponseWriter, r *http.Request) { n.Add(1); w.WriteHeader(tt.up); w.Write([]byte(tt.body)) })
			_, err := c.Discover(context.Background(), testKey(t), Query{Type: "movie", Page: 1})
			var e *Error
			if !errors.As(err, &e) || e.Status != tt.status || n.Load() != int32(tt.calls) {
				t.Fatal(err, n.Load())
			}
		})
	}
}
func TestUnknownTotalValidation(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"page":1,"total_pages":1,"results":[]}`))
	})
	p, e := c.Discover(context.Background(), testKey(t), Query{Type: "movie", Page: 1})
	if e != nil || p.Total != nil || p.HasMore {
		t.Fatal(p, e)
	}
	for _, q := range []Query{{Type: "all", Page: 1}, {Type: "movie", Page: 0}, {Type: "tv", Page: 501}, {Type: "movie", Page: 1, Genre: "999"}, {Type: "tv", Page: 1, Genre: "28"}, {Type: "movie", Page: 1, Search: "作品", Region: "CN"}} {
		if q.Validate() == nil {
			t.Fatal(q)
		}
	}
	for _, id := range []string{"0", "demo-12", "01", "-1"} {
		if _, e = c.Detail(context.Background(), testKey(t), "movie", id); e == nil {
			t.Fatal(id)
		}
	}
}
func TestRetryBoundAndCancellation(t *testing.T) {
	var n atomic.Int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(429)
	})
	_, err := c.Detail(context.Background(), testKey(t), "movie", "12")
	var e *Error
	if !errors.As(err, &e) || e.Status != 503 || n.Load() != 1 {
		t.Fatal(err, n.Load())
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.Detail(ctx, testKey(t), "tv", "12")
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
func TestTimeoutCredentialChange(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	_, err := c.Detail(ctx, testKey(t), "movie", "12")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal(err)
	}
	c.HTTP.Timeout = 20 * time.Millisecond
	_, err = c.Detail(context.Background(), testKey(t), "movie", "12")
	var e *Error
	if !errors.As(err, &e) || e.Status != 504 {
		t.Fatal(err)
	}
	var n atomic.Int32
	c = testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/movie/12/external_ids" {
			w.Write([]byte(`{"id":12}`))
			return
		}
		n.Add(1)
		w.Write([]byte(`{"id":12,"title":"作品"}`))
	})
	for i := 0; i < 2; i++ {
		if _, err = c.Detail(context.Background(), testKey(t), "movie", "12"); err != nil {
			t.Fatal(err)
		}
	}
	if n.Load() != 2 {
		t.Fatal("credential change reused cache")
	}
}

// Drive the upstream handler entirely in process; no listening sockets or network.
type handlerTransport struct{ handler http.Handler }

func (tr handlerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if err := r.Context().Err(); err != nil {
		return nil, err
	}
	w := httptest.NewRecorder()
	tr.handler.ServeHTTP(w, r)
	if err := r.Context().Err(); err != nil {
		return nil, err
	}
	return w.Result(), nil
}

func TestCacheExpiryAndCanceledHit(t *testing.T) {
	var calls atomic.Int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/movie/12/external_ids" {
			w.Write([]byte(`{"id":12}`))
			return
		}
		calls.Add(1)
		w.Write([]byte(`{"id":12,"title":"电影"}`))
	})
	key := testKey(t)
	if _, e := c.Detail(context.Background(), key, "movie", "12"); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.Detail(ctx, key, "movie", "12"); !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	c.mu.Lock()
	for k, v := range c.cache {
		v.expires = time.Now().Add(-time.Second)
		c.cache[k] = v
	}
	c.mu.Unlock()
	if _, e := c.Detail(context.Background(), key, "movie", "12"); e != nil {
		t.Fatal(e)
	}
	if calls.Load() != 2 {
		t.Fatal("expired cache reused")
	}
}

func TestMalformedResponsesAreNotCached(t *testing.T) {
	var calls atomic.Int32
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.Write([]byte(`{"page":1,"results":[]}`))
			return
		}
		w.Write([]byte(`{"page":1,"total_pages":0,"total_results":0,"results":[]}`))
	})
	key := testKey(t)
	q := Query{Type: "movie", Page: 1}
	if _, e := c.Discover(context.Background(), key, q); e == nil {
		t.Fatal("malformed page accepted")
	}
	if _, e := c.Discover(context.Background(), key, q); e != nil {
		t.Fatal(e)
	}
	if calls.Load() != 2 {
		t.Fatal("failure cached")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type stalledBody struct{ ctx context.Context }

func (b stalledBody) Read(_ []byte) (int, error) { <-b.ctx.Done(); return 0, b.ctx.Err() }
func (b stalledBody) Close() error               { return nil }
func TestResponseBodyTimeout(t *testing.T) {
	c := NewClient()
	c.BaseURL = "http://tmdb.test"
	c.HTTP.Timeout = 20 * time.Millisecond
	c.HTTP.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: stalledBody{r.Context()}, Request: r}, nil
	})
	_, err := c.Detail(context.Background(), testKey(t), "movie", "12")
	var e *Error
	if !errors.As(err, &e) || e.Status != 504 {
		t.Fatalf("body timeout mapped incorrectly: %v", err)
	}
}
