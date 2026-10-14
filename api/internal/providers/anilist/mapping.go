package anilist

import (
	"fmt"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/normalization"
	"strconv"
	"unicode"
)

type record struct {
	Season      string                                   `json:"season"`
	SeasonYear  int                                      `json:"seasonYear"`
	Country     string                                   `json:"countryOfOrigin"`
	ID          int                                      `json:"id"`
	Title       struct{ Native, English, Romaji string } `json:"title"`
	Synonyms    []string                                 `json:"synonyms"`
	Description string                                   `json:"description"`
	Score       *float64                                 `json:"averageScore"`
	Popularity  int64                                    `json:"popularity"`
	Start       struct{ Year, Month, Day int }           `json:"startDate"`
	Cover       struct{ Large string }                   `json:"coverImage"`
	Genres      []string                                 `json:"genres"`
	Status      string                                   `json:"status"`
}

func chinese(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
func (p *Provider) mapRecord(r record) (media.Summary, error) {
	if r.ID < 1 {
		return media.Summary{}, discovery.Invalid()
	}
	title := ""
	for _, s := range r.Synonyms {
		if chinese(s) {
			title = s
			break
		}
	}
	p.mu.Lock()
	for _, v := range p.index {
		if v.ID == r.ID && v.Title != "" && chinese(v.Title) {
			title = v.Title
			break
		}
	}
	p.mu.Unlock()
	if title == "" {
		title = r.Title.Native
	}
	if title == "" {
		title = r.Title.Romaji
	}
	if title == "" {
		title = r.Title.English
	}
	if title == "" {
		return media.Summary{}, discovery.Invalid()
	}
	syn := append([]string{}, r.Synonyms...)
	s := media.Summary{Identity: discovery.Identity("anilist", "anime", strconv.Itoa(r.ID)), Title: title, OriginalTitle: r.Title.Native, Titles: &media.Titles{Native: r.Title.Native, English: r.Title.English, Romaji: r.Title.Romaji, Synonyms: syn}, Overview: normalization.PlainText(r.Description), Genres: r.Genres, Ratings: []media.Rating{}}
	if r.Country != "" {
		s.OriginCountries = []string{r.Country}
	}
	if s.Genres == nil {
		s.Genres = []string{}
	}
	if r.Start.Year > 0 {
		s.Year = &r.Start.Year
		if r.Start.Month > 0 && r.Start.Day > 0 {
			s.ReleaseDate = fmt.Sprintf("%04d-%02d-%02d", r.Start.Year, r.Start.Month, r.Start.Day)
		}
	}
	if r.Cover.Large != "" {
		s.PosterPath = &r.Cover.Large
	}
	if r.Score != nil {
		s.Ratings = append(s.Ratings, media.Rating{Source: media.SourceAniList, Value: *r.Score / 10})
	}
	return s, nil
}
