// Package transport applies independent, conservative budgets without logging request URLs.
package transport

import (
	"context"
	"encoding/json"
	"io"
	"media-center/internal/discovery"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const MaxBody = 2 << 20

type Client struct {
	failures int
	Guard    func([]byte) error
	HTTP     *http.Client
	Interval time.Duration
	Slots    chan struct{}
	mu       sync.Mutex
	next     time.Time
	cooldown *cooldown
}

type cooldown struct {
	mu               sync.Mutex
	unavailableUntil time.Time
	reason           string
}

func New(interval time.Duration, concurrency int) *Client {
	return &Client{cooldown: &cooldown{}, HTTP: &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, Interval: interval, Slots: make(chan struct{}, concurrency)}
}

// ShareCooldown shares source availability while keeping request budgets independent.
// Configure before issuing requests.
func (c *Client) ShareCooldown(other *Client) { c.cooldown = other.cooldown }
func (c *Client) Disable(reason string, d time.Duration) {
	c.cooldown.mu.Lock()
	defer c.cooldown.mu.Unlock()
	c.cooldown.unavailableUntil = time.Now().Add(d)
	c.cooldown.reason = reason
}
func (c *Client) Availability() (bool, string) {
	c.cooldown.mu.Lock()
	defer c.cooldown.mu.Unlock()
	if time.Now().Before(c.cooldown.unavailableUntil) {
		return false, c.cooldown.reason
	}
	return true, ""
}
func (c *Client) unavailable() error {
	c.cooldown.mu.Lock()
	defer c.cooldown.mu.Unlock()
	if time.Now().Before(c.cooldown.unavailableUntil) {
		return &discovery.Error{Status: 503, Message: c.cooldown.reason, RetryAfter: strconv.Itoa(int(time.Until(c.cooldown.unavailableUntil).Seconds()) + 1)}
	}
	return nil
}
func RetryDelay(h http.Header) time.Duration {
	if n, e := strconv.Atoi(h.Get("Retry-After")); e == nil && n > 0 {
		if n > 86400 {
			n = 86400
		}
		return time.Duration(n) * time.Second
	}
	if t, e := http.ParseTime(h.Get("Retry-After")); e == nil && time.Until(t) > 0 {
		return time.Until(t)
	}
	return time.Minute
}
func (c *Client) Do(req *http.Request, max int) ([]byte, http.Header, error) {
	if err := c.unavailable(); err != nil {
		return nil, nil, err
	}
	ctx := req.Context()
	select {
	case c.Slots <- struct{}{}:
		defer func() { <-c.Slots }()
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	}
	if err := c.unavailable(); err != nil {
		return nil, nil, err
	}
	c.mu.Lock()
	d := time.Until(c.next)
	if d < 0 {
		d = 0
	}
	c.next = time.Now().Add(d + c.Interval)
	c.mu.Unlock()
	if d > 0 {
		t := time.NewTimer(d)
		defer t.Stop()
		select {
		case <-t.C:
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		}
	}
	// A previous concurrent request may have received a cooldown while we waited.
	if err := c.unavailable(); err != nil {
		return nil, nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, nil, ctx.Err()
		}
		if e, ok := err.(interface{ Timeout() bool }); ok && e.Timeout() {
			return nil, nil, discovery.Problem(504, "上游请求超时")
		}
		return nil, nil, discovery.Problem(502, "上游连接失败")
	}
	defer resp.Body.Close()
	c.mu.Lock()
	if limit, e := strconv.Atoi(resp.Header.Get("X-RateLimit-Limit")); e == nil && limit > 0 {
		interval := time.Minute / time.Duration(limit)
		if interval > c.Interval {
			c.Interval = interval
		}
		if n := time.Now().Add(c.Interval); n.After(c.next) {
			c.next = n
		}
	}
	if remaining, e := strconv.Atoi(resp.Header.Get("X-RateLimit-Remaining")); e == nil && remaining == 0 {
		reset := time.Now().Add(RetryDelay(resp.Header))
		if n, e := strconv.ParseInt(resp.Header.Get("X-RateLimit-Reset"), 10, 64); e == nil && time.Unix(n, 0).After(time.Now()) {
			reset = time.Unix(n, 0)
		}
		if reset.After(c.next) {
			c.next = reset
		}
	}
	c.mu.Unlock()
	if resp.StatusCode == 429 {
		delay := RetryDelay(resp.Header)
		c.Disable("上游暂时限流，请稍后重试", delay)
		return nil, resp.Header, &discovery.Error{Status: 503, Message: "上游暂时限流，请稍后重试", RetryAfter: strconv.Itoa(int(delay.Seconds()) + 1)}
	}
	if resp.StatusCode == 403 {
		c.Disable("来源拒绝访问，已暂停回源，请稍后重试", 10*time.Minute)
		return nil, resp.Header, &discovery.Error{Status: 503, Message: "来源拒绝访问，已暂停回源，请稍后重试", RetryAfter: "600"}
	}
	if resp.StatusCode == 404 {
		return nil, resp.Header, discovery.Problem(404, "未找到媒体条目")
	}
	if resp.StatusCode >= 500 {
		c.mu.Lock()
		c.failures++
		n := c.failures
		if n > 6 {
			n = 6
		}
		delay := time.Duration(1<<n) * 250 * time.Millisecond
		if next := time.Now().Add(delay); next.After(c.next) {
			c.next = next
		}
		c.mu.Unlock()
		return nil, resp.Header, discovery.Problem(502, "上游服务异常")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(max)+1))
	if err != nil {
		if ctx.Err() != nil {
			return nil, resp.Header, ctx.Err()
		}
		return nil, resp.Header, discovery.Invalid()
	}
	if len(body) > max {
		return nil, resp.Header, discovery.Invalid()
	}
	if c.Guard != nil {
		if err := c.Guard(body); err != nil {
			return nil, resp.Header, err
		}
	}
	if resp.StatusCode != 200 {
		return nil, resp.Header, discovery.Invalid()
	}
	c.mu.Lock()
	c.failures = 0
	c.mu.Unlock()
	return body, resp.Header, nil
}
func (c *Client) JSON(req *http.Request, out any) error {
	b, _, e := c.Do(req, MaxBody)
	if e != nil {
		return e
	}
	if json.Unmarshal(b, out) != nil {
		return discovery.Invalid()
	}
	return nil
}
func IsCanceled(err error) bool { return err == context.Canceled }
func IsVerification(body []byte) bool {
	s := strings.ToLower(string(body))
	return strings.Contains(s, "invalid_request_996") || strings.Contains(s, "captcha") || strings.Contains(s, "验证码") || strings.Contains(s, "验证页面") || strings.Contains(s, "<html")
}

func (c *Client) UnavailableError() error { return c.unavailable() }
