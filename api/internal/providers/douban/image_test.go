package douban

import (
	"context"
	"errors"
	"media-center/internal/discovery"
	"media-center/internal/providers/transport"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestImageProxyValidation(t *testing.T) {
	p := New()
	p.ImageTransport.Interval = 0
	n := 0
	p.ImageTransport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		n++
		if r.Header.Get("Referer") != "https://movie.douban.com/" || r.Header.Get("User-Agent") != UserAgent || len(r.Header) != 2 {
			t.Error("headers/host")
		}
		w := httptest.NewRecorder()
		w.Header().Set("Content-Type", "image/gif")
		w.Write([]byte("GIF89a0000000000"))
		return w.Result(), nil
	})
	for _, url := range []string{"https://evil.test/a.jpg", "http://img1.doubanio.com/a.jpg", "https://img1.doubanio.com.evil.test/a.jpg", "https://user@img1.doubanio.com/a.jpg", "https://img1.doubanio.com:443/a.jpg", "https://doubanio.com/a.jpg", "https://img1.doubanio.com/a.jpg#fragment", "https://img1.doubanio.com:/a.jpg", "https://127.0.0.1/a.jpg"} {
		if _, _, e := p.Image(context.Background(), url); e == nil {
			t.Fatal(url)
		}
	}
	if n != 0 {
		t.Fatal("SSRF")
	}
	b, content, e := p.Image(context.Background(), "https://img1.doubanio.com/a.jpg")
	if e != nil || len(b) == 0 || content != "image/gif" {
		t.Fatal(content, e)
	}
	for _, raw := range []string{
		"https://img4.doubanio.com/a.jpg",
		"https://qnmob3-sign.doubanio.com/view/photo/large/public/p.jpg?sa_cv=abc&sa_ct=123&imageView2/0/q/80/w/9999/h/120/format/webp",
	} {
		p.ImageTransport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != raw || r.Header.Get("Referer") != "https://movie.douban.com/" || r.Header.Get("User-Agent") != UserAgent || len(r.Header) != 2 {
				t.Fatalf("upstream request: %s headers=%v", r.URL, r.Header)
			}
			w := httptest.NewRecorder()
			w.Header().Set("Content-Type", "image/webp")
			w.Write([]byte("RIFF0000WEBPVP8 00000000"))
			return w.Result(), nil
		})
		if _, content, err := p.Image(context.Background(), raw); err != nil || content != "image/webp" {
			t.Fatalf("signed/CDN image: content=%s err=%v", content, err)
		}
	}
	for _, tt := range []struct {
		content, body string
		status        int
	}{{"image/jpeg", strings.Repeat("x", 1<<20+1), 200}, {"image/jpeg", "<html>error</html>", 200}, {"text/html", "<html>error</html>", 200}, {"image/jpeg", "", 302}} {
		p = New()
		p.ImageTransport.Interval = 0
		calls := 0
		p.ImageTransport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
			calls++
			w := httptest.NewRecorder()
			w.Header().Set("Content-Type", tt.content)
			w.Header().Set("Location", "https://evil.test")
			w.WriteHeader(tt.status)
			w.Write([]byte(tt.body))
			return w.Result(), nil
		})
		_, _, e := p.Image(context.Background(), "https://img1.doubanio.com/a.jpg")
		if calls != 1 {
			t.Fatalf("unexpected upstream requests (redirect followed): %d", calls)
		}
		var d *discovery.Error
		if !errors.As(e, &d) || (d.Status != 502 && d.Status != 503) {
			t.Fatal(e)
		}
	}
	_ = transport.MaxBody
}

// Occupy both CDN slots: an API request must still complete immediately.
func TestImageBudgetIndependentAndCooldownShared(t *testing.T) {
	p := New()
	if p.Transport == p.ImageTransport || p.Transport.Slots == p.ImageTransport.Slots || cap(p.ImageTransport.Slots) != 2 || p.ImageTransport.Interval != 250*time.Millisecond {
		t.Fatal("image budget must be independent")
	}
	p.ImageTransport.Slots <- struct{}{}
	p.ImageTransport.Slots <- struct{}{}
	p.Transport.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		w := httptest.NewRecorder()
		w.Write([]byte("{}"))
		return w.Result(), nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := p.request(ctx, "/movie/1", nil, &struct{}{}); err != nil {
		t.Fatal(err)
	}
	for _, imageRisk := range []bool{true, false} {
		for _, response := range []struct {
			status int
			body   string
		}{
			{403, ""}, {400, "{\"code\":996}"}, {200, "<html>captcha</html>"},
		} {
			p = New()
			c := p.Transport
			if imageRisk {
				c = p.ImageTransport
			}
			c.HTTP.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
				w := httptest.NewRecorder()
				w.WriteHeader(response.status)
				w.Write([]byte(response.body))
				return w.Result(), nil
			})
			req, _ := http.NewRequestWithContext(ctx, "GET", "https://img1.doubanio.com/a", nil)
			_, _, err := c.Do(req, transport.MaxBody)
			var d *discovery.Error
			if !errors.As(err, &d) || d.Status != 503 || d.RetryAfter != "600" {
				t.Fatalf("risk: %v", err)
			}
			for _, client := range []*transport.Client{p.Transport, p.ImageTransport} {
				if available, reason := client.Availability(); available || reason == "" {
					t.Fatal("risk cooldown not shared")
				}
				if err := client.UnavailableError(); err == nil {
					t.Fatal("missing cooldown error")
				}
			}
		}
	}
}
