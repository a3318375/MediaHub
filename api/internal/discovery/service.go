package discovery

import (
	"context"
	"encoding/json"
	"mediahub/internal/media"
	"strings"
	"time"
)

type Service struct {
	Registry *Registry
	Cache    *Cache
}

func NewService(r *Registry) *Service { return &Service{r, NewCache()} }
func (s *Service) Discover(ctx context.Context, source string, q Query) (Page, error) {
	q = q.Normalize()
	p, err := s.Registry.Get(source)
	if err != nil {
		return Page{}, err
	}
	if err = p.Validate(q); err != nil {
		return Page{}, err
	}
	b, err := s.Cache.Load(ctx, source, q.Key(source), DiscoverTTL(source), func(ctx context.Context) ([]byte, bool, error) {
		page, e := p.Discover(ctx, q)
		if e != nil {
			return nil, false, e
		}
		page.Source = source
		page.Page = q.Page
		page.PageSize = q.PageSize
		page.People = []media.Credit{}
		if page.Items == nil {
			page.Items = []media.Summary{}
		}
		if page.FetchedAt == "" {
			page.FetchedAt = time.Now().UTC().Format(time.RFC3339)
		}
		cap := p.Capabilities().TotalCap
		page.TotalCapped = page.Total != nil && cap != nil && *page.Total >= *cap
		b, e := json.Marshal(page)
		return b, len(page.Items) == 0, e
	})
	var page Page
	if err == nil {
		err = json.Unmarshal(b, &page)
	}
	return page, err
}
func (s *Service) Detail(ctx context.Context, source, kind, id, locale string) (media.Detail, error) {
	p, err := s.Registry.Get(source)
	if err != nil {
		return media.Detail{}, err
	}
	if !Contains(p.Capabilities().MediaTypes, kind) || !ValidID(id) {
		return media.Detail{}, Unsupported("mediaType/providerId")
	}
	if locale != "" && locale != "zh-CN" {
		return media.Detail{}, Unsupported("locale")
	}
	if locale == "" {
		locale = "zh-CN"
	}
	b, err := s.Cache.Load(ctx, source, DetailKey(source, kind, id, locale), DetailTTL(source), func(ctx context.Context) ([]byte, bool, error) {
		d, e := p.Detail(ctx, kind, id, locale)
		if e != nil {
			return nil, false, e
		}
		b, e := json.Marshal(d)
		return b, false, e
	})
	var d media.Detail
	if err == nil {
		err = json.Unmarshal(b, &d)
	}
	return d, err
}
func (s *Service) Ranking(ctx context.Context, source, name string) (Page, error) {
	p, err := s.Registry.Get(source)
	if err != nil {
		return Page{}, err
	}
	// Calendar keys include the Beijing date so yesterday's list cannot cross midnight.
	if source == "bangumi" && name == "airing" {
		name += ":" + s.Cache.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	}
	ttl := time.Hour
	if strings.HasPrefix(name, "airing:") {
		ttl = 30 * time.Minute
	}
	b, err := s.Cache.Load(ctx, source, DetailKey(source, "ranking", name, "zh-CN"), ttl, func(ctx context.Context) ([]byte, bool, error) {
		page, e := p.Ranking(ctx, name)
		if e != nil {
			return nil, false, e
		}
		page.People = []media.Credit{}
		if page.FetchedAt == "" {
			page.FetchedAt = time.Now().UTC().Format(time.RFC3339)
		}
		if page.Items == nil {
			page.Items = []media.Summary{}
		}
		b, e := json.Marshal(page)
		return b, len(page.Items) == 0, e
	})
	var page Page
	if err == nil {
		err = json.Unmarshal(b, &page)
	}
	return page, err
}

type Platform struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Logo string `json:"logo"`
}

func (s *Service) Platforms(ctx context.Context, kind, region string) ([]Platform, error) {
	p, e := s.Registry.Get("tmdb")
	if e != nil {
		return nil, e
	}
	reader, ok := p.(interface {
		Platforms(context.Context, string, string) ([]Platform, error)
	})
	if !ok {
		return nil, Unsupported("platforms")
	}
	b, e := s.Cache.Load(ctx, "tmdb", "platforms:"+kind+":"+region, 24*time.Hour, func(ctx context.Context) ([]byte, bool, error) {
		items, e := reader.Platforms(ctx, kind, region)
		if e != nil {
			return nil, false, e
		}
		b, e := json.Marshal(items)
		return b, false, e
	})
	if e != nil {
		return nil, e
	}
	var items []Platform
	e = json.Unmarshal(b, &items)
	return items, e
}
