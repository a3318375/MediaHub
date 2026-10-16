package store

import (
	"database/sql"
	"fmt"
	"mediahub/internal/download"
	"time"
)

func recordBusinessLog(tx *sql.Tx, source, level, message string) error {
	if _, err := tx.Exec(`INSERT INTO activity_logs(occurred_at,source,level,message) VALUES(?,?,?,?)`, time.Now().UTC().Format(time.RFC3339Nano), source, level, message); err != nil {
		return err
	}
	_, err := tx.Exec(`DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 5000)`)
	return err
}

func logDownloadState(tx *sql.Tx, task download.Task, title string) error {
	source := "下载"
	if task.Kind == "share_transfer" {
		source = "转存"
	}
	labels := map[string]string{"queued": "已加入队列", "submitting": "开始提交", "submitted": "115 已接收任务", "awaiting_files": "正在确认文件", "completed": "完成", "failed": "失败", "unknown": "结果待核对", "cancelled": "已停止跟踪"}
	label, ok := labels[task.State]
	if !ok {
		return nil
	}
	if title == "" {
		title = "任务 " + task.ID
	}
	level := "INFO"
	message := fmt.Sprintf("%s%s：%s", source, label, title)
	if task.State == "failed" {
		level = "ERROR"
		message += "；" + task.Error
	}
	if task.State == "unknown" {
		level = "WARN"
		message += "；" + task.Error
	}
	return recordBusinessLog(tx, source, level, message)
}
