package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/transport"
	"net/http"
	sortutil "sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const fields = `id title { native english romaji } synonyms description averageScore popularity startDate { year month day } coverImage { large } genres status season seasonYear countryOfOrigin`

type titleEntry struct {
	ID       int      `json:"id"`
	Title    string   `json:"title"`
	Synonyms []string `json:"synonyms"`
}
type Provider struct {
	verifiedSorts                               map[string]bool
	probeUntil                                  time.Time
	probeFlight                                 chan struct{}
	BaseURL, ProxyURL, DatasetURL               string
	Transport, ProxyTransport, DatasetTransport *transport.Client
	mu                                          sync.Mutex
	index                                       []titleEntry
	indexUntil                                  time.Time
	indexFlight                                 chan struct{}
	indexErr                                    error
}

func New() *Provider {
	return &Provider{BaseURL: "https://graphql.anilist.co", ProxyURL: "https://trace.moe/anilist/", DatasetURL: "https://raw.githubusercontent.com/soruly/anilist-chinese/master/anilist-chinese.json", Transport: transport.New(2*time.Second, 1), ProxyTransport: transport.New(2*time.Second, 1), DatasetTransport: transport.New(time.Second, 1)}
}
func (p *Provider) Capabilities() discovery.Capabilities {
	c := discovery.NewCapabilities("anilist", "AniList", []string{"anime"}, nil, 50, 5000)
	c.Filters.Genre = []string{"Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Hentai", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"}
	c.Filters.Season = []string{"WINTER", "SPRING", "SUMMER", "FALL"}
	c.Filters.Status = []string{"FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"}
	c.Filters.Region = []string{"JP", "CN", "KR", "US", "TW"}
	c.Filters.Year = &discovery.YearRange{Min: 1900, Max: 2100}
	p.mu.Lock()
	c.Filters.Sort = []string{}
	for _, sort := range []string{"POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC"} {
		if p.verifiedSorts[sort] {
			c.Filters.Sort = append(c.Filters.Sort, sort)
		}
	}
	c.SupportsRanking = p.verifiedSorts["POPULARITY_DESC"]
	p.mu.Unlock()
	c.Available, c.UnavailableReason = p.Transport.Availability()
	return c
}

// Each sort is advertised only after its native upstream query succeeds in this process.
func (p *Provider) Validate(q discovery.Query) error {
	if e := discovery.Validate(p.Capabilities(), q); e != nil {
		return e
	}
	if q.Locale != "" && q.Locale != "zh-CN" {
		return discovery.Unsupported("locale")
	}
	return nil
}
func (p *Provider) graphql(ctx context.Context, query string, vars map[string]any, out any) error {
	if e := p.Transport.UnavailableError(); e != nil {
		return e
	}
	body, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	call := func(base string, t *transport.Client) error {
		req, e := http.NewRequestWithContext(ctx, "POST", base, bytes.NewReader(body))
		if e != nil {
			return discovery.Invalid()
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "media-center/0.1")
		b, _, e := t.Do(req, transport.MaxBody)
		if e != nil {
			return e
		}
		var env struct {
			Data   json.RawMessage   `json:"data"`
			Errors []json.RawMessage `json:"errors"`
		}
		if json.Unmarshal(b, &env) != nil || len(env.Errors) > 0 || len(env.Data) == 0 || string(env.Data) == "null" {
			return discovery.Invalid()
		}
		if json.Unmarshal(env.Data, out) != nil {
			return discovery.Invalid()
		}
		return nil
	}
	// Only proxy availability failures permit fallback. A rate limit never switches endpoints.
	if p.ProxyURL != "" {
		if available, _ := p.ProxyTransport.Availability(); available {
			e := call(p.ProxyURL, p.ProxyTransport)
			if e == nil {
				return nil
			}
			if de, ok := e.(*discovery.Error); ok && (de.Status == 503 && strings.Contains(de.Message, "拒绝") || de.Status == 504 || de.Status == 502 && (strings.Contains(de.Message, "连接失败") || strings.Contains(de.Message, "服务异常"))) {
				p.ProxyTransport.Disable("中文代理自身故障，暂时改用官方", 10*time.Minute)
			} else {
				return e
			}
		}
	}
	return call(p.BaseURL, p.Transport)
}

func (p *Provider) loadIndex(ctx context.Context) error {
	p.mu.Lock()
	if time.Now().Before(p.indexUntil) {
		e := p.indexErr
		p.mu.Unlock()
		return e
	}
	done := p.indexFlight
	if done == nil {
		done = make(chan struct{})
		p.indexFlight = done
		go func() {
			shared, cancel := context.WithTimeout(context.WithoutCancel(ctx), 12*time.Second)
			defer cancel()
			req, _ := http.NewRequestWithContext(shared, "GET", p.DatasetURL, nil)
			var raw json.RawMessage
			e := p.DatasetTransport.JSON(req, &raw)
			var entries []titleEntry
			if e == nil {
				if json.Unmarshal(raw, &entries) != nil {
					var m map[string]titleEntry
					if json.Unmarshal(raw, &m) != nil {
						e = discovery.Invalid()
					} else {
						for k, v := range m {
							if v.ID == 0 {
								v.ID, _ = strconv.Atoi(k)
							}
							entries = append(entries, v)
						}
					}
				}
			}
			p.mu.Lock()
			p.indexErr = e
			if e == nil {
				p.index = entries
				p.indexUntil = time.Now().Add(24 * time.Hour)
			} else {
				p.indexUntil = time.Time{}
			}
			p.indexFlight = nil
			close(done)
			p.mu.Unlock()
		}()
	}
	p.mu.Unlock()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-done:
		p.mu.Lock()
		defer p.mu.Unlock()
		return p.indexErr
	}
}
func (p *Provider) Discover(ctx context.Context, q discovery.Query) (discovery.Page, error) {
	if e := p.Validate(q); e != nil {
		return discovery.Page{}, e
	}
	sort := q.Sort
	if sort == "" && q.Search == "" {
		sort = "POPULARITY_DESC"
	}
	return p.discover(ctx, q, sort)
}
func (p *Provider) discover(ctx context.Context, q discovery.Query, sort string) (discovery.Page, error) {
	vars := map[string]any{"page": q.Page, "perPage": q.PageSize}
	args := "type: ANIME"
	decl := "$page:Int,$perPage:Int"
	if sort != "" {
		args += ",sort:" + sort
	}
	if q.Search != "" {
		args += ",search:$search"
		decl += ",$search:String"
		vars["search"] = q.Search
	}
	for _, filter := range []struct{ name, typ, value string }{
		{"genre", "String", q.Genre}, {"season", "MediaSeason", q.Season},
		{"status", "MediaStatus", q.Status}, {"countryOfOrigin", "CountryCode", q.Region},
	} {
		if filter.value != "" {
			args += "," + filter.name + ":$" + filter.name
			decl += ",$" + filter.name + ":" + filter.typ
			vars[filter.name] = filter.value
		}
	}
	if q.Year != "" {
		year, _ := strconv.Atoi(q.Year) // Validate has checked the range.
		args += ",seasonYear:$seasonYear"
		decl += ",$seasonYear:Int"
		vars["seasonYear"] = year
	}
	type data struct {
		Page *struct {
			Info *struct {
				Total   *int  `json:"total"`
				HasNext *bool `json:"hasNextPage"`
			} `json:"pageInfo"`
			Media *[]record `json:"media"`
		} `json:"Page"`
	}
	var raw data
	query := func(args, decl string) string {
		return "query(" + decl + "){Page(page:$page,perPage:$perPage){pageInfo{total hasNextPage} media(" + args + "){" + fields + "}}}"
	}
	if e := p.graphql(ctx, query(args, decl), vars, &raw); e != nil {
		return discovery.Page{}, e
	}
	valid := func() bool {
		return raw.Page != nil && raw.Page.Info != nil && raw.Page.Media != nil && raw.Page.Info.HasNext != nil && (raw.Page.Info.Total == nil || *raw.Page.Info.Total >= 0)
	}
	if !valid() {
		return discovery.Page{}, discovery.Invalid()
	}
	// A single or zero official hit is insufficient for broad Chinese title searches.
	if q.Search != "" && chinese(q.Search) && (raw.Page.Info.Total != nil && *raw.Page.Info.Total < 2 || raw.Page.Info.Total == nil && q.Page == 1 && len(*raw.Page.Media) < 2) {
		if e := p.loadIndex(ctx); e == nil {
			ids := []int{}
			needle := strings.ToLower(q.Search)
			p.mu.Lock()
			for _, v := range p.index {
				names := append([]string{v.Title}, v.Synonyms...)
				for _, n := range names {
					if strings.Contains(strings.ToLower(n), needle) {
						ids = append(ids, v.ID)
						break
					}
				}
			}
			p.mu.Unlock()
			if len(ids) > 0 {
				sortutil.Ints(ids)
				vars["ids"] = ids
				delete(vars, "search")
				if e = p.graphql(ctx, query(strings.Replace(args, ",search:$search", ",id_in:$ids", 1), strings.Replace(decl, ",$search:String", ",$ids:[Int]", 1)), vars, &raw); e != nil {
					return discovery.Page{}, e
				}
				if !valid() {
					return discovery.Page{}, discovery.Invalid()
				}
			}
		} else if ctx.Err() != nil {
			return discovery.Page{}, ctx.Err()
		}
	}
	page := discovery.Page{Items: []media.Summary{}, Page: q.Page, PageSize: q.PageSize, Source: "anilist", Total: raw.Page.Info.Total, HasMore: *raw.Page.Info.HasNext}
	for _, r := range *raw.Page.Media {
		s, e := p.mapRecord(r)
		if e != nil {
			return page, e
		}
		page.Items = append(page.Items, s)
	}
	page.TotalCapped = page.Total != nil && *page.Total >= 5000
	if sort != "" {
		p.mu.Lock()
		if p.verifiedSorts == nil {
			p.verifiedSorts = map[string]bool{}
		}
		p.verifiedSorts[sort] = true
		p.mu.Unlock()
	}
	return page, nil
}
func (p *Provider) Detail(ctx context.Context, kind, id, locale string) (media.Detail, error) {
	if kind != "anime" || !discovery.ValidID(id) {
		return media.Detail{}, discovery.Unsupported("mediaType/providerId")
	}
	n, _ := strconv.Atoi(id)
	var raw struct {
		Media *record `json:"Media"`
	}
	if e := p.graphql(ctx, "query($id:Int){Media(id:$id,type:ANIME){"+fields+"}}", map[string]any{"id": n}, &raw); e != nil {
		return media.Detail{}, e
	}
	if raw.Media == nil {
		return media.Detail{}, discovery.Problem(404, "未找到媒体条目")
	}
	if raw.Media.ID != n {
		return media.Detail{}, discovery.Invalid()
	}
	s, e := p.mapRecord(*raw.Media)
	return media.Detail{Summary: s, Region: raw.Media.Country, Status: raw.Media.Status, Credits: []media.Credit{}}, e
}
func (p *Provider) Ranking(ctx context.Context, name string) (discovery.Page, error) {
	if name != "popularity" {
		return discovery.Page{}, discovery.Unsupported("ranking")
	}
	return p.discover(ctx, discovery.Query{MediaType: "anime", Page: 1, PageSize: 20}, "POPULARITY_DESC")
}

// VerifyCapabilities lazily probes only native sort enums. Successful queries unlock the
// corresponding capability; a failed probe is retried after cooldown, never assumed supported.
// There is no background synchronizer or persisted capability state.
func (p *Provider) VerifyCapabilities(ctx context.Context) {
	p.mu.Lock()
	if time.Now().Before(p.probeUntil) {
		p.mu.Unlock()
		return
	}
	done := p.probeFlight
	if done == nil {
		done = make(chan struct{})
		p.probeFlight = done
		go func() {
			shared, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
			defer cancel()
			failed := false
			for _, sort := range []string{"POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC"} {
				if _, e := p.discover(shared, discovery.Query{MediaType: "anime", Page: 1, PageSize: 1}, sort); e != nil {
					failed = true
					break
				}
			}
			p.mu.Lock()
			if failed {
				p.probeUntil = time.Now().Add(10 * time.Minute)
			} else {
				p.probeUntil = time.Now().Add(24 * time.Hour)
			}
			p.probeFlight = nil
			close(done)
			p.mu.Unlock()
		}()
	}
	p.mu.Unlock()
	select {
	case <-ctx.Done():
	case <-done:
	}
}
