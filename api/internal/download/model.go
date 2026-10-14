package download

import (
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"media-center/internal/pan115"
)

type MediaContext struct {
	Type             string `json:"type,omitempty"`
	Title            string `json:"title,omitempty"`
	Year             int    `json:"year,omitempty"`
	Provider         string `json:"provider,omitempty"`
	ProviderID       string `json:"providerId,omitempty"`
	BangumiID        string `json:"bangumiId,omitempty"`
	MikanID          string `json:"mikanId,omitempty"`
	Season           int    `json:"season,omitempty"`
	Episodes         []int  `json:"episodes,omitempty"`
	OriginalEpisodes []int  `json:"originalEpisodes,omitempty"`
	Offset           int    `json:"offset,omitempty"`
	Subgroup         string `json:"subgroup,omitempty"`
	RuleVersion      string `json:"ruleVersion,omitempty"`
}
type Reference struct {
	Source   string       `json:"source"`
	SourceID string       `json:"sourceId,omitempty"`
	Media    MediaContext `json:"media"`
}
type Request struct {
	WholeShare        bool      `json:"wholeShare,omitempty"`
	Kind              string    `json:"kind"`
	URL               string    `json:"url"`
	DirectoryID       string    `json:"directoryId"`
	Reference         Reference `json:"reference"`
	ReceiveCode       string    `json:"receiveCode,omitempty"`
	SourceDirectoryID string    `json:"sourceDirectoryId,omitempty"`
	FileIDs           []string  `json:"fileIds,omitempty"`
}
type Task struct {
	WholeShare          bool           `json:"wholeShare,omitempty"`
	ID                  string         `json:"id"`
	AccountID           string         `json:"accountId"`
	Kind                string         `json:"kind"`
	URL                 string         `json:"url"`
	ResourceID          string         `json:"resourceId"`
	DirectoryID         string         `json:"directoryId"`
	State               string         `json:"state"`
	RemoteID            string         `json:"remoteId,omitempty"`
	RootFileID          string         `json:"rootFileId,omitempty"`
	Progress            float64        `json:"progress"`
	Speed               float64        `json:"speed"`
	Size                int64          `json:"size"`
	ErrorCode           string         `json:"errorCode,omitempty"`
	Error               string         `json:"error,omitempty"`
	CreatedAt           string         `json:"createdAt"`
	UpdatedAt           string         `json:"updatedAt"`
	LastCheckedAt       string         `json:"lastCheckedAt,omitempty"`
	NextCheckAt         string         `json:"nextCheckAt,omitempty"`
	PollFailures        int            `json:"pollFailures,omitempty"`
	References          []Reference    `json:"references"`
	Artifacts           []pan115.File  `json:"artifacts"`
	Revision            int            `json:"-"`
	SourceDirectoryID   string         `json:"sourceDirectoryId,omitempty"`
	FileIDs             []string       `json:"fileIds,omitempty"`
	Manifest            []ManifestFile `json:"manifest,omitempty"`
	SubmissionStartedAt string         `json:"submissionStartedAt,omitempty"`
	StateBeforeCancel   string         `json:"stateBeforeCancel,omitempty"`
}

func (t Task) Active() bool {
	return t.State != "completed" && t.State != "failed" && t.State != "cancelled"
}

// P1 deliberately accepts magnets only. HTTP torrent and share URLs are not offline magnets.
func NormalizeMagnet(raw string) (string, string, error) {
	if len(raw) > 8192 {
		return "", "", fmt.Errorf("磁力链接过长")
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !strings.EqualFold(u.Scheme, "magnet") || u.Host != "" || u.Fragment != "" || u.Path != "" || u.User != nil {
		return "", "", fmt.Errorf("需要有效的 BT v1 磁力链接")
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "", "", fmt.Errorf("磁力参数无效")
	}
	var hash string
	for _, xt := range q["xt"] {
		if !strings.HasPrefix(strings.ToLower(xt), "urn:btih:") {
			continue
		}
		value := xt[len("urn:btih:"):]
		var b []byte
		if len(value) == 40 {
			b, err = hex.DecodeString(value)
		} else if len(value) == 32 {
			b, err = base32.StdEncoding.DecodeString(strings.ToUpper(value))
		} else {
			return "", "", fmt.Errorf("BT infoHash 无效")
		}
		if err != nil || len(b) != 20 {
			return "", "", fmt.Errorf("BT infoHash 无效")
		}
		normal := hex.EncodeToString(b)
		if hash != "" && hash != normal {
			return "", "", fmt.Errorf("磁力链接包含不同资源")
		}
		hash = normal
	}
	if hash == "" {
		return "", "", fmt.Errorf("需要 BT v1 infoHash，暂不支持纯 v2 磁力")
	}
	q.Set("xt", "urn:btih:"+hash)
	return "magnet:?" + q.Encode(), hash, nil
}
func Validate(r *Request) (string, error) {
	if r.Kind != "offline" && r.Kind != "share_transfer" {
		return "", fmt.Errorf("仅支持磁力离线或 115 分享转存")
	}
	if !pan115.ValidDirectory(r.DirectoryID) || r.DirectoryID == "0" {
		return "", fmt.Errorf("请选择具体的 115 下载目录 ID")
	}
	if r.Reference.Source == "" {
		r.Reference.Source = "manual"
	}
	if len(r.Reference.Source) > 64 || len(r.Reference.SourceID) > 200 {
		return "", fmt.Errorf("来源标识过长")
	}
	m := r.Reference.Media
	if m.Year != 0 && (m.Year < 1800 || m.Year > 2200) {
		return "", fmt.Errorf("作品年份超出范围")
	}
	if m.Type != "" && m.Type != "movie" && m.Type != "tv" && m.Type != "anime" && m.Type != "program" {
		return "", fmt.Errorf("媒体类型无效")
	}
	for _, s := range []string{m.Title, m.Provider, m.ProviderID, m.BangumiID, m.MikanID, m.Subgroup, m.RuleVersion} {
		if len(s) > 512 {
			return "", fmt.Errorf("作品信息过长")
		}
	}
	if m.Season < 0 || m.Season > 1000 || m.Offset < -10000 || m.Offset > 10000 || len(m.Episodes) > 1000 || len(m.OriginalEpisodes) > 1000 {
		return "", fmt.Errorf("季集参数超出范围")
	}
	for _, list := range [][]int{m.Episodes, m.OriginalEpisodes} {
		for _, n := range list {
			if n < 0 || n > 10000 {
				return "", fmt.Errorf("集数超出范围")
			}
		}
	}
	if r.Kind == "share_transfer" {
		return validateShare(r)
	}
	magnet, hash, err := NormalizeMagnet(r.URL)
	if err != nil {
		return "", err
	}
	r.URL = magnet
	return hash, nil
}
func ReferenceKey(r Reference) string {
	b, _ := json.Marshal(r)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
