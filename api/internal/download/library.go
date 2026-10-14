package download

import (
	"context"
	"fmt"
	"media-center/internal/pan115"
	"strings"
)

type LibraryConfig struct{ AccountID, SourceID string }
type LibraryRepository interface{ DownloadLibrary() (LibraryConfig, error) }

func Category(kind string) string {
	switch kind {
	case "movie":
		return "电影"
	case "tv":
		return "电视剧"
	case "anime":
		return "动漫"
	case "program":
		return "节目"
	default:
		return "待识别"
	}
}

// ResolveLibraryDirectory is shared by manual resources and RSS candidates.
func (s *Service) ResolveLibraryDirectory(ctx context.Context, kind string) (string, error) {
	s.directoryMu.Lock()
	defer s.directoryMu.Unlock()
	repo, ok := s.Store.(LibraryRepository)
	if !ok {
		return "", fmt.Errorf("请先在设置中配置未整理目录")
	}
	config, e := repo.DownloadLibrary()
	if e != nil {
		return "", e
	}
	if config.SourceID == "" {
		return "", fmt.Errorf("请先在设置中配置未整理目录")
	}
	cookie, e := s.Store.ReadSecret("115", "115.cookie")
	if e != nil {
		return "", e
	}
	account, e := pan115.AccountID(cookie)
	if e != nil {
		return "", e
	}
	if account != config.AccountID {
		return "", fmt.Errorf("115 账号已变更，请重新保存目录设置")
	}
	g, e := s.Factory(ctx, cookie)
	if e != nil {
		return "", e
	}
	if e = g.CheckAccount(); e != nil {
		return "", pan115.SafeError(e)
	}
	root, e := g.GetFile(config.SourceID)
	if e != nil {
		return "", pan115.SafeError(e)
	}
	if !root.Directory {
		return "", fmt.Errorf("未整理目录不是文件夹")
	}
	list, e := g.ListFiles(root.ID)
	if e != nil {
		return "", pan115.SafeError(e)
	}
	name := Category(kind)
	id := ""
	for _, f := range list {
		if strings.EqualFold(f.Name, name) {
			if !f.Directory || id != "" {
				return "", fmt.Errorf("媒体分类目录重名，请核对未整理目录")
			}
			id = f.ID
		}
	}
	if id != "" {
		return id, nil
	}
	creator, ok := g.(interface {
		CreateDirectory(string, string) (pan115.File, error)
	})
	if !ok {
		return "", fmt.Errorf("115 创建目录不可用")
	}
	folder, e := creator.CreateDirectory(root.ID, name)
	if e != nil {
		return "", pan115.SafeError(e)
	}
	if !folder.Directory || folder.ParentID != root.ID {
		return "", fmt.Errorf("分类目录创建结果异常")
	}
	return folder.ID, nil
}
