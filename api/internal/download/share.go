package download

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"

	"media-center/internal/pan115"
)

var shareCodePattern = regexp.MustCompile(`^[A-Za-z0-9]{4,64}$`)
var receiveCodePattern = regexp.MustCompile(`^[A-Za-z0-9]{0,32}$`)

func ParseShare(raw, password string) (canonical, code, receive string, err error) {
	u, e := url.Parse(strings.TrimSpace(raw))
	if e != nil || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || (u.Host != "115.com" && u.Host != "115cdn.com" && u.Host != "anxia.com") {
		return "", "", "", fmt.Errorf("需要 115 分享链接")
	}
	code = strings.TrimPrefix(u.Path, "/s/")
	if u.Path == code || !shareCodePattern.MatchString(code) {
		return "", "", "", fmt.Errorf("115 分享标识无效")
	}
	if password == "" {
		password = u.Query().Get("password")
	}
	if !receiveCodePattern.MatchString(password) {
		return "", "", "", fmt.Errorf("115 提取码格式无效")
	}
	return "https://115.com/s/" + code, code, password, nil
}

type ManifestFile struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
	SHA1 string `json:"sha1,omitempty"`
}

func validateShare(r *Request) (string, error) {
	canonical, code, password, err := ParseShare(r.URL, r.ReceiveCode)
	if err != nil {
		return "", err
	}
	r.URL = canonical
	r.ReceiveCode = password
	if r.SourceDirectoryID == "" {
		r.SourceDirectoryID = "0"
	}
	if !pan115.ValidDirectory(r.SourceDirectoryID) {
		return "", fmt.Errorf("分享来源目录 ID 无效")
	}
	if r.WholeShare && len(r.FileIDs) > 0 {
		return "", fmt.Errorf("整份分享转存不能同时指定文件选择")
	}
	if !r.WholeShare && len(r.FileIDs) == 0 || len(r.FileIDs) > 100 {
		return "", fmt.Errorf("请选择 1–100 个分享文件或目录")
	}
	seen := map[string]bool{}
	for _, id := range r.FileIDs {
		if !pan115.ValidDirectory(id) || id == "0" || seen[id] {
			return "", fmt.Errorf("分享文件 ID 无效或重复")
		}
		seen[id] = true
	}
	sort.Strings(r.FileIDs)
	selection := strings.Join(r.FileIDs, ",")
	if r.WholeShare {
		selection = "all"
	}
	hash := sha256.Sum256([]byte(code + ":" + r.SourceDirectoryID + ":" + selection))
	return "share:" + hex.EncodeToString(hash[:]), nil
}

type shareSecretStore interface{ DownloadReceiveCode(string) (string, error) }

func (s *Service) processShare(g pan115.Gateway, t Task) error {
	share, ok := g.(pan115.ShareGateway)
	if !ok {
		return s.saveError(t, &pan115.Error{Code: "unsupported", Message: "分享转存尚不可用", Certain: true})
	}
	secrets, ok := s.Store.(shareSecretStore)
	if !ok {
		return fmt.Errorf("分享凭证存储不可用")
	}
	password, err := secrets.DownloadReceiveCode(t.ID)
	if err != nil {
		return err
	}
	_, code, _, err := ParseShare(t.URL, password)
	if err != nil {
		return err
	}
	if t.State == "queued" || t.State == "preparing" {
		folder, e := g.GetFile(t.DirectoryID)
		if e != nil {
			return s.saveError(t, e)
		}
		if !folder.Directory {
			t.State = "failed"
			t.ErrorCode = "invalid_directory"
			t.Error = "115 转存目标不是目录"
			return s.Store.SaveDownload(t)
		}
		if t.WholeShare && len(t.FileIDs) == 0 {
			files, e := share.ListShare(code, password, t.SourceDirectoryID)
			if e != nil {
				safe := pan115.SafeError(e)
				if safe.Certain {
					t.State = "failed"
					t.ErrorCode = safe.Code
					t.Error = safe.Message
					return s.Store.SaveDownload(t)
				}
				return s.saveError(t, e)
			}
			if len(files) == 0 || len(files) > 100 {
				t.State = "failed"
				t.ErrorCode = "share_selection_limit"
				t.Error = "分享目录为空或超过 100 个顶层项目，无法整份转存"
				return s.Store.SaveDownload(t)
			}
			for _, f := range files {
				t.FileIDs = append(t.FileIDs, f.ID)
			}
			sort.Strings(t.FileIDs)
			t.State = "preparing"
			if e = s.Store.SaveDownload(t); e != nil {
				return e
			}
			t, e = s.Store.GetDownload(t.ID)
			if e != nil {
				return e
			}
			if t.State != "preparing" {
				return nil
			}
		}
		manifest, e := shareManifest(share, code, password, t.SourceDirectoryID, t.FileIDs)
		if e != nil {
			safe := pan115.SafeError(e)
			if safe.Certain {
				t.State = "failed"
				t.ErrorCode = safe.Code
				t.Error = safe.Message
				return s.Store.SaveDownload(t)
			}
			return s.saveError(t, e)
		}
		t.Manifest = manifest
		t.State = "preparing"
		if e = s.Store.SaveDownload(t); e != nil {
			return e
		}
		t, e = s.Store.GetDownload(t.ID)
		if e != nil {
			return e
		}
		if t.State != "preparing" {
			return nil
		}
		// Deterministic isolated folder permits recovery if mkdir succeeded but its reply was lost.
		name := "media-center-" + t.ID
		if t.RootFileID == "" {
			children, e := g.ListFiles(t.DirectoryID)
			if e != nil {
				return s.saveError(t, e)
			}
			for _, f := range children {
				if f.Name == name && f.Directory {
					if t.RootFileID != "" {
						return s.saveError(t, &pan115.Error{Code: "directory_conflict", Message: "转存隔离目录重名，需人工核对", Certain: true})
					}
					t.RootFileID = f.ID
				}
			}
			if t.RootFileID == "" {
				created, e := share.CreateDirectory(t.DirectoryID, name)
				if e != nil {
					return s.saveError(t, e)
				}
				t.RootFileID = created.ID
			}
		}
		t.State = "submitting"
		t.SubmissionStartedAt = s.Now().UTC().Format(time.RFC3339Nano)
		t.Error = ""
		t.ErrorCode = ""
		if e = s.Store.SaveDownload(t); e != nil {
			return e
		}
		t, e = s.Store.GetDownload(t.ID)
		if e != nil {
			return e
		}
		if t.State != "submitting" {
			return nil
		}
		e = share.ReceiveShare(code, password, t.FileIDs, t.RootFileID)
		t.State = "awaiting_files"
		if e != nil {
			safe := pan115.SafeError(e)
			t.State = "unknown"
			t.ErrorCode = safe.Code
			t.Error = safe.Message
		}
	} else if t.State == "submitting" {
		t.State = "unknown"
		t.ErrorCode = "uncertain"
		t.Error = "转存提交结果不确定，等待文件核对"
	}
	if t.RootFileID != "" && (t.State == "awaiting_files" || t.State == "unknown") {
		if e := s.confirmFiles(g, &t); e != nil {
			safe := pan115.SafeError(e)
			t.ErrorCode = safe.Code
			t.Error = safe.Message
		}
	}
	return s.Store.SaveDownload(t)
}
func shareManifest(g pan115.ShareGateway, code, password, directory string, ids []string) ([]ManifestFile, error) {
	files, err := g.ListShare(code, password, directory)
	if err != nil {
		return nil, err
	}
	index := map[string]pan115.File{}
	for _, f := range files {
		index[f.ID] = f
	}
	out := []ManifestFile{}
	paths := map[string]bool{}
	directories := 0
	var walk func(pan115.File, string, int) error
	walk = func(f pan115.File, prefix string, depth int) error {
		if depth > 8 || len(out) >= 2000 || directories > 32 || !safeTorrentSegment(f.Name) {
			return &pan115.Error{Code: "scan_limit", Message: "分享文件清单超出限制，请选择更小的目录", Certain: true}
		}
		p := path.Join(prefix, f.Name)
		if f.Directory {
			directories++
			children, e := g.ListShare(code, password, f.ID)
			if e != nil {
				return e
			}
			for _, child := range children {
				if e = walk(child, p, depth+1); e != nil {
					return e
				}
			}
			return nil
		}
		if paths[p] {
			return &pan115.Error{Code: "selection_changed", Message: "分享包含重名路径，请缩小选择范围", Certain: true}
		}
		paths[p] = true
		out = append(out, ManifestFile{p, f.Size, f.SHA1})
		return nil
	}
	for _, id := range ids {
		f, ok := index[id]
		if !ok {
			return nil, &pan115.Error{Code: "selection_changed", Message: "所选分享文件已变化，请重新浏览", Certain: true}
		}
		if err = walk(f, "", 0); err != nil {
			return nil, err
		}
	}
	if len(out) == 0 {
		return nil, &pan115.Error{Code: "empty_share", Message: "所选目录没有可确认的文件", Certain: true}
	}
	return out, nil
}
