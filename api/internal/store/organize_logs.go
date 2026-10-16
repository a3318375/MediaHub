package store

import (
	"fmt"
	"strings"

	"mediahub/internal/organize"
)

// Successful files already have individual logs; empty scheduled runs stay quiet.
func organizeStateLog(p organize.Plan) (string, string) {
	switch p.State {
	case "running":
		if len(p.Actions) > 0 {
			return "INFO", fmt.Sprintf("开始整理：%s；计划处理 %d 个文件", p.Rule.Name, len(p.Actions))
		}
	case "paused":
		reason := p.Error
		if reason == "" {
			reason = "请核对整理任务状态后恢复"
		}
		return "WARN", "整理暂停：" + p.Rule.Name + "；" + reason
	case "completed_with_issues":
		completed, conflicts := 0, 0
		reasons := []string{}
		addReason := func(name, message string) {
			if len(reasons) >= 3 || message == "" {
				return
			}
			if name != "" {
				message = name + "：" + message
			}
			reasons = append(reasons, message)
		}
		for _, a := range p.Actions {
			if a.State == "completed" {
				completed++
			}
			if a.State == "conflict" {
				conflicts++
				addReason(a.Source.Name, a.Error)
			}
		}
		for _, issue := range p.Issues {
			addReason(issue.File.Name, issue.Message)
		}
		if len(p.Issues) == 0 && conflicts == 0 && p.Error == "" {
			return "", ""
		}
		message := fmt.Sprintf("整理需处理：%s；完成 %d 个文件，冲突 %d 项，其他问题 %d 项", p.Rule.Name, completed, conflicts, len(p.Issues))
		addReason("", p.Error)
		if len(reasons) > 0 {
			message += "；" + strings.Join(reasons, "；")
		}
		if len(p.Issues)+conflicts > len(reasons) {
			message += "；其余问题见整理记录"
		}
		return "WARN", message
	}
	return "", ""
}
