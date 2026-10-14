package download

import (
	"context"
	"errors"
	"fmt"
	"math"
	"path"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
	"media-center/internal/pan115"
)

var ErrNotFound = errors.New("download not found")
var ErrConflict = errors.New("download changed")
var ErrQueueFull = errors.New("download queue full")

type Repository interface {
	ReadSecret(section, key string) (string, error)
	CreateDownload(account, hash string, r Request) (Task, bool, error)
	ListDownloads(active bool) ([]Task, error)
	GetDownload(id string) (Task, error)
	SaveDownload(t Task) error
}
type Factory func(context.Context, string) (pan115.Gateway, error)
type Service struct {
	Store        Repository
	Factory      Factory
	mu           sync.Mutex
	directoryMu  sync.Mutex
	wake         chan struct{}
	Now          func() time.Time
	FetchTorrent func(context.Context, string) ([]byte, error)
}

func New(r Repository) *Service {
	limiter := rate.NewLimiter(rate.Every(time.Second), 1)
	return &Service{Store: r, Now: time.Now, wake: make(chan struct{}, 1), Factory: func(ctx context.Context, cookie string) (pan115.Gateway, error) {
		return pan115.New(ctx, cookie, limiter, nil)
	}}
}
func (s *Service) Wake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}
func (s *Service) Enqueue(r Request) (Task, bool, error) {
	return s.enqueue(r, "")
}
func (s *Service) enqueue(r Request, expectedAccount string) (Task, bool, error) {
	hash, err := Validate(&r)
	if err != nil {
		return Task{}, false, err
	}
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	if err != nil {
		return Task{}, false, err
	}
	account, err := pan115.AccountID(cookie)
	if err != nil {
		return Task{}, false, err
	}
	if expectedAccount != "" && account != expectedAccount {
		return Task{}, false, &pan115.Error{Code: "account_changed", Message: "115 账号已变更，等待核对下载目录", Certain: true}
	}
	t, created, err := s.Store.CreateDownload(account, hash, r)
	if err == nil {
		s.Wake()
	}
	return t, created, err
}

// Cancel stops local submission/monitoring. It never deletes remote tasks or files.
func (s *Service) Cancel(id string) (Task, error) {
	t, err := s.Store.GetDownload(id)
	if err != nil {
		return t, err
	}
	if !t.Active() {
		return t, ErrConflict
	}
	t.StateBeforeCancel = t.State
	t.State = "cancelled"
	t.ErrorCode = ""
	t.Error = ""
	t.Speed = 0
	if err = s.Store.SaveDownload(t); err != nil {
		return t, err
	}
	return s.Store.GetDownload(id)
}

func (s *Service) Retry(id string) (Task, error) {
	t, err := s.Store.GetDownload(id)
	if err != nil {
		return t, err
	}
	if t.State != "failed" || t.RemoteID != "" || len(t.Artifacts) != 0 {
		return t, ErrConflict
	}
	switch t.ErrorCode {
	case "quota", "invalid_resource", "credential", "invalid_directory", "selection_changed", "empty_share", "scan_limit", "share_unavailable", "share_password":
	default:
		return t, ErrConflict
	}
	t.State = "queued"
	t.SubmissionStartedAt = ""
	t.NextCheckAt = ""
	t.PollFailures = 0
	t.ErrorCode = ""
	t.Error = ""
	if err = s.Store.SaveDownload(t); err != nil {
		return t, err
	}
	s.Wake()
	return s.Store.GetDownload(id)
}
func (s *Service) Resume(id string) (Task, error) {
	t, err := s.Store.GetDownload(id)
	if err != nil {
		return t, err
	}
	if t.State != "cancelled" {
		return t, ErrConflict
	}
	t.State = "unknown"
	if t.SubmissionStartedAt == "" && (t.StateBeforeCancel == "queued" || t.StateBeforeCancel == "preparing") {
		t.State = t.StateBeforeCancel
	}
	t.NextCheckAt = ""
	t.PollFailures = 0
	t.ErrorCode = ""
	t.Error = ""
	if err = s.Store.SaveDownload(t); err != nil {
		return t, err
	}
	s.Wake()
	return s.Store.GetDownload(id)
}
func (s *Service) saveError(t Task, err error) error {
	e := pan115.SafeError(err)
	t.ErrorCode = e.Code
	t.Error = e.Message
	t.Speed = 0
	t.PollFailures = min(t.PollFailures+1, 6)
	t.LastCheckedAt = s.Now().UTC().Format(time.RFC3339Nano)
	t.NextCheckAt = s.Now().Add(time.Duration(1<<t.PollFailures) * 30 * time.Second).UTC().Format(time.RFC3339Nano)
	return s.Store.SaveDownload(t)
}
func (s *Service) CredentialsChanged() error {
	tasks, err := s.Store.ListDownloads(true)
	if err != nil {
		return err
	}
	for _, t := range tasks {
		t.NextCheckAt = ""
		t.PollFailures = 0
		if err = s.Store.SaveDownload(t); err != nil && !errors.Is(err, ErrConflict) {
			return err
		}
	}
	s.Wake()
	return nil
}
func (s *Service) Run(ctx context.Context, report func(string)) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		work, cancel := context.WithTimeout(ctx, 2*time.Minute)
		err := s.Tick(work)
		cancel()
		if err != nil && ctx.Err() == nil && report != nil {
			report("公共下载任务查询或保存失败，稍后恢复")
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
	}
}
func (s *Service) Tick(ctx context.Context) (resultErr error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var submissions sync.WaitGroup
	slots := make(chan struct{}, 5)
	var errorMu sync.Mutex
	var submitError error
	defer func() {
		submissions.Wait()
		if resultErr == nil {
			resultErr = submitError
		}
	}()
	if err := s.processCandidates(ctx); err != nil {
		return err
	}
	tasks, err := s.Store.ListDownloads(true)
	if err != nil || len(tasks) == 0 {
		return err
	}
	ready := tasks[:0]
	for _, t := range tasks {
		next, e := time.Parse(time.RFC3339Nano, t.NextCheckAt)
		if e != nil || !s.Now().Before(next) {
			ready = append(ready, t)
		}
	}
	tasks = ready
	if len(tasks) == 0 {
		return nil
	}
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	account := ""
	if err == nil {
		account, err = pan115.AccountID(cookie)
	}
	if err != nil {
		for _, t := range tasks {
			if e := s.saveError(t, err); e != nil && !errors.Is(e, ErrConflict) {
				return e
			}
		}
		return nil
	}
	gateway, err := s.Factory(ctx, cookie)
	if err == nil {
		err = gateway.CheckAccount()
	}
	if err != nil {
		for _, t := range tasks {
			if e := s.saveError(t, err); e != nil && !errors.Is(e, ErrConflict) {
				return e
			}
		}
		return nil
	}
	remote := []pan115.RemoteTask{}
	for _, t := range tasks {
		if t.Kind == "offline" {
			remote, err = gateway.OfflineTasks()
			break
		}
	}
	if err != nil {
		for _, t := range tasks {
			if e := s.saveError(t, err); e != nil && !errors.Is(e, ErrConflict) {
				return e
			}
		}
		return nil
	}
	index := map[string]pan115.RemoteTask{}
	for _, r := range remote {
		index[strings.ToLower(r.Hash)] = r
	}
	for _, snapshot := range tasks {
		if err = ctx.Err(); err != nil {
			return err
		}
		// Reload to observe cancellations/reference additions made during remote queries.
		t, e := s.Store.GetDownload(snapshot.ID)
		if e != nil {
			return e
		}
		if !t.Active() {
			continue
		}
		if t.AccountID != account {
			if e = s.saveError(t, &pan115.Error{Code: "account_changed", Message: "115 账号已变更，此任务等待原账号恢复", Certain: true}); e != nil && !errors.Is(e, ErrConflict) {
				return e
			}
			continue
		}
		if t.Kind == "share_transfer" {
			if e = s.processShare(gateway, t); e != nil && !errors.Is(e, ErrConflict) {
				return e
			}
			continue
		}
		r, found := index[t.ResourceID]
		if t.RemoteID != "" {
			r, found = index[t.RemoteID]
		}
		t.LastCheckedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if found {
			t.PollFailures = 0
			t.NextCheckAt = ""
			if r.DirectoryID != "" && r.DirectoryID != t.DirectoryID {
				t.State = "unknown"
				t.ErrorCode = "destination_conflict"
				t.Error = "115 已有同资源任务位于其他目录，需人工核对"
				t.Speed = 0
				if e = s.Store.SaveDownload(t); e != nil && !errors.Is(e, ErrConflict) {
					return e
				}
				continue
			}
			t.RemoteID = r.Hash
			t.Progress = finite(r.Percent, 0, 100)
			t.Speed = finite(r.Speed, 0, math.MaxFloat64)
			t.Size = max(0, r.Size)
			t.ErrorCode = ""
			t.Error = ""
			switch r.Status {
			case -1:
				t.State = "failed"
				t.ErrorCode = "remote_failed"
				t.Error = "115 离线下载失败"
				t.Speed = 0
			case 0:
				t.State = "submitted"
			case 1:
				t.State = "downloading"
			case 2:
				t.State = "awaiting_files"
				t.Speed = 0
				if r.FileID != "" {
					t.RootFileID = r.FileID
				}
				if e = s.confirmFiles(gateway, &t); e != nil {
					safe := pan115.SafeError(e)
					t.ErrorCode = safe.Code
					t.Error = safe.Message
				}
			default:
				t.State = "unknown"
				t.ErrorCode = "unknown_status"
				t.Error = "115 返回未知状态，继续核对"
			}
		} else if t.State == "queued" {
			// Validate the destination BEFORE marking the irreversible submission boundary.
			folder, e := gateway.GetFile(t.DirectoryID)
			if e != nil {
				if e = s.saveError(t, e); e != nil && !errors.Is(e, ErrConflict) {
					return e
				}
				continue
			}
			if !folder.Directory {
				t.State = "failed"
				t.ErrorCode = "invalid_directory"
				t.Error = "115 下载目标不是目录"
			} else {
				select {
				case slots <- struct{}{}:
				case <-ctx.Done():
					return ctx.Err()
				}
				t.State = "submitting"
				t.SubmissionStartedAt = s.Now().UTC().Format(time.RFC3339Nano)
				t.ErrorCode = ""
				t.Error = ""
				if e = s.Store.SaveDownload(t); e != nil {
					<-slots
					if errors.Is(e, ErrConflict) {
						continue
					}
					return e
				}
				t, e = s.Store.GetDownload(t.ID)
				if e != nil {
					<-slots
					return e
				}
				if t.State != "submitting" {
					<-slots
					continue
				}
				submissions.Add(1)
				go func(task Task) {
					defer submissions.Done()
					defer func() { <-slots }()
					if err := s.submitOffline(gateway, task); err != nil && !errors.Is(err, ErrConflict) {
						errorMu.Lock()
						if submitError == nil {
							submitError = err
						}
						errorMu.Unlock()
					}
				}(t)
				continue
			}
		} else {
			t.State = "unknown"
			t.ErrorCode = "task_missing"
			t.Error = "115 离线任务未找到，等待核对；不会自动重复提交"
			t.Speed = 0
			if t.RootFileID != "" {
				if e = s.confirmFiles(gateway, &t); e != nil {
					safe := pan115.SafeError(e)
					t.ErrorCode = safe.Code
					t.Error = safe.Message
				}
			}
		}
		if e = s.Store.SaveDownload(t); e != nil && !errors.Is(e, ErrConflict) {
			return e
		}
	}
	return nil
}
func (s *Service) submitOffline(gateway pan115.Gateway, t Task) error {
	// Check cancellations again at dispatch, and retain the original revision so a
	// cancellation during the request cannot be overwritten by its response.
	current, e := s.Store.GetDownload(t.ID)
	if e != nil {
		return e
	}
	if current.State != "submitting" || current.Revision != t.Revision {
		return nil
	}
	hash, err := gateway.Submit(t.URL, t.DirectoryID)
	if err != nil {
		safe := pan115.SafeError(err)
		t.ErrorCode = safe.Code
		t.Error = safe.Message
		t.State = "unknown"
		if safe.Certain {
			t.State = "failed"
		}
	} else if hash != t.ResourceID {
		t.State = "unknown"
		t.ErrorCode = "hash_mismatch"
		t.Error = "115 返回的资源标识不匹配，需人工核对"
	} else {
		t.RemoteID = hash
		t.State = "submitted"
	}
	return s.Store.SaveDownload(t)
}
func finite(n, low, high float64) float64 {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return low
	}
	return min(high, max(low, n))
}

var videos = map[string]bool{".mkv": true, ".mp4": true, ".avi": true, ".mov": true, ".m4v": true, ".ts": true, ".m2ts": true, ".webm": true, ".wmv": true, ".flv": true, ".mpg": true}

func (s *Service) confirmFiles(g pan115.Gateway, t *Task) error {
	if t.RootFileID == "" {
		return &pan115.Error{Code: "awaiting_files", Message: "115 已完成，等待产物文件标识", Certain: false}
	}
	root, err := g.GetFile(t.RootFileID)
	if err != nil {
		return err
	}
	files := []pan115.File{}
	paths := map[string]pan115.File{}
	var walk func(pan115.File, int, string) error
	walk = func(f pan115.File, depth int, prefix string) error {
		if depth > 8 || len(files) >= 2000 {
			return &pan115.Error{Code: "scan_limit", Message: "下载产物超过扫描限制，需人工核对", Certain: true}
		}
		if f.Directory {
			children, e := g.ListFiles(f.ID)
			if e != nil {
				return e
			}
			for _, child := range children {
				if !safeTorrentSegment(child.Name) {
					return fmt.Errorf("文件名无效")
				}
				if e = walk(child, depth+1, path.Join(prefix, child.Name)); e != nil {
					return e
				}
			}
			return nil
		}
		if f.ID == "" || f.Size < 0 || (t.Kind != "share_transfer" && f.Size == 0) {
			return fmt.Errorf("文件尚未就绪")
		}
		files = append(files, f)
		paths[prefix] = f
		return nil
	}
	if err = walk(root, 0, ""); err != nil {
		return err
	}
	hasVideo := false
	for _, f := range files {
		if videos[strings.ToLower(path.Ext(f.Name))] {
			hasVideo = true
		}
	}
	if t.Kind == "share_transfer" {
		if len(t.Manifest) == 0 {
			return fmt.Errorf("分享文件清单缺失")
		}
		for _, expected := range t.Manifest {
			actual, ok := paths[expected.Path]
			if !ok || actual.Size != expected.Size || (expected.SHA1 != "" && !strings.EqualFold(actual.SHA1, expected.SHA1)) {
				return &pan115.Error{Code: "awaiting_files", Message: "115 转存文件尚未全部确认", Certain: false}
			}
		}
	} else if !hasVideo {
		return &pan115.Error{Code: "awaiting_files", Message: "尚未确认视频产物，等待核对", Certain: false}
	}
	t.Artifacts = files
	t.State = "completed"
	t.Progress = 100
	t.ErrorCode = ""
	t.Error = ""
	return nil
}
