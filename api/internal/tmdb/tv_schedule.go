package tmdb

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"mediahub/internal/tv"
)

// TVSchedule uses the native season episode dates, not an inferred weekday.
func (c *Client) TVSchedule(ctx context.Context, key, id string, season int) (tv.Metadata, error) {
	var show struct {
		Name    string `json:"name"`
		Seasons []struct {
			Number int `json:"season_number"`
		} `json:"seasons"`
		Poster string `json:"poster_path"`
	}
	if key == "" {
		return tv.Metadata{}, fmt.Errorf("请先配置 TMDB API Key；当前按每日搜索回退")
	}
	if err := c.get(ctx, key, "/tv/"+id, url.Values{}, 12*time.Hour, &show, nil, func() error {
		if show.Name == "" {
			return problem(502, "TMDB 剧集详情数据不完整")
		}
		return nil
	}); err != nil {
		return tv.Metadata{}, err
	}
	if season == 0 {
		out := tv.Metadata{Title: show.Name, Poster: show.Poster, Episodes: []tv.Episode{}}
		for _, entry := range show.Seasons {
			if entry.Number < 1 {
				continue
			}
			data, err := c.TVSchedule(ctx, key, id, entry.Number)
			if err != nil {
				return tv.Metadata{}, err
			}
			out.Episodes = append(out.Episodes, data.Episodes...)
		}
		return out, nil
	}
	var data struct {
		Episodes *[]struct {
			Number int    `json:"episode_number"`
			Name   string `json:"name"`
			Date   string `json:"air_date"`
		} `json:"episodes"`
	}
	if err := c.get(ctx, key, fmt.Sprintf("/tv/%s/season/%d", id, season), url.Values{}, 12*time.Hour, &data, nil, func() error {
		// Missing data is an upstream error; an explicit empty list is a valid
		// season without announced episodes and uses the normal daily fallback.
		if data.Episodes == nil {
			return problem(502, "TMDB 分季集数数据不完整")
		}
		return nil
	}); err != nil {
		return tv.Metadata{}, err
	}
	out := tv.Metadata{Title: show.Name, Poster: show.Poster, Episodes: []tv.Episode{}}
	for _, e := range *data.Episodes {
		if e.Number < 1 {
			continue
		}
		if e.Date != "" {
			if _, err := time.Parse("2006-01-02", e.Date); err != nil {
				e.Date = ""
			}
		}
		out.Episodes = append(out.Episodes, tv.Episode{Season: season, Number: e.Number, Name: e.Name, AirDate: e.Date})
	}
	return out, nil
}
