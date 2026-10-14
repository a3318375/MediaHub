package anime

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type Feed struct {
	Label  string `json:"label"`
	URL    string `json:"url"`
	Offset int    `json:"offset"`
}
type Draft struct {
	Title         string   `json:"title"`
	OriginalTitle string   `json:"originalTitle"`
	BangumiID     string   `json:"bangumiId"`
	MikanID       string   `json:"mikanId"`
	Source        string   `json:"source"`
	URL           string   `json:"url"`
	Subgroup      string   `json:"subgroup"`
	Season        int      `json:"season"`
	Offset        int      `json:"offset"`
	TotalEpisodes int      `json:"totalEpisodes"`
	Week          int      `json:"week"`
	ReleaseDate   string   `json:"releaseDate"`
	Poster        string   `json:"poster"`
	Description   string   `json:"description"`
	Rating        string   `json:"rating"`
	Enabled       bool     `json:"enabled"`
	Match         []string `json:"match"`
	Exclude       []string `json:"exclude"`
	Standby       []Feed   `json:"standby"`
}
type Subscription struct {
	AutoDownload bool `json:"autoDownload,omitempty"`
	Draft
	ID                string  `json:"id"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
	LatestEpisode     int     `json:"latestEpisode"`
	KnownEpisodes     []int   `json:"knownEpisodes"`
	Completed         bool    `json:"completed"`
	LastCheckedAt     string  `json:"lastCheckedAt"`
	LastError         string  `json:"lastError"`
	LastMetadataAt    string  `json:"lastMetadataAt"`
	MetadataError     string  `json:"metadataError"`
	Resources         []Entry `json:"resources"`
	LastScheduledDate string  `json:"lastScheduledDate"`
	Discovered        []Entry `json:"-"`
}
type Entry struct {
	BangumiID       string   `json:"bangumiId,omitempty"`
	Title           string   `json:"title"`
	URL             string   `json:"url"`
	PublishedAt     string   `json:"publishedAt"`
	Episode         *float64 `json:"episode"`
	Accepted        bool     `json:"accepted"`
	Reason          string   `json:"reason"`
	FileName        string   `json:"fileName"`
	Feed            string   `json:"feed"`
	OriginalEpisode *float64 `json:"originalEpisode,omitempty"`
	ResourceID      string   `json:"resourceId,omitempty"`
	DownloadKind    string   `json:"downloadKind,omitempty"`
	DetailURL       string   `json:"detailUrl,omitempty"`
	GUID            string   `json:"guid,omitempty"`
	ContentLength   int64    `json:"contentLength,omitempty"`
}
type Preview struct {
	Items    []Entry  `json:"items"`
	Accepted int      `json:"accepted"`
	Warnings []string `json:"warnings"`
}

var positiveID = regexp.MustCompile(`^[1-9][0-9]{0,11}$`)

func ValidID(id string) bool { return positiveID.MatchString(id) }
func FeedURL(raw string) (*url.URL, error) {
	u, e := url.Parse(strings.TrimSpace(raw))
	if e != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Fragment != "" || len(raw) > 2048 {
		return nil, fmt.Errorf("RSS 地址必须是有效的 HTTP/HTTPS 地址")
	}
	return u, nil
}
func Validate(d *Draft) error {
	d.Title = strings.TrimSpace(d.Title)
	d.URL = strings.TrimSpace(d.URL)
	if d.Title == "" || len([]rune(d.Title)) > 200 {
		return fmt.Errorf("标题需为 1–200 字符")
	}
	if !ValidID(d.BangumiID) {
		return fmt.Errorf("请选择有效的 Bangumi 作品")
	}
	if d.Source != "mikan" && d.Source != "other" && d.Source != "ani-bt" && d.Source != "anime-garden" {
		return fmt.Errorf("动漫来源无效")
	}
	if e := ValidateSourceURL(*d); e != nil {
		return e
	}
	if d.MikanID != "" && !ValidID(d.MikanID) {
		return fmt.Errorf("Mikan ID 无效")
	}
	if d.Season < 1 || d.Season > 100 || d.Offset < -10000 || d.Offset > 10000 || d.TotalEpisodes < 0 || d.TotalEpisodes > 10000 || d.Week < 0 || d.Week > 7 {
		return fmt.Errorf("季、集数、偏移或星期超出范围")
	}
	if len(d.Standby) > 5 {
		return fmt.Errorf("备用 RSS 最多 5 个")
	}
	seen := map[string]bool{}
	for _, f := range append([]Feed{{URL: d.URL}}, d.Standby...) {
		if _, e := FeedURL(f.URL); e != nil {
			return e
		}
		if seen[f.URL] {
			return fmt.Errorf("RSS 地址重复")
		}
		seen[f.URL] = true
		if f.Offset < -10000 || f.Offset > 10000 || len(f.Label) > 200 {
			return fmt.Errorf("备用 RSS 参数无效")
		}
	}
	for _, rules := range [][]string{d.Match, d.Exclude} {
		if len(rules) > 20 {
			return fmt.Errorf("每类规则最多 20 条")
		}
		for _, r := range rules {
			if len(r) > 500 || strings.TrimSpace(r) == "" {
				return fmt.Errorf("规则不能为空或超过 500 字符")
			}
			if _, e := regexp.Compile(r); e != nil {
				return fmt.Errorf("正则表达式无效: %s", r)
			}
		}
	}
	if len(d.Description) > 20000 || len(d.OriginalTitle) > 1000 || len(d.Subgroup) > 200 || len(d.Poster) > 2048 {
		return fmt.Errorf("作品信息过长")
	}
	return nil
}

var episodePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)S\d{1,3}E(\d{1,4}(?:\.5)?)\b`),
	regexp.MustCompile(`第\s*(\d{1,4}(?:\.5)?)\s*[集话話]`),
	regexp.MustCompile(`(?:\s-\s|\[|【|\sEP\s*)(\d{1,4}(?:\.5)?)(?:v\d)?(?:\]|】|\s|$)`),
}

func episode(title string) *float64 {
	for _, r := range episodePatterns {
		if m := r.FindStringSubmatch(title); len(m) > 1 {
			v, _ := strconv.ParseFloat(m[1], 64)
			return &v
		}
	}
	return nil
}
func Apply(d Draft, entries []Entry, offset int, seen map[float64]bool) []Entry {
	match := make([]*regexp.Regexp, 0, len(d.Match))
	exclude := make([]*regexp.Regexp, 0, len(d.Exclude))
	for _, r := range d.Match {
		match = append(match, regexp.MustCompile(r))
	}
	for _, r := range d.Exclude {
		exclude = append(exclude, regexp.MustCompile(r))
	}
	for i := range entries {
		e := &entries[i]
		if e.BangumiID != "" && e.BangumiID != d.BangumiID {
			e.Accepted = false
			e.Reason = "资源属于其他 Bangumi 作品"
			continue
		}
		e.Episode = episode(e.Title)
		e.OriginalEpisode = e.Episode
		e.Accepted = true
		e.Reason = "匹配"
		if e.URL == "" {
			e.Accepted = false
			e.Reason = "没有可用的种子或磁力链接"
		}
		for _, r := range exclude {
			if r.MatchString(e.Title) {
				e.Accepted = false
				e.Reason = "命中排除规则"
				break
			}
		}
		if e.Accepted {
			for _, r := range match {
				if !r.MatchString(e.Title) {
					e.Accepted = false
					e.Reason = "未满足全部匹配规则"
					break
				}
			}
		}
		if e.Episode == nil {
			if e.Accepted {
				e.Accepted = false
				e.Reason = "无法识别单集集数"
			}
			continue
		}
		v := *e.Episode + float64(offset)
		e.Episode = &v
		if e.Accepted && (v <= 0 || (d.TotalEpisodes > 0 && v > float64(d.TotalEpisodes))) {
			e.Accepted = false
			e.Reason = "集数超出范围"
		}
		if e.Accepted && seen[v] {
			e.Accepted = false
			e.Reason = "同集重复（主 RSS 优先）"
		}
		if e.Accepted {
			seen[v] = true
		}
		title := strings.Map(func(r rune) rune {
			if strings.ContainsRune(`/\:*?"<>|`, r) || r < 32 {
				return '_'
			}
			return r
		}, d.Title)
		e.FileName = fmt.Sprintf("%s S%02dE%02g", title, d.Season, v)
	}
	return entries
}
