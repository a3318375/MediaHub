package pansoubridge

import (
	"context"
	"time"

	"pansou/config"
	"pansou/model"
	"pansou/plugin"
)

type resourceLink struct {
	Cloud     string     `json:"cloud"`
	URL       string     `json:"url"`
	Password  string     `json:"password,omitempty"`
	Note      string     `json:"note,omitempty"`
	Source    string     `json:"source,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}
type resourceItem struct {
	Title       string         `json:"title"`
	Description string         `json:"description,omitempty"`
	Channel     string         `json:"channel,omitempty"`
	UpdatedAt   *time.Time     `json:"updatedAt,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
	Links       []resourceLink `json:"links,omitempty"`
}
type searchData struct {
	Total        int                       `json:"total"`
	Items        []resourceItem            `json:"items,omitempty"`
	LinksByCloud map[string][]resourceLink `json:"linksByCloud,omitempty"`
}
type searchService interface {
	Search(string, []string, int, bool, string, string, []string, []string, map[string]interface{}) (model.SearchResponse, error)
}

type searchAdapter struct{ service searchService }

// Search translates Media Center concepts to PanSou arguments and maps upstream
// data into a stable local DTO. No PanSou HTTP contract is exposed.
func (a searchAdapter) Search(ctx context.Context, keyword, source string, cloudTypes, plugins, channels []string, mode string, refresh bool) (searchData, error) {
	// PanSou's HTTP handler fills default channels before calling the service.
	// The in-process bridge must do the same; an empty slice searches no TG channels.
	if len(channels) == 0 && source != "plugin" && config.AppConfig != nil {
		channels = append([]string(nil), config.AppConfig.DefaultChannels...)
	}
	// Match the PanSou Web request, including the result-shaping ext/cache namespace.
	ext := map[string]interface{}{"refresh": refresh, "referer": "https://dm.xueximeng.com", plugin.ExtContextKey: ctx}
	panSouMode := mode
	if mode == "merge" {
		panSouMode = "merged_by_type"
	}
	resp, err := a.service.Search(keyword, channels, 0, refresh, panSouMode, source, plugins, cloudTypes, ext)
	if err != nil {
		return searchData{}, err
	}
	return mapSearchResponse(resp), nil
}

func mapSearchResponse(resp model.SearchResponse) searchData {
	data := searchData{Total: resp.Total, Items: make([]resourceItem, 0, len(resp.Results)), LinksByCloud: make(map[string][]resourceLink, len(resp.MergedByType))}
	for _, item := range resp.Results {
		out := resourceItem{Title: item.Title, Description: item.Content, Channel: item.Channel, UpdatedAt: optionalTime(item.Datetime), Tags: item.Tags}
		for _, link := range item.Links {
			out.Links = append(out.Links, resourceLink{Cloud: link.Type, URL: link.URL, Password: link.Password, UpdatedAt: optionalTime(link.Datetime)})
		}
		data.Items = append(data.Items, out)
	}
	for cloud, links := range resp.MergedByType {
		for _, link := range links {
			data.LinksByCloud[cloud] = append(data.LinksByCloud[cloud], resourceLink{Cloud: cloud, URL: link.URL, Password: link.Password, Note: link.Note, Source: link.Source, UpdatedAt: optionalTime(link.Datetime)})
		}
	}
	return data
}

func optionalTime(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

func emptySearchData() searchData {
	return searchData{Items: []resourceItem{}, LinksByCloud: map[string][]resourceLink{}}
}
