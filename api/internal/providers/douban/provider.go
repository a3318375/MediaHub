package douban

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/transport"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Frodo's fixed public API parameters are not user credentials and do not guarantee authorization.
const publicAPIKey = "0dad551ec0f84ed02907ff5c42e8ec70"
const publicSigningSecret = "bf7dddc7c9cfe6f7"
const UserAgent = "api-client/1 com.douban.frodo/7.1.0(205) Android/29 product/perseus vendor/Xiaomi model/Mi MIX 3  rom/miui6  network/wifi  platform/mobile nd/1"

type Provider struct {
	BaseURL        string
	Transport      *transport.Client
	ImageTransport *transport.Client
}

func New() *Provider {
	p := &Provider{BaseURL: "https://frodo.douban.com", Transport: transport.New(3*time.Second, 1), ImageTransport: transport.New(250*time.Millisecond, 2)}
	p.ImageTransport.ShareCooldown(p.Transport)
	p.Transport.Guard = func(b []byte) error {
		var risk struct {
			Code any `json:"code"`
		}
		_ = json.Unmarshal(b, &risk)
		if transport.IsVerification(b) || fmt.Sprint(risk.Code) == "996" {
			p.Transport.Disable("豆瓣触发访问验证或风控，已暂停回源", 10*time.Minute)
			return &discovery.Error{Status: 503, Message: "豆瓣触发访问验证或风控，已暂停回源", RetryAfter: "600"}
		}
		return nil
	}
	p.ImageTransport.Guard = p.Transport.Guard
	return p
}
func (p *Provider) Capabilities() discovery.Capabilities {
	c := discovery.NewCapabilities("douban", "豆瓣", []string{"movie", "tv"}, []string{"U", "T", "S", "R"}, 50, 500)
	c.Filters.Genre = []string{"科幻"}
	c.Filters.Region = []string{"美剧"}
	c.Available, c.UnavailableReason = p.Transport.Availability()
	return c
}
func (p *Provider) Validate(q discovery.Query) error {
	if e := discovery.Validate(p.Capabilities(), q); e != nil {
		return e
	}
	if q.Locale != "" && q.Locale != "zh-CN" {
		return discovery.Unsupported("locale")
	}
	if q.Genre != "" && (q.MediaType != "movie" || q.Region != "") || q.Region != "" && q.MediaType != "tv" {
		return discovery.Unsupported("豆瓣标签组合")
	}
	if q.Search != "" && (q.Genre != "" || q.Region != "" || q.Sort != "") {
		return discovery.Unsupported("搜索筛选")
	}
	return nil
}
func Signature(path, ts string) string {
	m := hmac.New(sha1.New, []byte(publicSigningSecret))
	m.Write([]byte("GET&" + url.QueryEscape(path) + "&" + ts))
	return base64.StdEncoding.EncodeToString(m.Sum(nil))
}
func (p *Provider) request(ctx context.Context, path string, v url.Values, out any) error {
	if v == nil {
		v = url.Values{}
	}
	ts := time.Now().Format("20060102")
	path = "/api/v2" + path
	v.Set("apiKey", publicAPIKey)
	v.Set("os_rom", "android")
	v.Set("_ts", ts)
	v.Set("_sig", Signature(path, ts))
	req, e := http.NewRequestWithContext(ctx, "GET", p.BaseURL+path+"?"+v.Encode(), nil)
	if e != nil {
		return discovery.Invalid()
	}
	req.Header.Set("User-Agent", UserAgent)
	b, _, e := p.Transport.Do(req, transport.MaxBody)
	if e != nil {
		return e
	}
	if transport.IsVerification(b) {
		p.Transport.Disable("豆瓣触发访问验证，已暂停回源，请稍后重试", 10*time.Minute)
		return &discovery.Error{Status: 503, Message: "豆瓣触发访问验证，已暂停回源，请稍后重试", RetryAfter: "600"}
	}
	var risk struct {
		Code    any    `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(b, &risk)
	if fmt.Sprint(risk.Code) == "996" {
		p.Transport.Disable("豆瓣触发风控，已暂停回源", 10*time.Minute)
		return &discovery.Error{Status: 503, Message: "豆瓣触发风控，已暂停回源", RetryAfter: "600"}
	}
	if json.Unmarshal(b, out) != nil {
		return discovery.Invalid()
	}
	return nil
}

func (p *Provider) Discover(ctx context.Context, q discovery.Query) (discovery.Page, error) {
	if e := p.Validate(q); e != nil {
		return discovery.Page{}, e
	}
	path := "/" + q.MediaType + "/recommend"
	sort := q.Sort
	if sort == "" {
		sort = "U"
	}
	v := url.Values{"start": {strconv.Itoa((q.Page - 1) * q.PageSize)}, "count": {strconv.Itoa(q.PageSize)}}
	if q.Search != "" {
		path = "/search/weixin"
		v.Set("q", q.Search)
	} else {
		v.Set("sort", sort)
		if q.Genre != "" {
			v.Set("tags", q.Genre)
		}
		if q.Region != "" {
			v.Set("tags", q.Region)
		}
	}
	var raw struct {
		Items *[]json.RawMessage `json:"items"`
		Total *int               `json:"total"`
		Start *int               `json:"start"`
		Count *int               `json:"count"`
	}
	if e := p.request(ctx, path, v, &raw); e != nil {
		return discovery.Page{}, e
	}
	if raw.Items == nil || raw.Start == nil || *raw.Start != (q.Page-1)*q.PageSize || raw.Count == nil || *raw.Count != q.PageSize || raw.Total != nil && *raw.Total < 0 {
		return discovery.Page{}, discovery.Invalid()
	}
	page := discovery.Page{Items: []media.Summary{}, Source: "douban", Page: q.Page, PageSize: q.PageSize, Total: raw.Total}
	for _, item := range *raw.Items {
		var r record
		if q.Search != "" {
			var card struct {
				Layout     string          `json:"layout"`
				Target     json.RawMessage `json:"target"`
				TargetType string          `json:"target_type"`
			}
			if json.Unmarshal(item, &card) != nil || card.Layout != "" && card.Layout != "subject" || card.TargetType != "movie" && card.TargetType != "tv" {
				continue
			}
			if json.Unmarshal(card.Target, &r) != nil {
				continue
			}
			kind := nativeKind(r, card.TargetType)
			if kind != q.MediaType || !discovery.ValidID(string(r.ID)) || r.Title == "" || strings.Contains(r.URI, "subject_collection") || r.URI != "" && !isWork(r) {
				continue
			}
		} else {
			if json.Unmarshal(item, &r) != nil {
				return page, discovery.Invalid()
			}
			if !isWork(r) || nativeKind(r, q.MediaType) != q.MediaType {
				continue
			}
		}
		s, e := mapRecord(r, q.MediaType)
		if e != nil {
			return page, e
		}
		if q.Search != "" && r.CoverURL != "" {
			s.PosterPath = searchPoster(r.CoverURL)
		}
		page.Items = append(page.Items, s)
	}
	page.HasMore = len(*raw.Items) == q.PageSize
	if raw.Total != nil {
		page.HasMore = q.Page*q.PageSize < *raw.Total
	}
	page.TotalCapped = q.Search == "" && raw.Total != nil && *raw.Total >= 500
	if q.Search != "" {
		page.Total = nil
	}
	if q.Search != "" && len(page.Items) == 0 {
		page.Message = "豆瓣聚合搜索未解析到可用的电影或剧集作品"
	}
	return page, nil
}
func (p *Provider) Detail(ctx context.Context, kind, id, locale string) (media.Detail, error) {
	if !discovery.Contains([]string{"movie", "tv"}, kind) || !discovery.ValidID(id) {
		return media.Detail{}, discovery.Unsupported("mediaType/providerId")
	}
	var r record
	if e := p.request(ctx, "/"+kind+"/"+id, nil, &r); e != nil {
		return media.Detail{}, e
	}
	if string(r.ID) != id {
		return media.Detail{}, discovery.Invalid()
	}
	s, e := mapRecord(r, kind)
	if e != nil {
		return media.Detail{}, e
	}
	d := media.Detail{Summary: s, Region: strings.Join(r.Countries, ","), Credits: []media.Credit{}}
	for _, v := range r.Directors {
		var profilePath *string
		if v.Avatars.Large != "" {
			profilePath = &v.Avatars.Large
		}
		d.Credits = append(d.Credits, media.Credit{Name: v.Name, Role: "导演", ProfilePath: profilePath})
	}
	for _, v := range r.Actors {
		var profilePath *string
		if v.Avatars.Large != "" {
			profilePath = &v.Avatars.Large
		}
		d.Credits = append(d.Credits, media.Credit{Name: v.Name, Role: "演员", ProfilePath: profilePath})
	}
	if len(r.Durations) > 0 {
		f := strings.Fields(r.Durations[0])
		if len(f) > 0 {
			if n, e := strconv.Atoi(f[0]); e == nil {
				d.RuntimeMinutes = &n
			}
		}
	}
	return d, nil
}
func (p *Provider) Ranking(ctx context.Context, name string) (discovery.Page, error) {
	kind := "movie"
	if name == "tv_hot" {
		kind = "tv"
	} else if name != "movie_top250" {
		return discovery.Page{}, discovery.Unsupported("ranking")
	}
	var raw struct {
		Items *[]record `json:"subject_collection_items"`
		Total *int      `json:"total"`
	}
	if e := p.request(ctx, "/subject_collection/"+name+"/items", url.Values{"start": {"0"}, "count": {"20"}}, &raw); e != nil {
		return discovery.Page{}, e
	}
	if raw.Items == nil || raw.Total != nil && *raw.Total < 0 {
		return discovery.Page{}, discovery.Invalid()
	}
	page := discovery.Page{Items: []media.Summary{}, Page: 1, PageSize: 20, Source: "douban", Total: raw.Total}
	for _, r := range *raw.Items {
		if !isWork(r) {
			continue
		}
		s, e := mapRecord(r, kind)
		if e != nil {
			return page, e
		}
		page.Items = append(page.Items, s)
	}
	page.HasMore = raw.Total != nil && *raw.Total > 20
	return page, nil
}

// Image validates the complete URL before any network operation and never follows redirects.
func (p *Provider) Image(ctx context.Context, rawURL string) ([]byte, string, error) {
	u, e := url.Parse(rawURL)
	if e != nil || !validImageURL(u) {
		return nil, "", discovery.Unsupported("图片域名")
	}
	req, e := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if e != nil {
		return nil, "", discovery.Unsupported("url")
	}
	req.Header.Set("Referer", "https://movie.douban.com/")
	req.Header.Set("User-Agent", UserAgent)
	b, h, e := p.ImageTransport.Do(req, 1<<20)
	if e != nil {
		return nil, "", e
	}
	content := strings.Split(h.Get("Content-Type"), ";")[0]
	if !discovery.Contains([]string{"image/jpeg", "image/png", "image/webp", "image/gif"}, content) || http.DetectContentType(b) != content {
		return nil, "", discovery.Invalid()
	}
	return b, content, nil
}
