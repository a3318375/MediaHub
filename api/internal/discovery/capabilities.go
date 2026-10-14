package discovery

import (
	"strconv"
	"time"
)

type YearRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}
type Filters struct {
	SeasonRequiresYear bool       `json:"seasonRequiresYear"`
	Genre              []string   `json:"genre"`
	Region             []string   `json:"region"`
	Year               *YearRange `json:"year"`
	Month              bool       `json:"month"`
	Season             []string   `json:"season"`
	Status             []string   `json:"status"`
	Sort               []string   `json:"sort"`
}
type Capabilities struct {
	Source            string   `json:"source"`
	Label             string   `json:"label"`
	MediaTypes        []string `json:"mediaTypes"`
	Filters           Filters  `json:"filters"`
	SupportsSearch    bool     `json:"supportsSearch"`
	SupportsRanking   bool     `json:"supportsRanking"`
	PageSizeMax       int      `json:"pageSizeMax"`
	TotalCap          *int     `json:"totalCap"`
	Available         bool     `json:"available"`
	UnavailableReason string   `json:"unavailableReason,omitempty"`
}

func NewCapabilities(source, label string, types, sorts []string, max, cap int) Capabilities {
	c := Capabilities{Source: source, Label: label, MediaTypes: types, SupportsSearch: true, SupportsRanking: true, PageSizeMax: max, Available: true, Filters: Filters{Genre: []string{}, Region: []string{}, Season: []string{}, Status: []string{}, Sort: sorts}}
	if cap > 0 {
		c.TotalCap = &cap
	}
	return c
}
func Contains(values []string, v string) bool {
	for _, x := range values {
		if x == v {
			return true
		}
	}
	return false
}
func Validate(c Capabilities, q Query) error {
	if !Contains(c.MediaTypes, q.MediaType) {
		return Unsupported("mediaType")
	}
	if q.Page < 1 || q.Page > 2147483647 || q.PageSize < 1 || q.PageSize > c.PageSizeMax {
		return Unsupported("page/pageSize")
	}
	if len([]rune(q.Search)) > 200 {
		return Unsupported("query")
	}
	if q.Search != "" && !c.SupportsSearch {
		return Unsupported("query")
	}
	for _, v := range []struct {
		name, value string
		allowed     []string
	}{{"genre", q.Genre, c.Filters.Genre}, {"region", q.Region, c.Filters.Region}, {"sort", q.Sort, c.Filters.Sort}, {"season", q.Season, c.Filters.Season}, {"status", q.Status, c.Filters.Status}} {
		if v.value != "" && !Contains(v.allowed, v.value) {
			return Unsupported(v.name)
		}
	}
	if q.Season != "" && c.Filters.SeasonRequiresYear && q.Year == "" {
		return Unsupported("season（需要 year）")
	}
	if q.Year != "" {
		y, e := strconv.Atoi(q.Year)
		if e != nil || c.Filters.Year == nil || y < c.Filters.Year.Min || y > c.Filters.Year.Max {
			return Unsupported("year")
		}
	}
	if q.Month != "" {
		m, e := strconv.Atoi(q.Month)
		if !c.Filters.Month || e != nil || m < 1 || m > 12 || q.Year == "" {
			return Unsupported("month（需要 year）")
		}
	}
	return nil
}
func DiscoverTTL(source string) time.Duration {
	if source == "tmdb" || source == "douban" {
		return 1800 * time.Second
	}
	return 900 * time.Second
}
func DetailTTL(source string) time.Duration {
	if source == "tmdb" || source == "douban" {
		return 86400 * time.Second
	}
	return 21600 * time.Second
}
