package anime

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"testing"
)

func TestAniBTSourcesAndURLBinding(t *testing.T) {
	s := New()
	s.Fetch = func(_ context.Context, raw string) ([]byte, error) {
		u, _ := url.Parse(raw)
		if u.Path == "/api/seasons/anime" {
			if u.Query().Get("query") != "A & B" {
				t.Fatal(u)
			}
			return []byte(`{"data":{"availableSeasons":["2026-10"],"byWeekday":[{"weekdayLabel":"星期一","animes":[{"bgmId":123,"title":{"chinese":"动画"},"cover":"x"}]}]}}`), nil
		}
		return []byte(`{"data":{"groups":[{"slug":"group-a","name":"A & B","items":[{"title":"动画 - 01 [1080p]","magnet":"magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567","publishedAt":1700000000000,"size":100}]}]}}`), nil
	}
	cat, e := s.SourceCatalog(context.Background(), "ani-bt", "A & B", "", false)
	if e != nil || len(cat.Items) != 1 || cat.Items[0].ID != "123" {
		t.Fatalf("%+v %v", cat, e)
	}
	groups, e := s.SourceGroups(context.Background(), "ani-bt", "123", false)
	if e != nil || len(groups) != 1 || groups[0].Items[0].DownloadKind != "magnet" {
		t.Fatalf("%+v %v", groups, e)
	}
	d := validDraft()
	d.Source = "ani-bt"
	d.URL = groups[0].URL
	if e = Validate(&d); e != nil {
		t.Fatal(e)
	}
	d.BangumiID = "124"
	if e = Validate(&d); e == nil {
		t.Fatal("accepted mismatched subject")
	}
	d.BangumiID = "123"
	d.URL = "https://evil.example/rss/anime.xml?bgmId=123"
	if e = Validate(&d); e == nil {
		t.Fatal("accepted wrong provider")
	}
}
func TestGardenGroupingEscapesAndSeparatesSubjects(t *testing.T) {
	s := New()
	s.Fetch = func(_ context.Context, raw string) ([]byte, error) {
		u, _ := url.Parse(raw)
		if u.Path == "/subjects" {
			return []byte(`{"subjects":[{"id":123,"name":"动画"},{"id":"124","name":"其他作品"}]}`), nil
		}
		if u.Query().Get("subject") != "123" || u.Query().Get("pageSize") != "200" {
			t.Fatal(raw)
		}
		return []byte(`{"resources":[{"subjectId":123,"title":"动画 - 01","magnet":"magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567","fansub":{"name":"A & B+中文"}},{"subjectId":"124","title":"其他 - 02","fansub":{"name":"A & B+中文"}},{"subjectId":123,"title":"无字幕组"}]}`), nil
	}
	cat, e := s.SourceCatalog(context.Background(), "anime-garden", "动画", "", false)
	if e != nil || len(cat.Items) != 1 {
		t.Fatalf("%+v %v", cat, e)
	}
	groups, e := s.SourceGroups(context.Background(), "anime-garden", "123", false)
	if e != nil || len(groups) != 1 || len(groups[0].Items) != 1 {
		t.Fatalf("%+v %v", groups, e)
	}
	u, _ := url.Parse(groups[0].URL)
	if u.Query().Get("fansub") != "A & B+中文" {
		t.Fatal(u)
	}
	d := validDraft()
	d.Source = "anime-garden"
	d.URL = groups[0].URL
	if e = Validate(&d); e != nil {
		t.Fatal(e)
	}
}
func TestGardenRSSNamespaceRejectsOtherWorks(t *testing.T) {
	s := New()
	s.Fetch = func(context.Context, string) ([]byte, error) {
		return []byte(`<rss xmlns:g="https://animes.garden/ns/rss/1.0"><channel><item><title>动画 - 01</title><g:subjectId>124</g:subjectId><enclosure url="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"/></item><item><title>动画 - 02</title><g:subjectId>123</g:subjectId><enclosure url="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234568"/></item></channel></rss>`), nil
	}
	p, e := s.Preview(context.Background(), validDraft())
	if e != nil || p.Accepted != 1 || p.Items[0].Accepted || !strings.Contains(p.Items[0].Reason, "其他") {
		t.Fatalf("%+v %v", p, e)
	}
}
func TestRSSLargeWindowNeverSilentlyTruncates(t *testing.T) {
	s := New()
	s.Fetch = func(context.Context, string) ([]byte, error) {
		var b strings.Builder
		b.WriteString("<rss><channel>")
		for i := 0; i < 301; i++ {
			fmt.Fprintf(&b, "<item><title>动画 - %04d</title></item>", i)
		}
		b.WriteString("</channel></rss>")
		return []byte(b.String()), nil
	}
	items, e := s.RSS(context.Background(), "https://example.com/rss")
	if e != nil || len(items) != 301 {
		t.Fatalf("%d %v", len(items), e)
	}
}
