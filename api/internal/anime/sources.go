package anime

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

func ValidateSourceURL(d Draft) error {
	u, e := FeedURL(d.URL)
	if e != nil {
		return e
	}
	switch d.Source {
	case "ani-bt":
		if u.Scheme != "https" || u.Host != "anibt.net" || u.Path != "/rss/anime.xml" || !ValidID(u.Query().Get("bgmId")) || u.Query().Get("bgmId") != d.BangumiID {
			return fmt.Errorf("AniBT 请使用包含匹配 bgmId 的单番剧 RSS")
		}
	case "anime-garden":
		if u.Scheme != "https" || u.Host != "api.animes.garden" || u.Path != "/feed.xml" || !ValidID(u.Query().Get("subject")) || u.Query().Get("subject") != d.BangumiID {
			return fmt.Errorf("AnimeGarden 请使用包含匹配 subject 的单番剧 RSS")
		}
	}
	return nil
}

type scalarID string

func (s *scalarID) UnmarshalJSON(b []byte) error {
	var text string
	if e := json.Unmarshal(b, &text); e == nil {
		*s = scalarID(text)
		return nil
	}
	var n json.Number
	if e := json.Unmarshal(b, &n); e != nil {
		return e
	}
	*s = scalarID(n.String())
	return nil
}
func (s *Service) SourceCatalog(ctx context.Context, source, query, season string, refresh bool) (Catalog, error) {
	out := Catalog{Items: []CatalogItem{}, Seasons: []string{}}
	if len([]rune(query)) > 100 || len(season) > 40 {
		return out, fmt.Errorf("搜索参数过长")
	}
	if source == "ani-bt" {
		params := url.Values{"query": {query}, "season": {season}}
		b, e := s.cached(ctx, "https://anibt.net/api/seasons/anime?"+params.Encode(), time.Hour, refresh)
		if e != nil {
			return out, e
		}
		var result struct {
			Data *struct {
				AvailableSeasons []string `json:"availableSeasons"`
				ByWeekday        []struct {
					Label  string `json:"weekdayLabel"`
					Animes []struct {
						BGM   scalarID `json:"bgmId"`
						Cover string   `json:"cover"`
						Title struct {
							Chinese string `json:"chinese"`
							Primary string `json:"primary"`
						} `json:"title"`
					} `json:"animes"`
				} `json:"byWeekday"`
			} `json:"data"`
		}
		if e = json.Unmarshal(b, &result); e != nil || result.Data == nil {
			return out, fmt.Errorf("AniBT 目录响应无效")
		}
		out.Seasons = result.Data.AvailableSeasons
		for _, day := range result.Data.ByWeekday {
			for _, item := range day.Animes {
				if !ValidID(string(item.BGM)) {
					continue
				}
				title := item.Title.Chinese
				if title == "" {
					title = item.Title.Primary
				}
				out.Items = append(out.Items, CatalogItem{ID: string(item.BGM), Title: title, Poster: item.Cover, Week: day.Label})
			}
		}
	} else if source == "anime-garden" {
		b, e := s.cached(ctx, "https://api.animes.garden/subjects", time.Hour, refresh)
		if e != nil {
			return out, e
		}
		var result struct {
			Subjects []struct {
				ID    scalarID `json:"id"`
				Name  string   `json:"name"`
				Cover string   `json:"cover"`
			} `json:"subjects"`
		}
		if e = json.Unmarshal(b, &result); e != nil || result.Subjects == nil {
			return out, fmt.Errorf("AnimeGarden 目录响应无效")
		}
		for _, item := range result.Subjects {
			if !ValidID(string(item.ID)) {
				continue
			}
			if query != "" && !strings.Contains(strings.ToLower(item.Name), strings.ToLower(query)) && string(item.ID) != query {
				continue
			}
			out.Items = append(out.Items, CatalogItem{ID: string(item.ID), Title: item.Name, Poster: item.Cover})
		}
	} else {
		return out, fmt.Errorf("此来源没有目录浏览")
	}
	if len(out.Items) > 1000 {
		return out, fmt.Errorf("目录超过 1000 条，请缩小查询范围")
	}
	if out.Seasons == nil {
		out.Seasons = []string{}
	}
	return out, nil
}
func (s *Service) SourceGroups(ctx context.Context, source, id string, refresh bool) ([]Group, error) {
	if !ValidID(id) {
		return nil, fmt.Errorf("Bangumi ID 无效")
	}
	out := []Group{}
	if source == "ani-bt" {
		b, e := s.cached(ctx, "https://anibt.net/api/anime/groups?bgmId="+url.QueryEscape(id), 15*time.Minute, refresh)
		if e != nil {
			return nil, e
		}
		var result struct {
			Data *struct {
				Groups []struct {
					Name  string `json:"name"`
					Slug  string `json:"slug"`
					Items []struct {
						Title     string `json:"title"`
						Magnet    string `json:"magnet"`
						Published int64  `json:"publishedAt"`
						Size      int64  `json:"size"`
					} `json:"items"`
				} `json:"groups"`
			} `json:"data"`
		}
		if e = json.Unmarshal(b, &result); e != nil || result.Data == nil {
			return nil, fmt.Errorf("AniBT 字幕组响应无效")
		}
		for _, g := range result.Data.Groups {
			if g.Slug == "" || len(g.Slug) > 200 {
				continue
			}
			group := Group{Label: g.Name, BangumiID: id, URL: "https://anibt.net/rss/anime.xml?" + url.Values{"bgmId": {id}, "groupSlug": {g.Slug}}.Encode(), Items: []Entry{}}
			for _, it := range g.Items {
				date := ""
				if it.Published > 0 {
					date = time.UnixMilli(it.Published).UTC().Format(time.RFC3339)
				}
				entry := Entry{Title: it.Title, URL: it.Magnet, PublishedAt: date, ContentLength: it.Size, BangumiID: id}
				DescribeResource(&entry, false)
				group.Items = append(group.Items, entry)
			}
			out = append(out, group)
		}
	} else if source == "anime-garden" {
		b, e := s.cached(ctx, "https://api.animes.garden/resources?"+url.Values{"subject": {id}, "pageSize": {"200"}, "duplicate": {"false"}}.Encode(), 15*time.Minute, refresh)
		if e != nil {
			return nil, e
		}
		var result struct {
			Resources []struct {
				Title     string   `json:"title"`
				Magnet    string   `json:"magnet"`
				Href      string   `json:"href"`
				CreatedAt string   `json:"createdAt"`
				Size      int64    `json:"size"`
				SubjectID scalarID `json:"subjectId"`
				Fansub    *struct {
					Name string `json:"name"`
				} `json:"fansub"`
			} `json:"resources"`
		}
		if e = json.Unmarshal(b, &result); e != nil || result.Resources == nil {
			return nil, fmt.Errorf("AnimeGarden 资源响应无效")
		}
		groups := map[string]*Group{}
		for _, it := range result.Resources {
			if it.Fansub == nil || it.Fansub.Name == "" || len(it.Fansub.Name) > 200 || string(it.SubjectID) != id {
				continue
			}
			name := it.Fansub.Name
			g := groups[name]
			if g == nil {
				g = &Group{Label: name, BangumiID: id, URL: "https://api.animes.garden/feed.xml?" + url.Values{"subject": {id}, "fansub": {name}}.Encode(), Items: []Entry{}}
				groups[name] = g
			}
			entry := Entry{Title: it.Title, URL: it.Magnet, DetailURL: it.Href, PublishedAt: it.CreatedAt, ContentLength: it.Size, BangumiID: id}
			DescribeResource(&entry, false)
			g.Items = append(g.Items, entry)
		}
		for _, g := range groups {
			out = append(out, *g)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	} else {
		return nil, fmt.Errorf("来源不支持字幕组")
	}
	if len(out) > 200 {
		return nil, fmt.Errorf("字幕组超过 200 个")
	}
	for i := range out {
		titles := []string{}
		for _, it := range out[i].Items {
			titles = append(titles, it.Title)
		}
		out[i].GroupRegex = BuildGroupRegex(titles)
		if len(out[i].Items) > 200 {
			out[i].Items = out[i].Items[:200]
		}
	}
	return out, nil
}
