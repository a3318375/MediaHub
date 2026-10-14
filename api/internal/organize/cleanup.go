package organize

import (
	"context"
	"fmt"
	"media-center/internal/pan115"
)

type emptyDirectoryGateway interface {
	DeleteEmptyDirectory(string) error
}

func (s *Service) cleanupEmptyDirectories(ctx context.Context, g pan115.FileGateway, rule Rule) error {
	remover, ok := g.(emptyDirectoryGateway)
	if !ok {
		return fmt.Errorf("115 空目录清理不可用")
	}
	rules, err := s.Store.OrganizeRules()
	if err != nil {
		return err
	}
	protected := map[string]bool{"0": true, rule.SourceID: true}
	for _, r := range rules {
		if r.AccountID != rule.AccountID {
			continue
		}
		protected[r.SourceID] = true
		for _, id := range r.Targets() {
			protected[id] = true
		}
	}
	active, err := s.Store.OrganizeUnfinished(rule.AccountID)
	if err != nil {
		return err
	}
	for _, task := range active {
		if task.AccountID != rule.AccountID {
			continue
		}
		id := task.DirectoryID
		seen := map[string]bool{}
		for depth := 0; id != "" && id != "0"; depth++ {
			if depth >= 32 || seen[id] {
				return fmt.Errorf("下载目录层级异常")
			}
			seen[id] = true
			protected[id] = true
			parent, err := g.GetFile(id)
			if err != nil {
				return pan115.SafeError(err)
			}
			id = parent.ParentID
		}
	}
	visited := map[string]bool{}
	var clean func(string, int) error
	clean = func(id string, depth int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if depth > 8 || visited[id] || len(visited) >= 2000 {
			return fmt.Errorf("空目录清理超过扫描限制")
		}
		visited[id] = true
		items, err := g.ListFiles(id)
		if err != nil {
			return pan115.SafeError(err)
		}
		for _, f := range items {
			if f.ParentID != id {
				return fmt.Errorf("目录父级不匹配，停止清理")
			}
			if !f.Directory || protected[f.ID] || skipDirectory(f.Name) {
				continue
			}
			if rule.Recursive {
				if err := clean(f.ID, depth+1); err != nil {
					return err
				}
			}
			// Re-read immediately before deletion; never delete a directory with remaining files.
			current, err := g.GetFile(f.ID)
			if err != nil {
				return pan115.SafeError(err)
			}
			if !current.Directory || current.ParentID != id {
				return fmt.Errorf("目录已变更，停止清理")
			}
			remaining, err := g.ListFiles(f.ID)
			if err != nil {
				return pan115.SafeError(err)
			}
			if len(remaining) == 0 {
				if err := remover.DeleteEmptyDirectory(f.ID); err != nil {
					return pan115.SafeError(err)
				}
			}
		}
		return nil
	}
	return clean(rule.SourceID, 0)
}
