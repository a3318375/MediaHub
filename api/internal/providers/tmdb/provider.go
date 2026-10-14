package tmdb

import (
	"context"
	"errors"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/normalization"
	"media-center/internal/providers/transport"
	legacy "media-center/internal/tmdb"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

type Provider struct {
	mu        sync.Mutex
	Transport *transport.Client
	Client    *legacy.Client
	Key       func(context.Context) (string, error)
}

func (p *Provider) Capabilities() discovery.Capabilities {
	c := discovery.NewCapabilities("tmdb", "TMDB", []string{"movie", "tv"}, []string{"popularity.desc", "vote_average.desc", "date.desc"}, 20, 20001)
	c.Filters.Year = &discovery.YearRange{Min: 1870, Max: 2100}
	c.Filters.Region = []string{"CN", "HK", "TW", "JP", "KR", "US", "GB"}
	c.Filters.Genre = []string{"16", "35", "80", "99", "18", "10751", "9648", "37", "28", "12", "14", "36", "27", "10402", "10749", "878", "53", "10752", "10759", "10765", "10762", "10763", "10764", "10766", "10767", "10768"}
	return c
}
func query(q discovery.Query) legacy.Query {
	return legacy.Query{Type: q.MediaType, Page: q.Page, Genre: q.Genre, Region: q.Region, Year: q.Year, Sort: q.Sort, Search: q.Search}
}
func (p *Provider) Validate(q discovery.Query) error {
	if q.PageSize != 20 || q.Month != "" || q.Season != "" || q.Status != "" || q.Locale != "zh-CN" && q.Locale != "" {
		return discovery.Unsupported("pageSize/month/season/status/locale")
	}
	return query(q).Validate()
}
func (p *Provider) Discover(ctx context.Context, q discovery.Query) (discovery.Page, error) {
	key, e := p.Key(ctx)
	if e != nil {
		return discovery.Page{}, e
	}
	v, e := p.Client.Discover(ctx, key, query(q))
	for i := range v.Items {
		v.Items[i].Overview = normalization.PlainText(v.Items[i].Overview)
	}
	return discovery.Page{Items: v.Items, Page: v.Page, PageSize: v.PageSize, Total: v.Total, HasMore: v.HasMore, Source: v.Source, FetchedAt: v.FetchedAt, Stale: v.Stale}, translate(e)
}
func (p *Provider) Detail(ctx context.Context, kind, id, locale string) (media.Detail, error) {
	key, e := p.Key(ctx)
	if e != nil {
		return media.Detail{}, e
	}
	d, e := p.Client.Detail(ctx, key, kind, id)
	d.Overview = normalization.PlainText(d.Overview)
	return d, translate(e)
}
func (p *Provider) Ranking(ctx context.Context, name string) (discovery.Page, error) {
	if name != "trending" {
		return discovery.Page{}, discovery.Unsupported("ranking")
	}
	return p.trending(ctx)
}

// Trending uses the native endpoint; the established legacy discover/detail client stays untouched.
func (p *Provider) trending(ctx context.Context) (discovery.Page, error) {
	key, e := p.Key(ctx)
	if e != nil {
		return discovery.Page{}, e
	}
	v := url.Values{"api_key": {key}, "language": {"zh-CN"}}
	req, e := http.NewRequestWithContext(ctx, "GET", p.Client.BaseURL+"/trending/all/day?"+v.Encode(), nil)
	if e != nil {
		return discovery.Page{}, discovery.Invalid()
	}
	p.mu.Lock()
	if p.Transport == nil {
		p.Transport = transport.New(250*time.Millisecond, 2)
		p.Transport.HTTP = p.Client.HTTP
	}
	client := p.Transport
	p.mu.Unlock()
	var raw struct {
		Results *[]struct {
			ID            int     `json:"id"`
			Type          string  `json:"media_type"`
			Title         string  `json:"title"`
			Name          string  `json:"name"`
			OriginalTitle string  `json:"original_title"`
			OriginalName  string  `json:"original_name"`
			Date          string  `json:"release_date"`
			AirDate       string  `json:"first_air_date"`
			Poster        *string `json:"poster_path"`
			Vote          float64 `json:"vote_average"`
			Votes         int64   `json:"vote_count"`
		} `json:"results"`
		Total *int `json:"total_results"`
		Pages *int `json:"total_pages"`
	}
	if e = client.JSON(req, &raw); e != nil {
		return discovery.Page{}, e
	}
	if raw.Results == nil || raw.Pages == nil || *raw.Pages < 0 || raw.Total != nil && *raw.Total < 0 {
		return discovery.Page{}, discovery.Invalid()
	}
	page := discovery.Page{Items: []media.Summary{}, Source: "tmdb", Page: 1, PageSize: 20, Total: raw.Total, HasMore: *raw.Pages > 1}
	for _, r := range *raw.Results {
		if r.Type != "movie" && r.Type != "tv" {
			continue
		}
		if r.Type == "tv" {
			r.Title = r.Name
			r.OriginalTitle = r.OriginalName
			r.Date = r.AirDate
		}
		if r.ID < 1 || r.Title == "" {
			return page, discovery.Invalid()
		}
		s := media.Summary{Identity: legacy.Identity(r.Type, r.ID), Title: r.Title, OriginalTitle: r.OriginalTitle, ReleaseDate: r.Date, PosterPath: r.Poster, Genres: []string{}, Ratings: []media.Rating{}}
		if len(r.Date) >= 4 {
			if y, e := strconv.Atoi(r.Date[:4]); e == nil {
				s.Year = &y
			}
		}
		if r.Votes > 0 {
			s.Ratings = append(s.Ratings, media.Rating{Source: media.SourceTMDB, Value: r.Vote, VoteCount: r.Votes})
		}
		page.Items = append(page.Items, s)
	}
	page.TotalCapped = page.Total != nil && *page.Total >= 20001
	return page, nil
}

func translate(err error) error {
	var e *legacy.Error
	if errors.As(err, &e) {
		return &discovery.Error{Status: e.Status, Message: e.Message, RetryAfter: e.RetryAfter}
	}
	return err
}
