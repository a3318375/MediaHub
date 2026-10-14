package download_test

import (
	"context"
	"fmt"
	"media-center/internal/download"
	"media-center/internal/pan115"
	"sync/atomic"
	"testing"
	"time"
)

type concurrentSubmitGateway struct {
	*gateway
	started      chan string
	release      map[string]chan struct{}
	active, peak atomic.Int32
}

func (g *concurrentSubmitGateway) Submit(url, directory string) (string, error) {
	_, hash, e := download.NormalizeMagnet(url)
	if e != nil {
		return "", e
	}
	n := g.active.Add(1)
	defer g.active.Add(-1)
	for {
		old := g.peak.Load()
		if n <= old || g.peak.CompareAndSwap(old, n) {
			break
		}
	}
	g.started <- hash
	<-g.release[hash]
	return hash, nil
}
func TestSubmissionsDoNotWaitForSlowResponseAndStayWithinFive(t *testing.T) {
	db, s, base, _ := setup(t)
	g := &concurrentSubmitGateway{gateway: base, started: make(chan string, 6), release: map[string]chan struct{}{}}
	for i := 1; i <= 6; i++ {
		hash := fmt.Sprintf("%040x", i)
		g.release[hash] = make(chan struct{})
		r := request()
		r.URL = "magnet:?xt=urn:btih:" + hash
		if _, _, e := s.Enqueue(r); e != nil {
			t.Fatal(e)
		}
	}
	s.Factory = func(context.Context, string) (pan115.Gateway, error) { return g, nil }
	finished := make(chan error, 1)
	go func() { finished <- s.Tick(context.Background()) }()
	released := map[string]bool{}
	release := func(hash string) {
		if !released[hash] {
			close(g.release[hash])
			released[hash] = true
		}
	}
	defer func() {
		for hash := range g.release {
			release(hash)
		}
	}()
	started := []string{}
	for i := 0; i < 5; i++ {
		select {
		case hash := <-g.started:
			started = append(started, hash)
		case <-time.After(3 * time.Second):
			t.Fatal("later submissions blocked on first response")
		}
	}
	select {
	case <-g.started:
		t.Fatal("more than five submissions in flight")
	default:
	}
	slow := started[0]
	release(started[1])
	var sixth string
	select {
	case sixth = <-g.started:
	case <-time.After(3 * time.Second):
		t.Fatal("free slot did not dispatch sixth while first was blocked")
	}
	for _, hash := range started[1:] {
		release(hash)
	}
	release(sixth)
	deadline := time.Now().Add(3 * time.Second)
	for {
		tasks, e := db.ListDownloads(false)
		if e != nil {
			t.Fatal(e)
		}
		submitted := 0
		for _, task := range tasks {
			if task.State == "submitted" {
				submitted++
			}
		}
		if submitted == 5 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("other task results waited for slow response")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if g.peak.Load() != 5 {
		t.Fatalf("peak=%d", g.peak.Load())
	}
	release(slow)
	select {
	case e := <-finished:
		if e != nil {
			t.Fatal(e)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("tick did not finish")
	}
	tasks, e := db.ListDownloads(false)
	if e != nil || len(tasks) != 6 {
		t.Fatal(e)
	}
	for _, task := range tasks {
		if task.State != "submitted" || task.RemoteID != task.ResourceID {
			t.Fatalf("bad task result %+v", task)
		}
	}
}
