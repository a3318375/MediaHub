package discovery

import (
	"context"
	"encoding/json"
	"media-center/internal/media"
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
	b, err := s.Cache.Load(ctx, source, DetailKey(source, "ranking", name, "zh-CN"), DiscoverTTL(source), func(ctx context.Context) ([]byte, bool, error) {
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
