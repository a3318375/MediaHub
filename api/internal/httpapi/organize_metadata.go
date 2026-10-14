package httpapi

import (
	"context"
	"fmt"
	"media-center/internal/discovery"
	"media-center/internal/download"
	"media-center/internal/organize"
	"media-center/internal/pan115"
	"strconv"
)

// Existing subscription/search identities take precedence over filename guesses.
func (a *API) resolveOrganizeMedia(ctx context.Context, m download.MediaContext, f pan115.File) (download.MediaContext, error) {
	if !organize.IsVideo(f.Name) {
		return m, nil
	}
	if m.Title != "" && m.Type != "" && (m.ProviderID != "" || m.BangumiID != "" || m.MikanID != "" || m.Provider == "manual") {
		return m, nil
	}
	title, kind, year := organize.Guess(f.Name, "auto")
	if m.Type != "" {
		kind = m.Type
	}
	if m.Year > 0 {
		year = m.Year
	}
	if title == "" {
		return m, fmt.Errorf("文件名无法识别作品")
	}
	queryKind := kind
	if kind == "anime" || kind == "program" {
		queryKind = "tv"
	}
	q := discovery.Query{MediaType: queryKind, Search: title, Page: 1, PageSize: 20, Locale: "zh-CN"}
	if year > 0 {
		q.Year = strconv.Itoa(year)
	}
	result, e := a.discoveryService().Discover(ctx, "tmdb", q)
	if e != nil {
		return m, fmt.Errorf("TMDB 识别暂不可用，请检查 TMDB 设置")
	}
	matches := []download.MediaContext{}
	for _, item := range result.Items {
		if organize.NormalTitle(item.Title) != organize.NormalTitle(title) && organize.NormalTitle(item.OriginalTitle) != organize.NormalTitle(title) {
			continue
		}
		if year > 0 && (item.Year == nil || *item.Year != year) {
			continue
		}
		candidate := m
		candidate.Type = kind
		candidate.Title = item.Title
		candidate.Provider = "tmdb"
		candidate.ProviderID = item.ProviderID
		if item.Year != nil {
			candidate.Year = *item.Year
		}
		matches = append(matches, candidate)
	}
	if len(matches) != 1 {
		return m, fmt.Errorf("TMDB 未找到唯一作品，保留文件等待确认")
	}
	if result.Total != nil && *result.Total > len(result.Items) {
		return m, fmt.Errorf("TMDB 结果超过当前页，请补充作品年份")
	}
	return matches[0], nil
}
