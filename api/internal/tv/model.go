// Package tv schedules TMDB television subscriptions and selects per-episode resources.
package tv

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"media-center/internal/download"
	"media-center/internal/textmatch"
)

type Rules struct {
	Channels []string `json:"channels"`
	Match    string   `json:"match"`
	Exclude  string   `json:"exclude"`
}

// ErrIdentityImmutable prevents changing the work or season behind a saved subscription ID.
var ErrIdentityImmutable = errors.New("不能修改订阅的作品或季数")

type Draft struct {
	TMDBID  string `json:"tmdbId"`
	Title   string `json:"title"`
	Season  int    `json:"season"`
	Enabled bool   `json:"enabled"`
	Rules
}
type Episode struct {
	Number  int    `json:"number"`
	Name    string `json:"name"`
	AirDate string `json:"airDate"`
}
type Candidate struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	Cloud    string `json:"cloud"`
	Channel  string `json:"channel"`
	Password string `json:"password,omitempty"`
	Size     int64  `json:"size"`
	Episode  int    `json:"episode"`
}
type Subscription struct {
	Draft
	ID            string      `json:"id"`
	Poster        string      `json:"poster"`
	Episodes      []Episode   `json:"episodes"`
	Resources     []Candidate `json:"resources"`
	LastCheckedAt string      `json:"lastCheckedAt"`
	NextCheckAt   string      `json:"nextCheckAt"`
	LastError     string      `json:"lastError"`
	MetadataError string      `json:"metadataError"`
	CreatedAt     string      `json:"createdAt"`
	Revision      int         `json:"revision"`
}

var tmdbIDPattern = regexp.MustCompile(`^[1-9][0-9]{0,11}$`)
var channelPattern = regexp.MustCompile(`^[a-zA-Z0-9_]{1,24}$`)

// Validate normalizes a draft before either persistence or resource selection.
func Validate(d *Draft) error {
	d.Title = strings.TrimSpace(d.Title)
	if !tmdbIDPattern.MatchString(d.TMDBID) || d.Season < 1 || d.Season > 100 || d.Title == "" || len([]rune(d.Title)) > 120 {
		return fmt.Errorf("请选择 TMDB 电视剧、有效季数和标题")
	}
	if len(d.Channels) > 20 {
		return fmt.Errorf("最多指定 20 个 TG 频道")
	}
	for i, c := range d.Channels {
		c = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(c), "https://t.me/"), "@")
		if !channelPattern.MatchString(c) {
			return fmt.Errorf("TG 频道请填写公开频道用户名或 https://t.me/用户名")
		}
		d.Channels[i] = c
	}
	for _, r := range []string{d.Match, d.Exclude} {
		if len(r) > 500 {
			return fmt.Errorf("正则最多 500 字符")
		}
		if _, err := textmatch.Compile(r); err != nil {
			return fmt.Errorf("正则表达式无效: %v", err)
		}
	}
	return nil
}

var numbered = regexp.MustCompile(`(?i)S(\d{1,3})[ ._-]*E(\d{1,4})\b`)
var simpleEpisode = regexp.MustCompile(`(?i)(?:第\s*(\d{1,4})\s*[集话話]|\bEP?[ ._-]*(\d{1,4})\b)`)
var sizePattern = regexp.MustCompile(`(?i)(\d+(?:\.\d+)?)\s*(TiB|GiB|MiB|TB|GB|MB)`)
var ambiguousEpisodes = regexp.MustCompile(`(?i)(?:E\d{1,4}(?:[ ._-]*E\d|[-~至]\d)|第\s*\d+\s*[-~至]\s*\d+\s*集|\bEP?\d+\s*[-~至]\s*\d+)`)

// ParseSize reads the largest declared size, not a verified remote file size.
// Zero means unknown; callers must not treat a message's size as per-file proof.
func ParseSize(text string) int64 {
	var largest int64
	for _, m := range sizePattern.FindAllStringSubmatch(text, -1) {
		v, _ := strconv.ParseFloat(m[1], 64)
		power := int64(1024 * 1024)
		switch strings.ToUpper(m[2]) {
		case "GB", "GIB":
			power *= 1024
		case "TB", "TIB":
			power *= 1024 * 1024
		}
		n := int64(v * float64(power))
		if n > largest {
			largest = n
		}
	}
	return largest
}

// Select keeps one resource per episode. Unknown episodes and explicit other seasons are ignored.
func Select(d Draft, items []Candidate) []Candidate {
	include, includeErr := textmatch.Compile(d.Match)
	exclude, excludeErr := textmatch.Compile(d.Exclude)
	best := map[int]Candidate{}
	for _, item := range items {
		if includeErr != nil || excludeErr != nil || !include.MatchString(item.Title) || (d.Exclude != "" && exclude.MatchString(item.Title)) {
			continue
		}
		if len(d.Channels) > 0 {
			found := false
			for _, c := range d.Channels {
				if strings.EqualFold(item.Channel, c) {
					found = true
				}
			}
			if !found {
				continue
			}
		}
		link, err := download.NormalizeLink(item.URL, item.Password)
		if err != nil {
			continue
		}
		item.URL, item.Password = link.URL, link.ReceiveCode
		switch link.Kind {
		case "share_transfer":
			item.Cloud = "115"
		case "offline":
			item.Cloud = "magnet"
		default:
			continue
		}
		episode, ok := singleEpisode(item.Title, d.Season)
		if !ok {
			continue
		}
		item.Episode = episode
		if item.Size == 0 {
			item.Size = ParseSize(item.Title)
		}
		old, ok := best[item.Episode]
		if !ok || (item.Cloud == "115" && old.Cloud != "115") || (item.Cloud == old.Cloud && (item.Size > old.Size || (item.Size == old.Size && item.URL < old.URL))) {
			best[item.Episode] = item
		}
	}
	out := []Candidate{}
	for _, v := range best {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Episode < out[j].Episode })
	return out
}

// singleEpisode permits repeated copies of the same marker (title + message
// body), while rejecting conflicting seasons, distinct episodes and ranges.
func singleEpisode(title string, season int) (int, bool) {
	if ambiguousEpisodes.MatchString(title) {
		return 0, false
	}
	numbers := map[int]bool{}
	for _, m := range numbered.FindAllStringSubmatch(title, -1) {
		s, _ := strconv.Atoi(m[1])
		if s != season {
			return 0, false
		}
		n, _ := strconv.Atoi(m[2])
		numbers[n] = true
	}
	for _, m := range simpleEpisode.FindAllStringSubmatch(title, -1) {
		raw := m[1]
		if raw == "" {
			raw = m[2]
		}
		n, _ := strconv.Atoi(raw)
		numbers[n] = true
	}
	if len(numbers) != 1 {
		return 0, false
	}
	for n := range numbers {
		return n, n > 0 && n <= 10000
	}
	return 0, false
}
