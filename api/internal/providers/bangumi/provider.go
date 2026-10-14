package bangumi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/transport"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const UserAgent = "media-center/0.1 (https://github.com/a3318375/media-center-api)"

type Provider struct {
	BaseURL   string
	Transport *transport.Client
}

func New() *Provider {
	return &Provider{BaseURL: "https://api.bgm.tv", Transport: transport.New(time.Second, 2)}
}
func (p *Provider) Capabilities() discovery.Capabilities {
	c := discovery.NewCapabilities("bangumi", "Bangumi", []string{"anime"}, []string{"rank", "date"}, 100, 0)
	c.Filters.Year = &discovery.YearRange{Min: 1900, Max: 2100}
	c.Filters.Month = true
	c.Available, c.UnavailableReason = p.Transport.Availability()
	return c
}
func (p *Provider) Validate(q discovery.Query) error {
	if q.Genre != "" || q.Region != "" || q.Season != "" || q.Status != "" {
		return discovery.Problem(400, "Bangumi 官方接口不支持该筛选（genre/region/season/status/platform/cat）")
	}
	if e := discovery.Validate(p.Capabilities(), q); e != nil {
		return e
	}
	if q.Locale != "" && q.Locale != "zh-CN" {
		return discovery.Unsupported("locale")
	}
	if q.Search != "" && (q.Year != "" || q.Month != "" || q.Sort != "") {
		return discovery.Unsupported("搜索筛选")
	}
	return nil
}
func (p *Provider) request(ctx context.Context, method, path string, values url.Values, body any, out any) error {
	var b []byte
	if body != nil {
		b, _ = json.Marshal(body)
	}
	req, e := http.NewRequestWithContext(ctx, method, p.BaseURL+path+"?"+values.Encode(), bytes.NewReader(b))
	if e != nil {
		return discovery.Invalid()
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Content-Type", "application/json")
	return p.Transport.JSON(req, out)
}

func (p *Provider) Discover(ctx context.Context, q discovery.Query) (discovery.Page, error) {
	if e := p.Validate(q); e != nil {
		return discovery.Page{}, e
	}
	v := url.Values{"limit": {strconv.Itoa(q.PageSize)}, "offset": {strconv.Itoa((q.Page - 1) * q.PageSize)}}
	path := "/v0/subjects"
	method := "GET"
	var body any
	if q.Search != "" {
		path = "/v0/search/subjects"
		method = "POST"
		body = map[string]any{"keyword": q.Search, "filter": map[string]any{"type": []int{2}}}
	} else {
		sort := q.Sort
		if sort == "" {
			sort = "rank"
		}
		v.Set("type", "2")
		v.Set("sort", sort)
		if q.Year != "" {
			v.Set("year", q.Year)
		}
		if q.Month != "" {
			v.Set("month", q.Month)
		}
	}
	var raw struct {
		Data   *[]record `json:"data"`
		Total  *int      `json:"total"`
		Limit  *int      `json:"limit"`
		Offset *int      `json:"offset"`
	}
	if e := p.request(ctx, method, path, v, body, &raw); e != nil {
		return discovery.Page{}, e
	}
	if raw.Data == nil || raw.Limit == nil || *raw.Limit != q.PageSize || raw.Offset == nil || *raw.Offset != (q.Page-1)*q.PageSize || raw.Total != nil && *raw.Total < 0 {
		return discovery.Page{}, discovery.Invalid()
	}
	page := discovery.Page{Items: []media.Summary{}, Source: "bangumi", Page: q.Page, PageSize: q.PageSize, Total: raw.Total}
	for _, r := range *raw.Data {
		s, e := mapRecord(r)
		if e != nil {
			return page, e
		}
		page.Items = append(page.Items, s)
	}
	page.HasMore = len(*raw.Data) == q.PageSize
	if raw.Total != nil {
		page.HasMore = q.Page*q.PageSize < *raw.Total
	}
	return page, nil
}
func (p *Provider) Detail(ctx context.Context, kind, id, locale string) (media.Detail, error) {
	if kind != "anime" || !discovery.ValidID(id) {
		return media.Detail{}, discovery.Unsupported("mediaType/providerId")
	}
	var r record
	if e := p.request(ctx, "GET", "/v0/subjects/"+id, nil, nil, &r); e != nil {
		return media.Detail{}, e
	}
	if fmt.Sprint(r.ID) != id {
		return media.Detail{}, discovery.Invalid()
	}
	s, e := mapRecord(r)
	if e != nil {
		return media.Detail{}, e
	}
	var people []struct {
		ID       int
		Name     string
		Relation string
	}
	if e = p.request(ctx, "GET", "/v0/subjects/"+id+"/persons", nil, nil, &people); e != nil {
		return media.Detail{}, e
	}
	if people == nil {
		return media.Detail{}, discovery.Invalid()
	}
	d := media.Detail{Summary: s, Credits: []media.Credit{}}
	for _, v := range people {
		d.Credits = append(d.Credits, media.Credit{Name: v.Name, Role: v.Relation, PersonID: fmt.Sprint(v.ID)})
	}
	return d, nil
}
func (p *Provider) Ranking(ctx context.Context, name string) (discovery.Page, error) {
	if name != "rank" {
		return discovery.Page{}, discovery.Unsupported("ranking")
	}
	return p.Discover(ctx, discovery.Query{MediaType: "anime", Page: 1, PageSize: 20, Sort: "rank"})
}
