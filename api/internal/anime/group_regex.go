package anime

import (
	"regexp"
	"strings"
)

type RegexItem struct {
	Label string `json:"label"`
	Regex string `json:"regex"`
}
type GroupRegex struct {
	RegexList [][]RegexItem `json:"regexList"`
	Tags      []string      `json:"tags"`
}

var groupPatterns = func() []*regexp.Regexp {
	patterns := []string{`1920[Xx]1080`, `3840[Xx]2160`, `1080[Pp]`, `720[Pp]`, `4[Kk]`, `繁`, `简`, `日`, `内嵌`, `内封`, `外挂`, `(?i)cht`, `(?i)chs`, `(?i)avc`, `(?i)hevc`, `(?i)h264`, `(?i)h265`, `(?i)10bit`, `(?i)mp4`, `(?i)mkv`}
	result := make([]*regexp.Regexp, 0, len(patterns))
	for _, pattern := range patterns {
		result = append(result, regexp.MustCompile(pattern))
	}
	return result
}()

// Recognition patterns are fixed; options are combinations actually present in release titles.
func BuildGroupRegex(titles []string) GroupRegex {
	result := GroupRegex{RegexList: [][]RegexItem{}, Tags: []string{}}
	seenOptions := map[string]bool{}
	seenTags := map[string]bool{}
	for _, title := range titles {
		items := []RegexItem{}
		key := []string{}
		for _, pattern := range groupPatterns {
			label := pattern.FindString(title)
			if label == "" {
				continue
			}
			items = append(items, RegexItem{Label: label, Regex: pattern.String()})
			key = append(key, pattern.String()+"="+label)
			if !seenTags[label] && len(result.Tags) < 5 {
				result.Tags = append(result.Tags, label)
				seenTags[label] = true
			}
		}
		identity := strings.Join(key, "\x00")
		if len(items) > 0 && !seenOptions[identity] {
			seenOptions[identity] = true
			result.RegexList = append(result.RegexList, items)
		}
	}
	return result
}
