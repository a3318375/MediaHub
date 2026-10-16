package store

import (
	"strings"
	"testing"

	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

func TestOrganizeLogNoiseAndReasons(t *testing.T) {
	for _, state := range []string{"running", "completed", "completed_with_issues"} {
		if _, message := organizeStateLog(organize.Plan{State: state}); message != "" {
			t.Fatalf("empty run produced log: %s", message)
		}
	}
	p := organize.Plan{State: "completed", Actions: []organize.Action{{State: "completed"}}}
	if _, message := organizeStateLog(p); message != "" {
		t.Fatal("file success should not produce redundant summary")
	}
	p.State = "completed_with_issues"
	p.Issues = []organize.Issue{{File: pan115.File{Name: "test.mp4"}, Message: "缺少作品绑定"}}
	level, message := organizeStateLog(p)
	if level != "WARN" || !strings.Contains(message, "完成 1 个文件") || !strings.Contains(message, "test.mp4：缺少作品绑定") {
		t.Fatal(message)
	}
	p.State = "paused"
	p.Error = "115 账号或连接异常"
	if _, message := organizeStateLog(p); !strings.Contains(message, p.Error) {
		t.Fatal(message)
	}
}
