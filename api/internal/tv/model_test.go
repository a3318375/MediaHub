package tv

import (
	"strings"
	"testing"
)

func TestSelectRanksPerEpisodeAndFilters(t *testing.T) {
	d := Draft{TMDBID: "1", Title: "测试", Season: 1, Rules: Rules{Channels: []string{"shows"}, Match: `(?i)(4k|2160p)`, Exclude: `预告`}}
	items := []Candidate{
		{Title: "测试 S01E01 4K 80GB", URL: "magnet:?xt=urn:btih:" + strings.Repeat("a", 40), Channel: "shows"},
		{Title: "测试 S01E01 4K 2GB", URL: "https://115.com/s/aaaa", Channel: "shows"},
		{Title: "测试 S01E01 4K 5GB", URL: "https://115.com/s/bbbb", Channel: "shows"},
		{Title: "测试 S01E01 4K 100GB", URL: "https://115.com.evil.test/s/x", Channel: "shows"},
		{Title: "测试 S02E01 4K 100GB", URL: "https://115.com/s/wrong-season", Channel: "shows"},
		{Title: "测试 S01E01 4K 200GB", URL: "https://115.com/s/wrong-channel", Channel: "other"},
		{Title: "测试 EP02 2160p 4GB", URL: "magnet:?xt=urn:btih:" + strings.Repeat("b", 40), Channel: "shows"},
		{Title: "测试 第2集 4K 8GB", URL: "magnet:?xt=urn:btih:" + strings.Repeat("c", 40), Channel: "shows"},
		{Title: "测试 第2集 4K 预告 20GB", URL: "https://115.com/s/trailer", Channel: "shows"},
		{Title: "测试 第3集 1080p 20GB", URL: "https://115.com/s/1080", Channel: "shows"},
		{Title: "测试 4K 完整合集", URL: "https://115.com/s/unknown", Channel: "shows"},
	}
	got := Select(d, items)
	if len(got) != 2 || got[0].URL != "https://115.com/s/bbbb" || got[1].URL != "magnet:?xt=urn%3Abtih%3A"+strings.Repeat("c", 40) {
		t.Fatalf("unexpected choices: %+v", got)
	}
}

func TestRulesValidation(t *testing.T) {
	d := Draft{TMDBID: "12", Title: "测试", Season: 1, Rules: Rules{Channels: []string{"https://t.me/shows", "@other"}}}
	if err := Validate(&d); err != nil || d.Channels[0] != "shows" || d.Channels[1] != "other" {
		t.Fatalf("normalize: %+v %v", d, err)
	}
	d.Match = "["
	if Validate(&d) == nil {
		t.Fatal("invalid regex accepted")
	}
}

func TestRejectsInvalidLinksAndAmbiguousEpisodes(t *testing.T) {
	d := Draft{Title: "测试", TMDBID: "1", Season: 1}
	for _, item := range []Candidate{
		{Title: "测试 S01E01", URL: "magnet:?xt=urn:btih:abc"},
		{Title: "测试 S01E01", URL: "https://115.com/profile"},
		{Title: "测试 S01E01E02", URL: "https://115.com/s/abcd"},
		{Title: "测试 S01E01-E02", URL: "https://115.com/s/abcd"},
		{Title: "测试 第1-10集", URL: "https://115.com/s/abcd"},
		{Title: "测试 第1集 第2集", URL: "https://115.com/s/abcd"},
	} {
		if out := Select(d, []Candidate{item}); len(out) != 0 {
			t.Errorf("unsafe candidate selected: %+v", out)
		}
	}
	out := Select(d, []Candidate{{Title: "测试 第1集 4K", URL: "https://anxia.com/s/abcd?password=1234"}})
	if len(out) != 1 || out[0].URL != "https://115.com/s/abcd" || out[0].Password != "1234" {
		t.Fatalf("public share parser not reused: %+v", out)
	}
}

func TestRepeatedEpisodeMarkersAreNotMultipleEpisodes(t *testing.T) {
	d := Draft{Title: "测试", TMDBID: "1", Season: 1}
	for _, title := range []string{"测试 S01E02 测试 S01E02 4K 5GB", "测试 第2集 4K 正文：第2集", "测试 S01E02 EP02"} {
		got := Select(d, []Candidate{{Title: title, URL: "https://115.com/s/abcd"}})
		if len(got) != 1 || got[0].Episode != 2 {
			t.Errorf("same episode incorrectly rejected: %s %+v", title, got)
		}
	}
	for _, title := range []string{"测试 S01E02 EP03", "测试 S01E02 S02E02"} {
		if got := Select(d, []Candidate{{Title: title, URL: "https://115.com/s/abcd"}}); len(got) != 0 {
			t.Errorf("conflicting marker accepted: %+v", got)
		}
	}
}
