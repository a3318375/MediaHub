package pansoubridge

import (
	"context"
	"fmt"
	"strings"
	"time"

	"media-center/internal/tv"
)

func (b *Bootstrap) SearchTV(ctx context.Context, d tv.Draft) ([]tv.Candidate, error) {
	if tv.SourceOf(d) != "pansou" {
		return nil, fmt.Errorf("TG 订阅不能调用 PanSou")
	}
	selected, err := b.ReadSearchSettings()
	if err != nil {
		return nil, err
	}
	channels := selected.Channels
	plugins := selected.Plugins
	source := "all"
	if len(channels) == 0 && len(plugins) == 0 {
		return nil, fmt.Errorf("请在全局设置中启用 PanSou 搜索来源")
	}
	if len(channels) == 0 {
		source = "plugin"
	}
	if len(plugins) == 0 {
		source = "tg"
	}
	// Preserve titles and channels for per-episode rules; merged links lose that context.
	result, err := b.Search(ctx, d.Title, source, []string{"115", "magnet"}, plugins, channels, "results", false)
	if err != nil {
		return nil, err
	}
	data, ok := result.(searchData)
	if !ok {
		return nil, fmt.Errorf("PanSou 返回格式异常")
	}
	// Async plugins may populate their cache after the first pass.
	if source != "tg" {
		timer := time.NewTimer(3 * time.Second)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timer.C:
		}
		again, e := b.Search(ctx, d.Title, source, []string{"115", "magnet"}, plugins, channels, "results", false)
		if e == nil {
			if more, ok := again.(searchData); ok {
				data.Items = append(data.Items, more.Items...)
			}
		}
	}
	return tvCandidates(data), nil
}

func tvCandidates(data searchData) []tv.Candidate {
	out := []tv.Candidate{}
	seen := map[string]bool{}
	for _, item := range data.Items {
		for _, link := range item.Links {
			if len(item.Links) > 1 && strings.TrimSpace(link.Title) == "" {
				continue
			}
			title := strings.TrimSpace(link.Title)
			if title == "" {
				title = item.Title
			}
			// A message can contain different shows and sizes. Do not attach the
			// full body to every link; only a single-link message is unambiguous.
			if len(item.Links) == 1 {
				title = strings.TrimSpace(title + " " + item.Description)
			}
			key := link.URL + "\n" + title + "\n" + item.Channel
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, tv.Candidate{Title: title, URL: link.URL, Password: link.Password, Cloud: link.Cloud, Channel: item.Channel, Size: tv.ParseSize(title)})
		}
	}
	return out
}
