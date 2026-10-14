package organize

import (
	"fmt"
	"github.com/robfig/cron/v3"
	"strings"
	"time"
)

var cronParser = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)

func ParseCron(expression string) (cron.Schedule, error) {
	if len(expression) > 128 || len(strings.Fields(expression)) != 5 {
		return nil, fmt.Errorf("Cron 需填写 5 段：分钟 小时 日 月 星期")
	}
	s, e := cronParser.Parse(expression)
	if e != nil {
		return nil, fmt.Errorf("Cron 表达式无效，请检查范围和格式")
	}
	if s.Next(time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600))).IsZero() {
		return nil, fmt.Errorf("Cron 没有有效触发日期，请检查日和月")
	}
	return s, nil
}
func CronExpression(r Rule) string {
	if r.Simple && r.Cron == "" && r.DailyAt == "" {
		return ""
	}
	if r.Cron != "" {
		return r.Cron
	}
	clock, e := time.Parse("15:04", r.DailyAt)
	if e != nil {
		return "0 3 * * *"
	}
	return fmt.Sprintf("%d %d * * *", clock.Minute(), clock.Hour())
}

// A Cron run is identified by its scheduled minute, rather than its calendar day.
func DueSlot(r Rule, now time.Time) string {
	if !r.Enabled {
		return ""
	}
	if r.Cron == "" {
		if Due(r, now) {
			return now.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
		}
		return ""
	}
	s, e := ParseCron(r.Cron)
	if e != nil {
		return ""
	}
	minute := now.In(time.FixedZone("Asia/Shanghai", 8*3600)).Truncate(time.Minute)
	if !s.Next(minute.Add(-time.Nanosecond)).Equal(minute) {
		return ""
	}
	return minute.UTC().Format(time.RFC3339)
}
