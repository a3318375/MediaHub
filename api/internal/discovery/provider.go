package discovery

import (
	"context"
	"media-center/internal/media"
)

type Page struct {
	Items       []media.Summary `json:"items"`
	People      []media.Credit  `json:"people"`
	Page        int             `json:"page"`
	PageSize    int             `json:"pageSize"`
	Total       *int            `json:"total"`
	TotalCapped bool            `json:"totalCapped"`
	HasMore     bool            `json:"hasMore"`
	Source      string          `json:"source"`
	FetchedAt   string          `json:"fetchedAt"`
	Stale       bool            `json:"stale"`
	Message     string          `json:"message,omitempty"`
}
type Provider interface {
	Capabilities() Capabilities
	Validate(Query) error
	Discover(context.Context, Query) (Page, error)
	Detail(context.Context, string, string, string) (media.Detail, error)
	Ranking(context.Context, string) (Page, error)
}

func Identity(source, kind, id string) media.Identity {
	s := media.Source(source)
	return media.Identity{MediaID: source + ":" + kind + ":" + id, Source: s, SourceID: id, Provider: s, ProviderID: id, MediaType: media.Type(kind)}
}
