package organize

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"media-center/internal/download"
	"media-center/internal/pan115"
)

var ErrNotFound = errors.New("organize record not found")
var ErrConflict = errors.New("organize plan changed")

type Rule struct {
	Cron            string                 `json:"cron,omitempty"`
	ScheduleError   string                 `json:"scheduleError,omitempty"`
	Simple          bool                   `json:"simple,omitempty"`
	TargetID        string                 `json:"targetId,omitempty"`
	ID              string                 `json:"id"`
	Name            string                 `json:"name"`
	AccountID       string                 `json:"accountId"`
	SourceID        string                 `json:"sourceId"`
	MovieTargetID   string                 `json:"movieTargetId,omitempty"`
	TVTargetID      string                 `json:"tvTargetId,omitempty"`
	AnimeTargetID   string                 `json:"animeTargetId,omitempty"`
	ProgramTargetID string                 `json:"programTargetId,omitempty"`
	DailyAt         string                 `json:"dailyAt"`
	Enabled         bool                   `json:"enabled"`
	Recursive       bool                   `json:"recursive"`
	AllowExisting   bool                   `json:"allowExisting"`
	TypeHint        string                 `json:"typeHint"`
	Binding         *download.MediaContext `json:"binding,omitempty"`
	KeepQuality     bool                   `json:"keepQuality"`
	KeepSubgroup    bool                   `json:"keepSubgroup"`
	Version         int                    `json:"version"`
}
type Action struct {
	ID                string                `json:"id"`
	Source            pan115.File           `json:"source"`
	TargetRootID      string                `json:"targetRootId"`
	TargetDirectories []string              `json:"targetDirectories"`
	TargetParentID    string                `json:"targetParentId,omitempty"`
	TargetName        string                `json:"targetName"`
	Media             download.MediaContext `json:"media"`
	State             string                `json:"state"`
	Error             string                `json:"error,omitempty"`
}
type Issue struct {
	File    pan115.File `json:"file"`
	Code    string      `json:"code"`
	Message string      `json:"message"`
}
type Plan struct {
	ID        string   `json:"id"`
	Rule      Rule     `json:"rule"`
	State     string   `json:"state"`
	Mode      string   `json:"mode"`
	RunDate   string   `json:"runDate,omitempty"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
	Actions   []Action `json:"actions"`
	Issues    []Issue  `json:"issues"`
	Error     string   `json:"error,omitempty"`
	Revision  int      `json:"-"`
}
type Binding struct {
	Media download.MediaContext `json:"media"`
	Ready bool                  `json:"ready"`
	Size  int64                 `json:"size"`
	SHA1  string                `json:"sha1,omitempty"`
}

func ValidateMedia(m download.MediaContext) error {
	if m.Type != "movie" && m.Type != "tv" && m.Type != "anime" && m.Type != "program" {
		return fmt.Errorf("请选择电影、电视剧、动漫或节目")
	}
	if strings.TrimSpace(m.Title) == "" || len(m.Title) > 512 || m.Year != 0 && (m.Year < 1800 || m.Year > 2200) || m.Season < 0 || m.Season > 1000 || len(m.Episodes) > 1 {
		return fmt.Errorf("作品标题、年份或季集信息无效")
	}
	if len(m.Episodes) == 1 && (m.Episodes[0] < 1 || m.Episodes[0] > 10000) {
		return fmt.Errorf("单集编号超出范围")
	}
	for _, v := range []string{m.Provider, m.ProviderID, m.BangumiID, m.MikanID, m.Subgroup} {
		if len(v) > 512 {
			return fmt.Errorf("作品身份信息过长")
		}
	}
	return nil
}
func ValidateRule(r Rule) error {
	if strings.TrimSpace(r.Name) == "" || len(r.Name) > 200 {
		return fmt.Errorf("规则名称需为 1–200 字符")
	}
	if !pan115.ValidDirectory(r.SourceID) || r.SourceID == "0" {
		return fmt.Errorf("请选择具体的未整理目录")
	}
	count := 0
	for _, id := range r.Targets() {
		if !pan115.ValidDirectory(id) || id == "0" || id == r.SourceID {
			return fmt.Errorf("目标需为具体目录，且不能与来源相同")
		}
		count++
	}
	if count == 0 {
		return fmt.Errorf("至少配置一种媒体目标目录")
	}
	if r.Cron != "" {
		if _, err := ParseCron(r.Cron); err != nil && r.Enabled {
			return err
		}
	} else if !r.Simple || r.Enabled {
		if _, err := time.Parse("15:04", r.DailyAt); err != nil || len(r.DailyAt) != 5 {
			return fmt.Errorf("整理时间使用北京时间 HH:MM")
		}
	}
	if r.TypeHint != "auto" && r.TypeHint != "movie" && r.TypeHint != "tv" && r.TypeHint != "anime" && r.TypeHint != "program" {
		return fmt.Errorf("媒体类型提示无效")
	}
	if r.Binding != nil {
		return ValidateMedia(*r.Binding)
	}
	return nil
}
func (r Rule) Targets() []string {
	if r.Simple {
		return []string{r.TargetID}
	}
	out := []string{}
	for _, id := range []string{r.MovieTargetID, r.TVTargetID, r.AnimeTargetID, r.ProgramTargetID} {
		if id != "" {
			out = append(out, id)
		}
	}
	return out
}
func (r Rule) Target(kind string) string {
	if r.Simple {
		return r.TargetID
	}
	switch kind {
	case "movie":
		return r.MovieTargetID
	case "anime":
		if r.AnimeTargetID != "" {
			return r.AnimeTargetID
		}
	case "program":
		if r.ProgramTargetID != "" {
			return r.ProgramTargetID
		}
	}
	return r.TVTargetID
}
func Due(r Rule, now time.Time) bool {
	if !r.Enabled {
		return false
	}
	clock, err := time.Parse("15:04", r.DailyAt)
	if err != nil {
		return false
	}
	local := now.In(time.FixedZone("Asia/Shanghai", 8*3600))
	at := time.Date(local.Year(), local.Month(), local.Day(), clock.Hour(), clock.Minute(), 0, 0, local.Location())
	return !local.Before(at)
}
