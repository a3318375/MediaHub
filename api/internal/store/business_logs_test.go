package store

import (
	"media-center/internal/anime"
	"media-center/internal/download"
	"testing"
)

func TestBusinessLogsExcludeRequestsAndDeduplicateStates(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.RecordLog("api", "INFO", "GET /api/health"); err != nil {
		t.Fatal(err)
	}
	sub, err := db.CreateAnime(anime.Draft{Title: "测试作品", BangumiID: "1", Season: 1})
	if err != nil {
		t.Fatal(err)
	}
	logs, err := db.ListLogs("", "", "", 100)
	if err != nil || len(logs) != 1 || logs[0].Message != "添加订阅：《测试作品》" {
		t.Fatalf("%+v %v", logs, err)
	}
	sub.LastCheckedAt = "2026-10-14T12:00:00Z"
	if _, err = db.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	if _, err = db.SaveAnimeRefresh(sub); err != nil {
		t.Fatal(err)
	}
	logs, err = db.ListLogs("", "刷新", "", 100)
	if err != nil || len(logs) != 1 {
		t.Fatalf("refresh duplicated: %+v %v", logs, err)
	}
	task, _, err := db.CreateDownload("123", "resource", download.Request{Kind: "offline", DirectoryID: "10", Reference: download.Reference{Source: "manual", Media: download.MediaContext{Title: "测试资源"}}})
	if err != nil {
		t.Fatal(err)
	}
	task.State = "completed"
	if err = db.SaveDownload(task); err != nil {
		t.Fatal(err)
	}
	task, err = db.GetDownload(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.SaveDownload(task); err != nil {
		t.Fatal(err)
	}
	logs, err = db.ListLogs("", "下载", "", 100)
	if err != nil || len(logs) != 2 || logs[0].Message != "下载完成：测试资源" {
		t.Fatalf("%+v %v", logs, err)
	}
}
