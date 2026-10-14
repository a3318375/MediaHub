package douban

import (
	"encoding/json"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/normalization"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Recommendation lists contain nonnumeric collection IDs; decode before filtering them out.
type nativeID string

func (id *nativeID) UnmarshalJSON(b []byte) error {
	var s string
	if len(b) > 0 && b[0] == '"' {
		if e := json.Unmarshal(b, &s); e != nil {
			return e
		}
	} else {
		var n json.Number
		if e := json.Unmarshal(b, &n); e != nil {
			return e
		}
		s = n.String()
	}
	*id = nativeID(s)
	return nil
}

type record struct {
	CoverURL string   `json:"cover_url"`
	ID       nativeID `json:"id"`
	Title    string   `json:"title"`
	Year     string   `json:"year"`
	URI      string   `json:"uri"`
	Subtype  string   `json:"subtype"`
	Type     string   `json:"type"`
	Rating   struct {
		Value float64 `json:"value"`
		Count int64   `json:"count"`
		Max   float64 `json:"max"`
	} `json:"rating"`
	Pic struct {
		Large string `json:"large"`
	} `json:"pic"`
	Summary   string   `json:"summary"`
	Genres    []string `json:"genres"`
	Countries []string `json:"countries"`
	AKA       []string `json:"aka"`
	Pubdate   []string `json:"pubdate"`
	Durations []string `json:"durations"`
	Directors []struct {
		Name    string `json:"name"`
		Avatars struct {
			Large string `json:"large"`
		} `json:"avatars"`
	} `json:"directors"`
	Actors []struct {
		Name    string `json:"name"`
		Avatars struct {
			Large string `json:"large"`
		} `json:"avatars"`
	} `json:"actors"`
	EpisodesCount int `json:"episodes_count"`
}

func nativeKind(r record, fallback string) string {
	for _, kind := range []string{"movie", "tv"} {
		if strings.HasPrefix(r.URI, "douban://douban.com/"+kind+"/") {
			return kind
		}
	}
	if r.Subtype == "movie" || r.Subtype == "tv" {
		return r.Subtype
	}
	if r.Type == "movie" || r.Type == "tv" {
		return r.Type
	}
	return fallback
}
func isWork(r record) bool {
	return discovery.ValidID(string(r.ID)) && r.Title != "" && !strings.Contains(r.URI, "subject_collection") && (strings.HasPrefix(r.URI, "douban://douban.com/movie/") || strings.HasPrefix(r.URI, "douban://douban.com/tv/"))
}
func mapRecord(r record, kind string) (media.Summary, error) {
	if !discovery.ValidID(string(r.ID)) || r.Title == "" {
		return media.Summary{}, discovery.Invalid()
	}
	s := media.Summary{Identity: discovery.Identity("douban", kind, string(r.ID)), Title: r.Title, Overview: normalization.PlainText(r.Summary), Genres: r.Genres, OriginCountries: r.Countries, Ratings: []media.Rating{}}
	if s.Genres == nil {
		s.Genres = []string{}
	}
	if y, e := strconv.Atoi(r.Year); e == nil && y > 0 {
		s.Year = &y
	}
	if len(r.Pubdate) > 0 {
		date := r.Pubdate[0]
		if len(date) >= 10 {
			date = date[:10]
		}
		if _, e := time.Parse("2006-01-02", date); e == nil {
			s.ReleaseDate = date
		}
	}
	if r.Pic.Large != "" {
		poster := "/api/media/image?source=douban&url=" + url.QueryEscape(r.Pic.Large)
		s.PosterPath = &poster
	}
	if r.Rating.Count > 0 {
		max := r.Rating.Max
		if max == 0 {
			max = 10
		}
		s.Ratings = append(s.Ratings, media.Rating{Source: media.SourceDouban, Value: r.Rating.Value * 10 / max, VoteCount: r.Rating.Count})
	}
	return s, nil
}

// validImageURL permits signed CDN queries while restricting the entire authority.
func validImageURL(u *url.URL) bool {
	return u.Scheme == "https" && u.User == nil && u.Host == u.Hostname() &&
		u.Fragment == "" && !strings.Contains(u.String(), "#") &&
		strings.HasSuffix(strings.ToLower(u.Hostname()), ".doubanio.com")
}

// All Douban posters use the server proxy, retaining the original signed URL.
func searchPoster(raw string) *string {
	u, err := url.Parse(raw)
	if err != nil || !validImageURL(u) {
		return nil
	}
	poster := "/api/media/image?source=douban&url=" + url.QueryEscape(raw)
	return &poster
}
