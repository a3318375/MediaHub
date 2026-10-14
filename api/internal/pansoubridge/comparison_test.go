package pansoubridge

import (
	"context"
	"encoding/json"
	"os"
	"pansou/config"
	"testing"
	"time"
)

// Opt-in live reproduction, isolated from the application's persisted cache.
func TestLiveSearchComparison(t *testing.T) {
	if os.Getenv("PANSOU_COMPARE") != "1" {
		t.Skip("set PANSOU_COMPARE=1 to compare live search rounds")
	}
	b, err := New(compareDataDir(t))
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := b.Shutdown(ctx); err != nil {
			t.Error(err)
		}
	}()
	t.Logf("CONFIG outbound=%d workers=%d tasks=%d plugin=%v tg=%v", config.AppConfig.OutboundMaxConcurrency, config.AppConfig.AsyncMaxBackgroundWorkers, config.AppConfig.AsyncMaxBackgroundTasks, config.AppConfig.PluginTimeout, config.AppConfig.TGChannelTimeout)
	var rounds []map[string]interface{}
	if os.Getenv("PANSOU_COMPARE_UI") == "1" {
		// Reproduce the browser: warm all sources while TG supplies the first response.
		warm := make(chan error, 1)
		go func() {
			_, err := b.Search(context.Background(), "拨乱行动", "all", nil, nil, nil, "merge", false)
			warm <- err
		}()
		started := time.Now()
		result, err := b.Search(context.Background(), "拨乱行动", "tg", nil, nil, nil, "merge", false)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("UI FIRST elapsed=%v total=%d", time.Since(started), result.(searchData).Total)
		defer func() {
			if err := <-warm; err != nil {
				t.Error(err)
			}
		}()
	}
	for i, delay := range []time.Duration{0, 2 * time.Second, 3 * time.Second, 3 * time.Second} {
		time.Sleep(delay)
		started := time.Now()
		result, err := b.Search(context.Background(), "拨乱行动", "all", nil, nil, nil, "merge", i == 0 && os.Getenv("PANSOU_COMPARE_UI") != "1")
		if err != nil {
			t.Fatal(err)
		}
		data := result.(searchData)
		counts := map[string]int{}
		for cloud, links := range data.LinksByCloud {
			counts[cloud] = len(links)
		}
		t.Logf("ROUND %d elapsed=%v total=%d clouds=%v", i, time.Since(started), data.Total, counts)
		rounds = append(rounds, map[string]interface{}{"round": i, "elapsedMs": time.Since(started).Milliseconds(), "data": data})
	}
	if output := os.Getenv("PANSOU_COMPARE_OUTPUT"); output != "" {
		data, err := json.MarshalIndent(rounds, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(output, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func compareDataDir(t *testing.T) string {
	if dir := os.Getenv("PANSOU_COMPARE_DATA"); dir != "" {
		return dir
	}
	return t.TempDir()
}
