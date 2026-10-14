package discovery

import (
	"container/list"
	"context"
	"errors"
	"strconv"
	"sync"
	"time"
)

type cacheEntry struct {
	key     string
	body    []byte
	err     error
	expires time.Time
}
type flight struct {
	done chan struct{}
	body []byte
	err  error
}
type partition struct {
	lru     *list.List
	entries map[string]*list.Element
	bytes   int
}

// Cache stores serialized values, so consumers never share mutable provider objects.
type Cache struct {
	Timeouts           map[string]time.Duration
	generations        map[string]int
	mu                 sync.Mutex
	partitions         map[string]*partition
	flights            map[string]*flight
	Capacity, MaxBytes int
	Timeout            time.Duration
	Now                func() time.Time
}

func NewCache() *Cache {
	return &Cache{Timeouts: map[string]time.Duration{"tmdb": 15 * time.Second, "bangumi": 12 * time.Second, "anilist": 20 * time.Second, "douban": 15 * time.Second}, generations: map[string]int{}, partitions: map[string]*partition{}, flights: map[string]*flight{}, Capacity: 256, MaxBytes: 16 << 20, Timeout: 15 * time.Second, Now: time.Now}
}
func (c *Cache) Load(ctx context.Context, source, key string, ttl time.Duration, fetch func(context.Context) ([]byte, bool, error)) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	key = source + ":" + key
	key += ":epoch:" + strconv.Itoa(c.generations[source])
	p := c.partitions[source]
	if p == nil {
		p = &partition{lru: list.New(), entries: map[string]*list.Element{}}
		c.partitions[source] = p
	}
	if el := p.entries[key]; el != nil {
		e := el.Value.(cacheEntry)
		if c.Now().Before(e.expires) {
			p.lru.MoveToFront(el)
			c.mu.Unlock()
			return append([]byte(nil), e.body...), cloneError(e.err)
		}
		p.bytes -= len(e.body)
		p.lru.Remove(el)
		delete(p.entries, key)
	}
	f := c.flights[key]
	if f == nil {
		f = &flight{done: make(chan struct{})}
		c.flights[key] = f
		go func() {
			timeout := c.Timeout
			if v, ok := c.Timeouts[source]; ok {
				timeout = v
			}
			shared, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
			defer cancel()
			body, negative, err := fetch(shared)
			c.mu.Lock()
			defer c.mu.Unlock()
			f.body = append([]byte(nil), body...)
			f.err = err
			var de *Error
			cacheable := err == nil || (errors.As(err, &de) && de.Status == 404)
			if cacheable && shared.Err() == nil {
				life := ttl
				if negative || err != nil {
					life = 300 * time.Second
				}
				if len(body) <= c.MaxBytes {
					e := cacheEntry{key, append([]byte(nil), body...), err, c.Now().Add(life)}
					el := p.lru.PushFront(e)
					p.entries[key] = el
					p.bytes += len(body)
					for p.lru.Len() > c.Capacity || p.bytes > c.MaxBytes {
						last := p.lru.Back()
						old := last.Value.(cacheEntry)
						p.bytes -= len(old.body)
						delete(p.entries, old.key)
						p.lru.Remove(last)
					}
				}
			}
			delete(c.flights, key)
			close(f.done)
		}()
	}
	c.mu.Unlock()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-f.done:
		return append([]byte(nil), f.body...), cloneError(f.err)
	}
}

func (c *Cache) Invalidate(source string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.generations[source]++
	delete(c.partitions, source)
}

func cloneError(err error) error {
	var e *Error
	if errors.As(err, &e) {
		copy := *e
		return &copy
	}
	return err
}
