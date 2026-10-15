package pansoubridge

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"pansou/model"

	"media-center/internal/tv"
)

type tvSearchFixture struct{ captureSearch }

func (f *tvSearchFixture) Search(keyword string, channels []string, concurrency int, refresh bool, mode, source string, plugins, clouds []string, ext map[string]interface{}) (model.SearchResponse, error) {
	_, _ = f.captureSearch.Search(keyword, channels, concurrency, refresh, mode, source, plugins, clouds, ext)
	return model.SearchResponse{Results: []model.SearchResult{{Title: "剧集 S01E01 4K", Content: "5 GB", Channel: "my_channel", Links: []model.Link{{Type: "115", URL: "https://115.com/s/one", Password: "abcd"}}}}}, nil
}

func TestTVSearchUsesGlobalPanSouSettingsAndPreservesResourceFields(t *testing.T) {
	bridge, _, _ := testConfiguredBridge(t)
	fake := &tvSearchFixture{}
	bridge.adapter.service = fake
	items, err := bridge.SearchTV(context.Background(), tv.Draft{Source: "pansou", Title: "剧集", Season: 1, Rules: tv.Rules{Channels: []string{"ignored_subscription_channel"}}})
	if err != nil {
		t.Fatal(err)
	}
	if fake.args[5] != "all" || len(fake.args[6].([]string)) == 0 || !reflect.DeepEqual(fake.args[1], []string{"default_channel"}) {
		t.Fatalf("channel scoping lost: %+v", fake.args)
	}
	if len(items) != 1 || items[0].Password != "abcd" || items[0].Size != 5*1024*1024*1024 || items[0].Channel != "my_channel" {
		t.Fatalf("fields lost: %+v", items)
	}
}

func TestTVSearchRejectsDirectTGSubscription(t *testing.T) {
	bridge, _, fake := testConfiguredBridge(t)
	if _, err := bridge.SearchTV(context.Background(), tv.Draft{Source: "tg"}); err == nil {
		t.Fatal("TG routed through PanSou")
	}
	if len(fake.args) > 0 {
		t.Fatal("PanSou called for TG subscription")
	}
}

func TestTVSearchRespectsDisabledDefaultSources(t *testing.T) {
	bridge, db, fake := testConfiguredBridge(t)
	if err := db.SaveSettings("pansou", map[string]json.RawMessage{"pansou.channels": json.RawMessage(`[]`), "pansou.plugins": json.RawMessage(`[]`)}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := bridge.SearchTV(context.Background(), tv.Draft{Title: "剧集"}); err == nil {
		t.Fatal("disabled sources fell back to all")
	}
	if len(fake.args) > 0 {
		t.Fatal("disabled sources still searched")
	}
}

func TestTVDoesNotMixEpisodeOrSizeAcrossMultiWorkMessage(t *testing.T) {
	data := mapSearchResponse(model.SearchResponse{Results: []model.SearchResult{{Title: "作品甲 S01E01", Content: "作品甲 S01E01 2GB / 作品乙 S01E02 80GB", Links: []model.Link{
		{Type: "115", URL: "https://115.com/s/aaaa", WorkTitle: "作品甲 S01E01 2GB"},
		{Type: "115", URL: "https://115.com/s/bbbb", WorkTitle: "作品乙 S01E02 80GB"},
		{Type: "115", URL: "https://115.com/s/cccc"},
	}}}})
	items := tvCandidates(data)
	if len(items) != 2 || items[0].Size != 2*1024*1024*1024 || items[1].Size != 80*1024*1024*1024 {
		t.Fatalf("message blocks mixed: %+v", items)
	}
	chosen := tv.Select(tv.Draft{Season: 1, Rules: tv.Rules{Match: "作品甲"}}, items)
	if len(chosen) != 1 || chosen[0].Episode != 1 || chosen[0].URL != "https://115.com/s/aaaa" {
		t.Fatalf("wrong work matched: %+v", chosen)
	}
}
