package tv

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestChannelSearchPaginatesAndParsesProgressAndHiddenLinks(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/s/vip115hot" || r.URL.Query().Get("q") != "绿灯军团" {
			t.Error("unexpected channel query")
		}
		fmt.Fprint(w, `<div class="tgme_channel_info"></div>`)
		if r.URL.Query().Get("before") == "50" {
			fmt.Fprint(w, `<div class="tgme_widget_message"><div class="tgme_widget_message_text">名称：绿灯军团 (2026) S01E01 4K<br>115：<a href="https://115.com/s/first?password=abcd">提取资源</a><br>大小：5GB</div></div>`)
			return
		}
		fmt.Fprint(w, `<div class="tgme_widget_message"><div class="tgme_widget_message_text">名称：绿灯军团 (2026)【更03集】【4K】<br>描述：测试<br>115：<a href="https://115cdn.com/s/lights?password=abcd">点击获取</a><br>磁力：magnet:?xt=urn:btih:`+strings.Repeat("a", 40)+`<br>大小：6GB/集</div></div><a class="tme_messages_more" href="/s/vip115hot?before=50&amp;q=test">Earlier</a>`)
	}))
	defer server.Close()
	reader := NewChannelReader()
	reader.BaseURL = server.URL
	reader.HTTP = server.Client()
	d := Draft{Source: "tg", Title: "绿灯军团", TMDBID: "1", Season: 1, Rules: Rules{Channels: []string{"vip115hot"}, Match: "4K"}}
	items, err := reader.Search(context.Background(), d)
	if err != nil {
		t.Fatal(err)
	}
	got := Select(d, items)
	if calls != 2 || len(got) != 2 || got[1].CollectionEnd != 3 || got[1].Password != "abcd" || got[1].Cloud != "115" || !Covers(got[1], 2) {
		t.Fatalf("parsed resources: %+v calls=%d", got, calls)
	}
}

func TestLivePublicChannel(t *testing.T) {
	if os.Getenv("MEDIAHUB_TG_LIVE") != "1" {
		t.Skip("explicit opt-in to read public Telegram")
	}
	reader := NewChannelReader()
	reader.MaxPages = 2
	d := Draft{Source: "tg", TMDBID: "1", Title: "绿灯军团", Season: 1, Rules: Rules{Channels: []string{"vip115hot"}, Match: `^(?=.*绿灯军团)(?=.*(?:4K|2160P|UHD))(?=.*2026).*$`}}
	items, err := reader.Search(context.Background(), d)
	if err != nil {
		t.Fatal(err)
	}
	selected := Select(d, items)
	if len(selected) == 0 {
		t.Fatalf("no matched resources from %d candidates", len(items))
	}
	latest := 0
	for _, item := range selected {
		if item.Episode > latest {
			latest = item.Episode
		}
	}
	t.Logf("public channel: %d normalized candidates, %d selected resources, latest reported episode %d", len(items), len(selected), latest)
}

func TestChannelReaderRejectsUnavailablePreviewAndPanSouMode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `<html>View in Telegram</html>`) }))
	defer server.Close()
	reader := NewChannelReader()
	reader.BaseURL = server.URL
	reader.HTTP = server.Client()
	d := Draft{Source: "tg", TMDBID: "1", Title: "测试", Season: 1, Rules: Rules{Channels: []string{"vip115hot"}}}
	if _, err := reader.Search(context.Background(), d); err == nil {
		t.Fatal("unavailable preview reported as valid empty search")
	}
	d.Source = "pansou"
	if _, err := reader.Search(context.Background(), d); err == nil {
		t.Fatal("PanSou subscription searched directly in TG")
	}
}
