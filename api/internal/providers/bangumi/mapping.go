package bangumi

import (
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/normalization"
	"strconv"
)

type record struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Chinese string `json:"name_cn"`
	Date    string `json:"date"`
	Summary string `json:"summary"`
	Type    int    `json:"type"`
	Rating  struct {
		Score float64 `json:"score"`
		Total int64   `json:"total"`
	} `json:"rating"`
	Images struct {
		Large  string `json:"large"`
		Common string `json:"common"`
	} `json:"images"`
	Tags []struct {
		Name string `json:"name"`
	} `json:"tags"`
}

func mapRecord(r record) (media.Summary, error) {
	if r.ID < 1 || r.Name == "" && r.Chinese == "" || r.Type != 0 && r.Type != 2 {
		return media.Summary{}, discovery.Invalid()
	}
	title := r.Chinese
	if title == "" {
		title = r.Name
	}
	s := media.Summary{Identity: discovery.Identity("bangumi", "anime", strconv.Itoa(r.ID)), Title: title, OriginalTitle: r.Name, ReleaseDate: r.Date, Overview: normalization.PlainText(r.Summary), Genres: []string{}, Ratings: []media.Rating{}}
	if len(r.Date) >= 4 {
		if y, e := strconv.Atoi(r.Date[:4]); e == nil {
			s.Year = &y
		}
	}
	poster := r.Images.Large
	if poster == "" {
		poster = r.Images.Common
	}
	if poster != "" {
		s.PosterPath = &poster
	}
	if r.Rating.Total > 0 {
		s.Ratings = append(s.Ratings, media.Rating{Source: media.SourceBangumi, Value: r.Rating.Score, VoteCount: r.Rating.Total})
	}
	for _, t := range r.Tags {
		s.Genres = append(s.Genres, t.Name)
	}
	return s, nil
}
