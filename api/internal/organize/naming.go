package organize

import (
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"media-center/internal/download"
)

var videoExtensions = map[string]bool{".mkv": true, ".mp4": true, ".avi": true, ".mov": true, ".m4v": true, ".ts": true, ".m2ts": true, ".webm": true, ".wmv": true, ".flv": true, ".mpg": true}
var subtitleExtensions = map[string]bool{".srt": true, ".ass": true, ".ssa": true, ".vtt": true, ".sub": true, ".idx": true}

func IsVideo(name string) bool { return videoExtensions[strings.ToLower(path.Ext(name))] }

var tvNumber = regexp.MustCompile(`(?i)S([0-9]{1,3})E([0-9]{1,4})`)
var episodeNumber = regexp.MustCompile(`(?i)(?:第\s*|\s-\s|\bEP)([0-9]{1,4})(?:[集话話]|\s|\.|$)`)
var multiNumber = regexp.MustCompile(`(?i)(?:E[0-9]+[- ]?E[0-9]+|[0-9]+\.[5]|[0-9]+[-~][0-9]+)`)
var quality = regexp.MustCompile(`(?i)(?:2160p|1080p|720p|4k|8k)`)
var yearPattern = regexp.MustCompile(`(?:^|[ ._(])((?:19|20)[0-9]{2})(?:[ ._)]|$)`)
var bracketTags = regexp.MustCompile(`\[[^\]]*\]`)
var releaseTail = regexp.MustCompile(`(?i)[ ._-](?:2160p|1080p|720p|4k|8k|webrip|web-dl|bluray|hdtv|x264|x265|hevc|aac|h264|h265).*`)
var subtitleSuffix = regexp.MustCompile(`^[A-Za-z0-9.-]{1,64}$`)

func cleanName(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`/\:*?"<>|`, r) {
			return '_'
		}
		return r
	}, s)
	s = strings.Trim(strings.Join(strings.Fields(s), " "), " .")
	if len(s) > 240 {
		return ""
	}
	return s
}
func NormalTitle(s string) string {
	return strings.ToLower(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		return -1
	}, s))
}
func Guess(name, hint string) (title, kind string, year int) {
	stem := strings.TrimSuffix(name, path.Ext(name))
	stem = bracketTags.ReplaceAllString(stem, "")
	kind = hint
	if kind == "auto" {
		kind = "movie"
		if tvNumber.MatchString(stem) || episodeNumber.MatchString(stem) {
			kind = "tv"
		}
	}
	if found := yearPattern.FindStringSubmatchIndex(stem); len(found) > 0 {
		year, _ = strconv.Atoi(stem[found[2]:found[3]])
		stem = stem[:found[0]]
	}
	if found := tvNumber.FindStringIndex(stem); len(found) > 0 {
		stem = stem[:found[0]]
	}
	if found := episodeNumber.FindStringIndex(stem); len(found) > 0 {
		stem = stem[:found[0]]
	}
	stem = releaseTail.ReplaceAllString(stem, "")
	stem = strings.ReplaceAll(stem, ".", " ")
	stem = strings.ReplaceAll(stem, "_", " ")
	return strings.Trim(stem, " -"), kind, year
}
func mediaForFile(m download.MediaContext, name string) (download.MediaContext, error) {
	if m.Type != "movie" && len(m.Episodes) == 0 {
		if multiNumber.MatchString(name) {
			return m, fmt.Errorf("多集、特别篇或日期编号需要明确映射")
		}
		if match := tvNumber.FindStringSubmatch(name); len(match) > 0 {
			season, _ := strconv.Atoi(match[1])
			n, _ := strconv.Atoi(match[2])
			if m.Season == 0 {
				m.Season = season
			}
			m.Episodes = []int{n + m.Offset}
		} else if match := episodeNumber.FindStringSubmatch(name); len(match) > 0 {
			n, _ := strconv.Atoi(match[1])
			if m.Season == 0 {
				m.Season = 1
			}
			m.Episodes = []int{n + m.Offset}
		}
	}
	if err := ValidateMedia(m); err != nil {
		return m, err
	}
	if m.Type != "movie" && len(m.Episodes) != 1 {
		return m, fmt.Errorf("缺少季集对应关系，请确认映射")
	}
	return m, nil
}
func naming(r Rule, m download.MediaContext, name string) ([]string, string, error) {
	title := cleanName(m.Title)
	if title == "" {
		return nil, "", fmt.Errorf("作品名称不能用于文件名")
	}
	folder := title
	if m.Year > 0 {
		folder += fmt.Sprintf(" (%d)", m.Year)
	}
	if m.Provider == "tmdb" && regexp.MustCompile(`^[0-9]{1,15}$`).MatchString(m.ProviderID) {
		folder += " [tmdbid=" + m.ProviderID + "]"
	}
	base := folder
	directories := []string{folder}
	if r.Simple {
		directories = append([]string{download.Category(m.Type)}, directories...)
	}
	if m.Type != "movie" {
		if len(m.Episodes) != 1 {
			return nil, "", fmt.Errorf("缺少集数")
		}
		directories = append(directories, fmt.Sprintf("Season %02d", m.Season))
		base = fmt.Sprintf("%s - S%02dE%02d", title, m.Season, m.Episodes[0])
	}
	if r.KeepQuality {
		if q := quality.FindString(name); q != "" {
			base += " - " + strings.ToUpper(q)
		}
	}
	if r.KeepSubgroup && m.Subgroup != "" {
		group := cleanName(m.Subgroup)
		if group != "" {
			base += " - " + group
		}
	}
	base = cleanName(base)
	if base == "" || cleanName(folder) == "" {
		return nil, "", fmt.Errorf("目标名称过长")
	}
	return directories, base + path.Ext(name), nil
}
