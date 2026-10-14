package download

import (
	"context"
	"fmt"
	"media-center/internal/pan115"
	"time"
)

type AnimeDownloadRule struct {
	AccountID   string `json:"accountId,omitempty"`
	Enabled     bool   `json:"enabled"`
	DirectoryID string `json:"directoryId"`
	FromEpisode int    `json:"fromEpisode"`
}
type Candidate struct {
	ID             string    `json:"id"`
	SubscriptionID string    `json:"subscriptionId"`
	ResourceID     string    `json:"resourceId"`
	URL            string    `json:"url"`
	Kind           string    `json:"kind"`
	Episode        int       `json:"episode"`
	Title          string    `json:"title"`
	Reference      Reference `json:"reference"`
	State          string    `json:"state"`
	TaskID         string    `json:"taskId,omitempty"`
	Error          string    `json:"error,omitempty"`
	Attempts       int       `json:"attempts"`
	NextAttemptAt  string    `json:"nextAttemptAt,omitempty"`
	DirectoryID    string    `json:"-"`
}
type CandidateRepository interface {
	ReadyAnimeCandidates(string) ([]Candidate, error)
	SaveAnimeCandidate(Candidate) error
	AnimeCandidateEnabled(id, directory string) (bool, error)
}

func (s *Service) processCandidates(ctx context.Context) error {
	repo, ok := s.Store.(CandidateRepository)
	if !ok {
		return nil
	}
	cookie, e := s.Store.ReadSecret("115", "115.cookie")
	if e != nil {
		return nil
	}
	account, e := pan115.AccountID(cookie)
	if e != nil {
		return nil
	}
	items, err := repo.ReadyAnimeCandidates(account)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	for _, c := range items {
		if c.DirectoryID == "library" {
			repo, ok := s.Store.(LibraryRepository)
			if !ok {
				continue
			}
			config, e := repo.DownloadLibrary()
			if e != nil {
				return e
			}
			if config.SourceID == "" || config.AccountID != account {
				continue
			}
		}
		err = nil
		if err = ctx.Err(); err != nil {
			return err
		}
		if next, e := time.Parse(time.RFC3339Nano, c.NextAttemptAt); e == nil && s.Now().Before(next) {
			continue
		}
		c.State = "resolving"
		c.Attempts++
		if err = repo.SaveAnimeCandidate(c); err != nil {
			return err
		}
		magnet := c.URL
		if c.Kind == "torrent" {
			if s.FetchTorrent == nil {
				err = fmt.Errorf("种子获取尚未配置")
			} else {
				fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
				var data []byte
				data, err = s.FetchTorrent(fetchCtx, c.URL)
				cancel()
				if err == nil {
					var torrent Torrent
					torrent, err = ParseTorrent(data)
					magnet = torrent.Magnet
				}
			}
		} else if c.Kind != "magnet" {
			err = fmt.Errorf("资源不是种子或磁力")
		}
		if err == nil {
			var enabled bool
			enabled, err = repo.AnimeCandidateEnabled(c.ID, c.DirectoryID)
			if err == nil && !enabled {
				c.State = "pending"
				c.Attempts--
				c.Error = ""
				if err = repo.SaveAnimeCandidate(c); err != nil {
					return err
				}
				continue
			}
			if err == nil {
				var task Task
				directory := c.DirectoryID
				if directory == "library" {
					directory, err = s.ResolveLibraryDirectory(ctx, "anime")
				}
				if err == nil {
					task, _, err = s.enqueue(Request{Kind: "offline", URL: magnet, DirectoryID: directory, Reference: c.Reference}, account)
				}
				if err == nil {
					c.State = "queued"
					c.TaskID = task.ID
					c.Error = ""
					c.NextAttemptAt = ""
				}
			}
		}
		if err != nil {
			c.State = "retry"
			c.Error = "资源解析或下载入队失败，请检查种子、凭证和目录"
			c.NextAttemptAt = s.Now().Add(time.Duration(c.Attempts) * time.Minute).UTC().Format(time.RFC3339Nano)
			if c.Attempts >= 3 {
				c.State = "failed"
			}
		}
		if e := repo.SaveAnimeCandidate(c); e != nil {
			return e
		}
	}
	return nil
}
