package transport

import (
	"context"
	"errors"
	"fmt"
	"media-center/internal/discovery"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeRoundTrip func(*http.Request) (*http.Response, error)

func (f fakeRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestDynamicRateHeadersAndRetryAfterDate(t *testing.T) {
	c := New(time.Millisecond, 1)
	c.HTTP.Transport = fakeRoundTrip(func(r *http.Request) (*http.Response, error) {
		w := httptest.NewRecorder()
		w.Header().Set("X-RateLimit-Limit", "30")
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", fmt.Sprint(time.Now().Add(time.Minute).Unix()))
		w.Write([]byte(`{}`))
		return w.Result(), nil
	})
	r, _ := http.NewRequest("GET", "https://upstream.test", nil)
	if _, _, e := c.Do(r, MaxBody); e != nil {
		t.Fatal(e)
	}
	if c.Interval != 2*time.Second || time.Until(c.next) < 55*time.Second {
		t.Fatal("quota not tightened", c.Interval, c.next)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	r, _ = http.NewRequestWithContext(ctx, "GET", "https://upstream.test", nil)
	if _, _, e := c.Do(r, MaxBody); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	h := http.Header{}
	h.Set("Retry-After", time.Now().Add(time.Minute).UTC().Format(http.TimeFormat))
	if d := RetryDelay(h); d < 58*time.Second || d > time.Minute {
		t.Fatal(d)
	}
}
func TestForbiddenCooldownAndBodyLimit(t *testing.T) {
	for _, tt := range []struct {
		status int
		body   string
		want   int
	}{{403, `{}`, 503}, {200, "12345", 502}, {500, `{}`, 502}} {
		c := New(0, 1)
		n := 0
		c.HTTP.Transport = fakeRoundTrip(func(r *http.Request) (*http.Response, error) {
			n++
			w := httptest.NewRecorder()
			w.WriteHeader(tt.status)
			w.Write([]byte(tt.body))
			return w.Result(), nil
		})
		for i := 0; i < 2; i++ {
			r, _ := http.NewRequest("GET", "https://upstream.test", nil)
			_, _, e := c.Do(r, 4)
			var d *discovery.Error
			if !errors.As(e, &d) || d.Status != tt.want {
				t.Fatal(e)
			}
		}
		if tt.status == 403 && n != 1 {
			t.Fatal("repeated forbidden")
		}
	}
}
