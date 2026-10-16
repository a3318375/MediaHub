// Package tv schedules TMDB television subscriptions and selects per-episode resources.
package tv

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"mediahub/internal/download"
	"mediahub/internal/textmatch"
)

type Rules struct {
	Sources  []string `json:"sources,omitempty"`
	Channels []string `json:"channels"`
	Match    string   `json:"match"`
	Exclude  string   `json:"exclude"`
}

// ErrIdentityImmutable prevents changing the work or season behind a saved subscription ID.
var ErrIdentityImmutable = errors.New("不能修改订阅的作品或季数")

type Draft struct {
	Source  string `json:"source"`
	TMDBID  string `json:"tmdbId"`
	Title   string `json:"title"`
	Season  int    `json:"season"`
	Enabled bool   `json:"enabled"`
	Rules
}
type Episode struct {
	Season  int    `json:"season"`
	Number  int    `json:"number"`
	Name    string `json:"name"`
	AirDate string `json:"airDate"`
}
type Candidate struct {
	Season        int    `json:"season"`
	Source        string `json:"source,omitempty"`
	Title         string `json:"title"`
	URL           string `json:"url"`
	Cloud         string `json:"cloud"`
	Channel       string `json:"channel"`
	Password      string `json:"password,omitempty"`
	Size          int64  `json:"size"`
	Episode       int    `json:"episode"`
	CollectionEnd int    `json:"collectionEnd,omitempty"`
}
type Subscription struct {
	Draft
	ID                string      `json:"id"`
	Poster            string      `json:"poster"`
	Episodes          []Episode   `json:"episodes"`
	Resources         []Candidate `json:"resources"`
	LastCheckedAt     string      `json:"lastCheckedAt"`
	NextCheckAt       string      `json:"nextCheckAt"`
	LastError         string      `json:"lastError"`
	MetadataError     string      `json:"metadataError"`
	CreatedAt         string      `json:"createdAt"`
	Revision          int         `json:"revision"`
	MetadataCheckedAt string      `json:"metadataCheckedAt"`
}

// SourceOf preserves old subscriptions: explicit channels become direct TG,
// while subscriptions without channels continue using PanSou.
func SourceOf(d Draft) string {
	if d.Source != "" {
		return d.Source
	}
	if len(d.Channels) > 0 {
		return "tg"
	}
	return "pansou"
}

var tmdbIDPattern = regexp.MustCompile(`^[1-9][0-9]{0,11}$`)
var channelPattern = regexp.MustCompile(`^[a-zA-Z0-9_]{1,32}$`)
var sourcePattern = regexp.MustCompile(`^(plugin|tg):[a-z0-9_-]{1,64}$`)

// Validate normalizes a draft before either persistence or resource selection.
func Validate(d *Draft) error {
	d.Source = SourceOf(*d)
	if d.Source != "tg" && d.Source != "pansou" {
		return fmt.Errorf("订阅来源必须是 TG 频道或 PanSou")
	}
	if d.Source == "pansou" {
		d.Channels = []string{}
	}
	if d.Source == "tg" && len(d.Channels) == 0 {
		return fmt.Errorf("TG 订阅至少指定一个公开频道")
	}
	d.Title = strings.TrimSpace(d.Title)
	if !tmdbIDPattern.MatchString(d.TMDBID) || d.Season < 0 || d.Season > 100 || d.Title == "" || len([]rune(d.Title)) > 120 {
		return fmt.Errorf("请选择 TMDB 电视剧、有效季数和标题")
	}
	if len(d.Channels) > 20 {
		return fmt.Errorf("最多指定 20 个 TG 频道")
	}
	for i, c := range d.Channels {
		c = strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(strings.TrimRight(strings.TrimSpace(c), "/"), "https://t.me/s/"), "https://t.me/"), "@")
		if !channelPattern.MatchString(c) {
			return fmt.Errorf("TG 频道请填写公开频道用户名或 https://t.me/用户名")
		}
		d.Channels[i] = strings.ToLower(c)
	}
	if len(d.Sources) > 20 {
		return fmt.Errorf("最多指定 20 个优先来源")
	}
	for i, source := range d.Sources {
		source = strings.ToLower(strings.TrimSpace(source))
		if !sourcePattern.MatchString(source) {
			return fmt.Errorf("来源格式为 plugin:插件名 或 tg:频道名")
		}
		d.Sources[i] = source
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
		if SourceOf(d) == "tg" && len(d.Channels) > 0 {
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
		parseTitle := normalizeSeasonTitle(item.Title)
		season := d.Season
		if season == 0 {
			season = item.Season
			if season == 0 {
				season = 1
			}
			markers := explicitSeason.FindAllStringSubmatch(parseTitle, -1)
			valid := true
			for index, m := range markers {
				raw := m[1]
				if raw == "" {
					raw = m[2]
				}
				n, _ := strconv.Atoi(raw)
				if n < 1 || (index > 0 && n != season) {
					valid = false
					break
				}
				season = n
			}
			if !valid {
				continue
			}
		}
		item.Season = season
		if SourceOf(d) == "pansou" && len(d.Sources) > 0 && sourcePriority(d, item) == len(d.Sources) {
			continue
		}
		episode, ok := singleEpisode(parseTitle, season)
		item.CollectionEnd = 0
		if !ok {
			if end, valid := collectionEpisode(parseTitle, season); valid {
				episode, ok = end, true
				item.CollectionEnd = end
			}
		}
		if !ok {
			continue
		}
		item.Episode = episode
		if item.Size == 0 {
			item.Size = ParseSize(item.Title)
		}
		key := EpisodeKey(item.Season, item.Episode)
		old, ok := best[key]
		if !ok || sourcePriority(d, item) < sourcePriority(d, old) || (sourcePriority(d, item) == sourcePriority(d, old) && ((item.Cloud == "115" && old.Cloud != "115") || (item.Cloud == old.Cloud && (item.Size > old.Size || (item.Size == old.Size && item.URL < old.URL))))) {
			best[key] = item
		}
	}
	out := []Candidate{}
	for _, v := range best {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		return EpisodeKey(out[i].Season, out[i].Episode) < EpisodeKey(out[j].Season, out[j].Episode)
	})
	return out
}

var progressEpisode = regexp.MustCompile(`(?:更(?:新至)?|更新至|更新)\s*(\d{1,4})\s*集|(?:全\s*(\d{1,4})\s*集|(\d{1,4})\s*集全)`)
var explicitSeason = regexp.MustCompile(`(?i)\bS(\d{1,3})(?:\b|E)|第\s*(\d{1,3})\s*季`)

// Collection progress is a channel's availability claim, not a verified file
// mapping. Downloads must still select actual files through the public dialog.
func collectionEpisode(title string, season int) (int, bool) {
	for _, m := range explicitSeason.FindAllStringSubmatch(title, -1) {
		raw := m[1]
		if raw == "" {
			raw = m[2]
		}
		s, _ := strconv.Atoi(raw)
		if s != season {
			return 0, false
		}
	}
	end := 0
	for _, m := range progressEpisode.FindAllStringSubmatch(title, -1) {
		for _, v := range m[1:] {
			if v == "" {
				continue
			}
			n, _ := strconv.Atoi(v)
			if end != 0 && end != n {
				return 0, false
			}
			end = n
		}
	}
	return end, end > 0
}

// Covers reports source availability; it never denotes a completed download.
func Covers(c Candidate, episode int, season ...int) bool {
	if len(season) > 0 && c.Season != 0 && c.Season != season[0] {
		return false
	}
	return c.Episode == episode || (c.CollectionEnd > 0 && episode > 0 && episode <= c.CollectionEnd)
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

func EpisodeKey(season, episode int) int { return season*100000 + episode }
func sourcePriority(d Draft, item Candidate) int {
	if SourceOf(d) == "tg" {
		for i, c := range d.Channels {
			if strings.EqualFold(c, item.Channel) {
				return i
			}
		}
		return len(d.Channels)
	}
	for i, source := range d.Sources {
		if source == strings.ToLower(item.Source) || source == strings.ToLower(item.Channel) || source == "plugin:"+strings.ToLower(item.Source) || source == "tg:"+strings.ToLower(item.Channel) {
			return i
		}
	}
	return len(d.Sources)
}

var chineseSeason = regexp.MustCompile(`第\s*([一二两三四五六七八九十百零]+)\s*季`)

func normalizeSeasonTitle(title string) string {
	return chineseSeason.ReplaceAllStringFunc(title, func(marker string) string {
		digits := map[rune]int{'零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
		raw := chineseSeason.FindStringSubmatch(marker)[1]
		total, current := 0, 0
		for _, char := range raw {
			if char == '十' || char == '百' {
				if current == 0 {
					current = 1
				}
				unit := 10
				if char == '百' {
					unit = 100
				}
				total += current * unit
				current = 0
			} else {
				current = digits[char]
			}
		}
		return fmt.Sprintf("第%d季", total+current)
	})
}
