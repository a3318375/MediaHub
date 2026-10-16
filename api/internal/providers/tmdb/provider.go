package tmdb

import (
	"context"
	"errors"
	"mediahub/internal/discovery"
	"mediahub/internal/media"
	"mediahub/internal/providers/normalization"
	"mediahub/internal/providers/transport"
	legacy "mediahub/internal/tmdb"
	"net/http"
	"net/url"
	"strconv"
	"strings"
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
	return p.chart(ctx, name)
}

// Charts use native list endpoints or region-specific watch-provider discovery.
func (p *Provider) chart(ctx context.Context, name string) (discovery.Page, error) {
	path, kind, params, err := chartQuery(name)
	if err != nil {
		return discovery.Page{}, err
	}
	key, e := p.Key(ctx)
	if e != nil {
		return discovery.Page{}, e
	}
	v := url.Values{"api_key": {key}, "language": {"zh-CN"}}
	for k, values := range params {
		v[k] = values
	}
	req, e := http.NewRequestWithContext(ctx, "GET", p.Client.BaseURL+path+"?"+v.Encode(), nil)
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
			Overview      string  `json:"overview"`
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
		if kind != "" {
			r.Type = kind
		}
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
		s := media.Summary{Identity: legacy.Identity(r.Type, r.ID), Title: r.Title, Overview: normalization.PlainText(r.Overview), OriginalTitle: r.OriginalTitle, ReleaseDate: r.Date, PosterPath: r.Poster, Genres: []string{}, Ratings: []media.Rating{}}
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

// Names are validated before constructing upstream paths or cacheable requests.
func chartQuery(name string) (string, string, url.Values, error) {
	params := url.Values{}
	if name == "trending" {
		return "/trending/all/day", "", params, nil
	}
	paths := map[string][2]string{
		"movie_day": {"/trending/movie/day", "movie"}, "movie_week": {"/trending/movie/week", "movie"},
		"tv_day": {"/trending/tv/day", "tv"}, "tv_week": {"/trending/tv/week", "tv"},
		"movie_popular": {"/movie/popular", "movie"}, "tv_popular": {"/tv/popular", "tv"},
		"movie_top": {"/movie/top_rated", "movie"}, "tv_top": {"/tv/top_rated", "tv"},
		"movie_now": {"/movie/now_playing", "movie"}, "movie_upcoming": {"/movie/upcoming", "movie"},
		"tv_airing": {"/tv/airing_today", "tv"}, "tv_on_air": {"/tv/on_the_air", "tv"},
	}
	if def, ok := paths[name]; ok {
		return def[0], def[1], params, nil
	}
	parts := strings.Split(name, "_")
	if (len(parts) == 4 || len(parts) == 5) && parts[0] == "platform" && validPlatformQuery(parts[1], parts[2]) && discovery.ValidID(parts[3]) {
		monetization := "flatrate"
		if len(parts) == 5 {
			monetization = parts[4]
		}
		switch monetization {
		case "flatrate", "free", "ads", "rent", "buy":
		default:
			return "", "", nil, discovery.Unsupported("monetization")
		}
		params.Set("watch_region", parts[2])
		params.Set("with_watch_providers", parts[3])
		params.Set("with_watch_monetization_types", monetization)
		params.Set("sort_by", "popularity.desc")
		params.Set("include_adult", "false")
		return "/discover/" + parts[1], parts[1], params, nil
	}
	return "", "", nil, discovery.Unsupported("ranking")
}

func validPlatformQuery(kind, region string) bool {
	return (kind == "movie" || kind == "tv") && len(region) == 2 && region[0] >= 'A' && region[0] <= 'Z' && region[1] >= 'A' && region[1] <= 'Z'
}

func (p *Provider) Platforms(ctx context.Context, kind, region string) ([]discovery.Platform, error) {
	if !validPlatformQuery(kind, region) {
		return nil, discovery.Unsupported("mediaType/region")
	}
	key, e := p.Key(ctx)
	if e != nil {
		return nil, e
	}
	req, e := http.NewRequestWithContext(ctx, "GET", p.Client.BaseURL+"/watch/providers/"+kind+"?"+url.Values{"api_key": {key}, "language": {"zh-CN"}, "watch_region": {region}}.Encode(), nil)
	if e != nil {
		return nil, discovery.Invalid()
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
			ID   int    `json:"provider_id"`
			Name string `json:"provider_name"`
			Logo string `json:"logo_path"`
		} `json:"results"`
	}
	if e = client.JSON(req, &raw); e != nil {
		return nil, e
	}
	if raw.Results == nil {
		return nil, discovery.Invalid()
	}
	out := []discovery.Platform{}
	for _, r := range *raw.Results {
		if r.ID < 1 || r.Name == "" {
			continue
		}
		logo := ""
		if strings.HasPrefix(r.Logo, "/") && !strings.HasPrefix(r.Logo, "//") {
			logo = "https://image.tmdb.org/t/p/w92" + r.Logo
		}
		out = append(out, discovery.Platform{ID: r.ID, Name: r.Name, Logo: logo})
	}
	return out, nil
}
