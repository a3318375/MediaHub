// Package tmdb implements only TMDB movie and TV metadata, using native pagination.
package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"media-center/internal/media"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Error struct {
	Status     int
	Message    string
	RetryAfter string
}

func (e *Error) Error() string                 { return e.Message }
func problem(status int, message string) error { return &Error{Status: status, Message: message} }

type entry struct {
	body    []byte
	expires time.Time
}
type Client struct {
	BaseURL string
	HTTP    *http.Client
	mu      sync.Mutex
	next    time.Time
	cache   map[string]entry
	slots   chan struct{}
}

func NewClient() *Client {
	return &Client{BaseURL: "https://api.themoviedb.org/3", HTTP: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, cache: map[string]entry{}, slots: make(chan struct{}, 2)}
}
func wait(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
func (c *Client) get(ctx context.Context, key, path string, q url.Values, ttl time.Duration, out any, fetched *time.Time, validate func() error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	// Credential digest separates cache entries after configuration changes; never store raw secrets.
	cacheKey := credentialHash(key) + path + "?" + q.Encode()
	c.mu.Lock()
	cached, ok := c.cache[cacheKey]
	c.mu.Unlock()
	if ok && time.Now().Before(cached.expires) {
		if fetched != nil {
			*fetched = cached.expires.Add(-ttl)
		}
		if err := json.Unmarshal(cached.body, out); err != nil {
			return problem(502, "TMDB 缓存格式异常")
		}
		return validate()
	}
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return ctx.Err()
	}
	for attempt := 0; attempt < 3; attempt++ {
		c.mu.Lock()
		delay := time.Until(c.next)
		if delay < 0 {
			delay = 0
		}
		c.next = time.Now().Add(delay + 250*time.Millisecond)
		c.mu.Unlock()
		if err := wait(ctx, delay); err != nil {
			return err
		}
		params := url.Values{}
		for k, v := range q {
			params[k] = v
		}
		params.Set("api_key", key)
		params.Set("language", "zh-CN")
		req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+path+"?"+params.Encode(), nil)
		if err != nil {
			return problem(502, "TMDB 请求失败")
		}
		resp, err := c.HTTP.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if e, ok := err.(interface{ Timeout() bool }); ok && e.Timeout() {
				return problem(504, "TMDB 请求超时")
			}
			return problem(502, "TMDB 连接失败")
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024*1024+1))
		resp.Body.Close()
		if readErr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if e, ok := readErr.(interface{ Timeout() bool }); ok && e.Timeout() {
				return problem(504, "TMDB 请求超时")
			}
			return problem(502, "TMDB 响应读取失败")
		}
		if resp.StatusCode == 429 || resp.StatusCode >= 500 {
			delay = time.Duration(1<<attempt) * 250 * time.Millisecond
			if seconds, e := strconv.Atoi(resp.Header.Get("Retry-After")); e == nil && seconds > 0 {
				if seconds > 3600 {
					seconds = 3600
				}
				delay = time.Duration(seconds) * time.Second
			} else if retryAt, e := http.ParseTime(resp.Header.Get("Retry-After")); e == nil && time.Until(retryAt) > delay {
				delay = time.Until(retryAt)
			}
			if attempt < 2 && delay <= 2*time.Second {
				if err := wait(ctx, delay); err != nil {
					return err
				}
				continue
			}
			if resp.StatusCode == 429 {
				retry := int(delay.Seconds()) + 1
				if retry < 1 {
					retry = 1
				}
				if retry > 3600 {
					retry = 3600
				}
				return &Error{503, "TMDB 暂时限流，请稍后重试", strconv.Itoa(retry)}
			}
			return problem(502, "TMDB 服务暂不可用")
		}
		if resp.StatusCode == 404 {
			return problem(404, "未找到媒体条目")
		}
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			return problem(503, "TMDB 配置不可用，请检查 API Key")
		}
		if resp.StatusCode != 200 {
			return problem(502, "TMDB 请求失败")
		}
		if len(body) > 1024*1024 || json.Unmarshal(body, out) != nil {
			return problem(502, "TMDB 返回格式异常")
		}
		if err := validate(); err != nil {
			return err
		}
		c.mu.Lock()
		if len(c.cache) >= 128 {
			c.cache = map[string]entry{}
		}
		now := time.Now()
		c.cache[cacheKey] = entry{body, now.Add(ttl)}
		if fetched != nil {
			*fetched = now
		}
		c.mu.Unlock()
		return nil
	}
	return problem(502, "TMDB 请求失败")
}

type Query struct {
	Type                              string
	Page                              int
	Genre, Region, Year, Sort, Search string
}

func (q Query) Validate() error {
	if q.Type != "movie" && q.Type != "tv" {
		return problem(400, "mediaType 必须为 movie 或 tv")
	}
	if q.Page < 1 || q.Page > 500 {
		return problem(400, "page 必须为 1 到 500")
	}
	if q.Sort != "" && q.Sort != "popularity.desc" && q.Sort != "vote_average.desc" && q.Sort != "date.desc" {
		return problem(400, "不支持的排序")
	}
	if q.Genre != "" {
		valid := false
		for _, id := range genreIDs(q.Type) {
			if strconv.Itoa(id) == q.Genre {
				valid = true
			}
		}
		if !valid {
			return problem(400, "不支持的类型筛选")
		}
	}
	if q.Region != "" {
		switch q.Region {
		case "CN", "HK", "TW", "JP", "KR", "US", "GB":
		default:
			return problem(400, "不支持的产地")
		}
	}
	if q.Year != "" {
		y, e := strconv.Atoi(q.Year)
		if e != nil || y < 1870 || y > 2100 {
			return problem(400, "年份无效")
		}
	}
	if len([]rune(q.Search)) > 200 {
		return problem(400, "搜索词过长")
	}
	if q.Search != "" && (q.Genre != "" || q.Region != "" || q.Sort != "" && q.Sort != "popularity.desc") {
		return problem(400, "搜索不支持类型、产地或排序筛选")
	}
	return nil
}

type Page struct {
	Items     []media.Summary `json:"items"`
	Page      int             `json:"page"`
	PageSize  int             `json:"pageSize"`
	Total     *int            `json:"total"`
	HasMore   bool            `json:"hasMore"`
	Source    string          `json:"source"`
	FetchedAt string          `json:"fetchedAt"`
	Stale     bool            `json:"stale"`
}
type record struct {
	ID                  int      `json:"id"`
	Title               string   `json:"title"`
	Name                string   `json:"name"`
	OriginalTitle       string   `json:"original_title"`
	OriginalName        string   `json:"original_name"`
	Date                string   `json:"release_date"`
	AirDate             string   `json:"first_air_date"`
	Overview            string   `json:"overview"`
	Language            string   `json:"original_language"`
	Countries           []string `json:"origin_country"`
	ProductionCountries []struct {
		Code string `json:"iso_3166_1"`
	} `json:"production_countries"`
	Poster   *string `json:"poster_path"`
	Backdrop *string `json:"backdrop_path"`
	Vote     float64 `json:"vote_average"`
	Votes    int64   `json:"vote_count"`
	GenreIDs []int   `json:"genre_ids"`
	Genres   []struct {
		ID   int
		Name string
	} `json:"genres"`
	Runtime *int   `json:"runtime"`
	Status  string `json:"status"`
	Tagline string `json:"tagline"`
	Credits struct {
		Cast []struct {
			ID          int
			Name        string
			Character   string
			ProfilePath *string `json:"profile_path"`
		}
		Crew []struct {
			ID          int
			Name        string
			Job         string
			ProfilePath *string `json:"profile_path"`
		}
	} `json:"credits"`
	Seasons []struct {
		Number int  `json:"season_number"`
		Count  *int `json:"episode_count"`
		Name   string
	} `json:"seasons"`
}

func Identity(kind string, id int) media.Identity {
	s := strconv.Itoa(id)
	return media.Identity{MediaID: "tmdb:" + kind + ":" + s, Source: media.SourceTMDB, SourceID: s, Provider: media.SourceTMDB, ProviderID: s, MediaType: media.Type(kind)}
}
func normalize(r record, kind string) (media.Summary, error) {
	if r.ID <= 0 {
		return media.Summary{}, problem(502, "TMDB 媒体标识异常")
	}
	if kind == "tv" {
		r.Title = r.Name
		r.OriginalTitle = r.OriginalName
		r.Date = r.AirDate
	}
	if r.Title == "" {
		return media.Summary{}, problem(502, "TMDB 标题缺失")
	}
	s := media.Summary{Identity: Identity(kind, r.ID), Title: r.Title, OriginalTitle: r.OriginalTitle, ReleaseDate: r.Date, Overview: r.Overview, OriginalLanguage: r.Language, OriginCountries: r.Countries, PosterPath: r.Poster, BackdropPath: r.Backdrop, Genres: []string{}, Ratings: []media.Rating{}}
	if len(r.Date) >= 4 {
		if y, e := strconv.Atoi(r.Date[:4]); e == nil {
			s.Year = &y
		}
	}
	for _, g := range r.Genres {
		s.Genres = append(s.Genres, g.Name)
	}
	if len(r.Genres) == 0 {
		for _, id := range r.GenreIDs {
			for name, gid := range genreIDs(kind) {
				if id == gid {
					s.Genres = append(s.Genres, name)
				}
			}
		}
	}
	if r.Votes > 0 {
		s.Ratings = append(s.Ratings, media.Rating{Source: media.SourceTMDB, Value: r.Vote, VoteCount: r.Votes})
	}
	return s, nil
}
func (c *Client) Discover(ctx context.Context, key string, q Query) (Page, error) {
	p := Page{Items: []media.Summary{}, Page: q.Page, PageSize: 20, Source: "tmdb"}
	if err := q.Validate(); err != nil {
		return p, err
	}
	v := url.Values{"page": {strconv.Itoa(q.Page)}, "include_adult": {"false"}}
	path := "/discover/" + q.Type
	if q.Search != "" {
		path = "/search/" + q.Type
		v.Set("query", q.Search)
	} else {
		sort := q.Sort
		if sort == "" {
			sort = "popularity.desc"
		}
		if sort == "date.desc" {
			sort = "primary_release_date.desc"
			if q.Type == "tv" {
				sort = "first_air_date.desc"
			}
		}
		v.Set("sort_by", sort)
		if q.Genre != "" {
			v.Set("with_genres", q.Genre)
		}
		if q.Region != "" {
			v.Set("with_origin_country", q.Region)
		}
	}
	if q.Year != "" {
		param := "primary_release_year"
		if q.Search != "" {
			param = "year"
		}
		if q.Type == "tv" {
			param = "first_air_date_year"
		}
		v.Set(param, q.Year)
	}
	var raw struct {
		Results *[]record `json:"results"`
		Page    *int      `json:"page"`
		Total   *int      `json:"total_results"`
		Pages   *int      `json:"total_pages"`
	}
	var fetched time.Time
	if err := c.get(ctx, key, path, v, 30*time.Minute, &raw, &fetched, func() error {
		if raw.Results == nil || raw.Page == nil || *raw.Page != q.Page || raw.Total != nil && *raw.Total < 0 || raw.Pages == nil || *raw.Pages < 0 {
			return problem(502, "TMDB 分页格式异常")
		}
		for _, r := range *raw.Results {
			if _, err := normalize(r, q.Type); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return p, err
	}
	p.Total = raw.Total
	p.HasMore = *raw.Page < *raw.Pages && q.Page < 500
	for _, r := range *raw.Results {
		s, e := normalize(r, q.Type)
		if e != nil {
			return p, e
		}
		p.Items = append(p.Items, s)
	}
	p.FetchedAt = fetched.UTC().Format(time.RFC3339)
	return p, nil
}
func (c *Client) Detail(ctx context.Context, key, kind, id string) (media.Detail, error) {
	if err := (Query{Type: kind, Page: 1}).Validate(); err != nil {
		return media.Detail{}, err
	}
	n, e := strconv.Atoi(id)
	if e != nil || n <= 0 || strconv.Itoa(n) != id {
		return media.Detail{}, problem(400, "providerId 必须为正整数")
	}
	var r record
	if err := c.get(ctx, key, "/"+kind+"/"+id, url.Values{"append_to_response": {"credits"}}, 24*time.Hour, &r, nil, func() error {
		if r.ID != n {
			return problem(502, "TMDB 标识不匹配")
		}
		_, err := normalize(r, kind)
		return err
	}); err != nil {
		return media.Detail{}, err
	}
	if r.ID != n {
		return media.Detail{}, problem(502, "TMDB 标识不匹配")
	}
	s, err := normalize(r, kind)
	if err != nil {
		return media.Detail{}, err
	}
	if kind == "movie" && len(r.ProductionCountries) > 0 {
		countries := []string{}
		for _, country := range r.ProductionCountries {
			if country.Code != "" {
				countries = append(countries, country.Code)
			}
		}
		if len(countries) > 0 {
			s.OriginCountries = countries
		}
	}
	var external struct {
		ID   int    `json:"id"`
		IMDb string `json:"imdb_id"`
	}
	externalErr := c.get(ctx, key, "/"+kind+"/"+id+"/external_ids", url.Values{}, 24*time.Hour, &external, nil, func() error {
		if external.ID != n {
			return problem(502, "TMDB 外部标识格式异常")
		}
		return nil
	})
	d := media.Detail{Summary: s, RuntimeMinutes: r.Runtime, Status: r.Status, Tagline: r.Tagline, Credits: []media.Credit{}, Seasons: []media.Season{}}
	d.Region = strings.Join(s.OriginCountries, ",")
	if externalErr == nil && external.IMDb != "" {
		d.ExternalIDs = &media.ExternalIDs{IMDb: external.IMDb, TMDB: id}
	}
	for i, p := range r.Credits.Cast {
		if i >= 16 {
			break
		}
		d.Credits = append(d.Credits, media.Credit{Name: p.Name, Role: p.Character, PersonID: fmt.Sprint(p.ID), ProfilePath: p.ProfilePath})
	}
	for _, p := range r.Credits.Crew {
		if p.Job == "Director" {
			d.Credits = append(d.Credits, media.Credit{Name: p.Name, Role: p.Job, PersonID: fmt.Sprint(p.ID), ProfilePath: p.ProfilePath})
		}
	}
	for _, s := range r.Seasons {
		d.Seasons = append(d.Seasons, media.Season{SeasonNumber: s.Number, EpisodeCount: s.Count, Name: s.Name})
	}
	return d, nil
}
func genreIDs(kind string) map[string]int {
	m := map[string]int{"动画": 16, "喜剧": 35, "犯罪": 80, "纪录": 99, "剧情": 18, "家庭": 10751, "悬疑": 9648, "西部": 37}
	if kind == "movie" {
		for k, v := range map[string]int{"动作": 28, "冒险": 12, "奇幻": 14, "历史": 36, "恐怖": 27, "音乐": 10402, "爱情": 10749, "科幻": 878, "惊悚": 53, "战争": 10752} {
			m[k] = v
		}
	} else {
		for k, v := range map[string]int{"动作冒险": 10759, "科幻奇幻": 10765, "儿童": 10762, "新闻": 10763, "真人秀": 10764, "肥皂剧": 10766, "脱口秀": 10767, "战争政治": 10768} {
			m[k] = v
		}
	}
	return m
}
