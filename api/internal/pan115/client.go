// Package pan115 adapts the Cookie API; it never uses the 115 Open platform.
package pan115

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	crypto "github.com/SheltonZhu/115driver/pkg/crypto/m115"
	sdk "github.com/SheltonZhu/115driver/pkg/driver"
	"github.com/go-resty/resty/v2"
	"golang.org/x/time/rate"
)

type Error struct {
	Code, Message string
	Certain       bool
}

func (e *Error) Error() string { return e.Message }
func SafeError(err error) *Error {
	var safe *Error
	if errors.As(err, &safe) {
		return safe
	}
	switch {
	case errors.Is(err, sdk.ErrBadCookie), errors.Is(err, sdk.ErrNotLogin), errors.Is(err, sdk.ErrCredentialInvalid), errors.Is(err, sdk.ErrSessionExited), errors.Is(err, sdk.ErrDoesLoggedOut):
		return &Error{"credential", "115 登录失效，请更新 Cookie", true}
	case errors.Is(err, sdk.ErrOfflineNoTimes):
		return &Error{"quota", "115 离线配额不足", true}
	case errors.Is(err, sdk.ErrOfflineInvalidLink):
		return &Error{"invalid_resource", "115 不接受此资源", true}
	case errors.Is(err, sdk.ErrOfflineTaskExisted):
		return &Error{"duplicate", "115 已存在此任务，等待核对", false}
	case errors.Is(err, sdk.ErrSharedInvalid), errors.Is(err, sdk.ErrSharedNotFound):
		return &Error{"share_unavailable", "115 分享已失效或不可访问", true}
	case errors.Is(err, sdk.ErrPasswordIncorrect):
		return &Error{"share_password", "115 提取码不正确", true}
	case errors.Is(err, sdk.ErrNotExist):
		return &Error{"not_found", "115 文件或目录尚不可见", true}
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return &Error{"timeout", "115 请求取消或超时", false}
	default:
		return &Error{"upstream", "115 请求失败，等待核对或重试", false}
	}
}

var directoryID = regexp.MustCompile(`^[0-9]{1,30}$`)

func ValidDirectory(id string) bool { return directoryID.MatchString(id) }
func AccountID(cookie string) (string, error) {
	var c sdk.Credential
	if err := c.FromCookie(cookie); err != nil {
		return "", SafeError(err)
	}
	id := strings.Split(c.UID, "_")[0]
	if !directoryID.MatchString(id) || id == "0" {
		return "", &Error{"credential", "115 Cookie 的账号标识无效", true}
	}
	return id, nil
}

type File struct {
	ID        string `json:"id"`
	ParentID  string `json:"parentId"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	SHA1      string `json:"sha1,omitempty"`
	Directory bool   `json:"directory"`
}
type RemoteTask struct {
	Hash                string
	Status              int
	Percent, Speed      float64
	Size                int64
	FileID, DirectoryID string
}
type Gateway interface {
	CheckAccount() error
	OfflineTasks() ([]RemoteTask, error)
	Submit(magnet, directory string) (string, error)
	GetFile(id string) (File, error)
	ListFiles(directory string) ([]File, error)
}
type Client struct {
	sdk     *sdk.Pan115Client
	account string
}

func New(ctx context.Context, cookie string, limiter *rate.Limiter, transport http.RoundTripper) (*Client, error) {
	account, err := AccountID(cookie)
	if err != nil {
		return nil, err
	}
	if transport == nil {
		transport = http.DefaultTransport
	}
	hc := &http.Client{Timeout: 15 * time.Second, Transport: boundedTransport{transport}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	c := sdk.New(sdk.WithClient(hc), sdk.UA(sdk.UA115Browser))
	c.Client.SetRetryCount(0)
	c.Client.OnBeforeRequest(func(_ *resty.Client, r *resty.Request) error {
		r.SetContext(ctx)
		if limiter != nil {
			return limiter.Wait(ctx)
		}
		return ctx.Err()
	})
	var credential sdk.Credential
	if err := credential.FromCookie(cookie); err != nil {
		return nil, SafeError(err)
	}
	c.ImportCredential(&credential)
	return &Client{c, account}, nil
}

// Bound bodies before Resty buffers them. Never return raw upstream bodies or URLs.
type boundedTransport struct{ base http.RoundTripper }

func (t boundedTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(r)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		code := "upstream"
		if resp.StatusCode == 429 {
			code = "rate_limit"
		}
		if resp.StatusCode == 401 || resp.StatusCode == 403 {
			code = "credential"
		}
		return nil, &Error{code, fmt.Sprintf("115 请求被拒绝（HTTP %d），请稍后核对", resp.StatusCode), false}
	}
	resp.Body = &boundedBody{ReadCloser: resp.Body, remaining: 4 << 20}
	return resp, nil
}

type boundedBody struct {
	io.ReadCloser
	remaining int64
}

func (b *boundedBody) Read(p []byte) (int, error) {
	if b.remaining < 0 {
		return 0, &Error{"response_limit", "115 响应超过限制", false}
	}
	if int64(len(p)) > b.remaining+1 {
		p = p[:b.remaining+1]
	}
	n, err := b.ReadCloser.Read(p)
	b.remaining -= int64(n)
	if b.remaining < 0 {
		return 0, &Error{"response_limit", "115 响应超过限制", false}
	}
	return n, err
}
func (c *Client) CheckAccount() error {
	u, err := c.sdk.GetUser()
	if err != nil {
		return SafeError(err)
	}
	if strconv.FormatInt(u.UserID, 10) != c.account {
		return &Error{"credential", "115 账号校验失败", true}
	}
	c.sdk.UserID = u.UserID
	return nil
}
func (c *Client) OfflineTasks() ([]RemoteTask, error) {
	out := []RemoteTask{}
	for page := int64(1); page <= 100; page++ {
		result, err := c.sdk.ListOfflineTask(page)
		if err != nil {
			return nil, SafeError(err)
		}
		if result.PageCount > 100 {
			return nil, &Error{"scan_limit", "115 离线列表超过查询限制", false}
		}
		for _, t := range result.Tasks {
			if t == nil {
				continue
			}
			out = append(out, RemoteTask{strings.ToLower(t.InfoHash), t.Status, t.Percent, t.RateDownload, t.Size, t.FileId, t.DirId})
		}
		if page >= result.PageCount {
			return out, nil
		}
	}
	return nil, &Error{"scan_limit", "115 离线列表超过查询限制", false}
}
func (c *Client) Submit(magnet, directory string) (string, error) {
	if c.sdk.UserID <= 0 {
		if err := c.CheckAccount(); err != nil {
			return "", err
		}
	}
	key := crypto.GenerateKey()
	// Match the browser version pinned by SDK v1.3.5 (pkg/driver/upload.go).
	params, err := json.Marshal(map[string]string{"ac": "add_task_urls", "wp_path_id": directory, "app_ver": "27.0.5.7", "uid": strconv.FormatInt(c.sdk.UserID, 10), "url[0]": magnet})
	if err != nil {
		return "", SafeError(err)
	}
	result := sdk.DownloadResp{}
	resp, err := c.sdk.NewRequest().SetQueryParam("t", sdk.Now().String()).SetFormData(map[string]string{"data": crypto.Encode(params, key)}).ForceContentType("application/json").SetResult(&result).Post(sdk.ApiAddOfflineUrl)
	if err = sdk.CheckErr(err, &result, resp); err != nil {
		return "", SafeError(err)
	}
	decoded, err := crypto.Decode(string(result.EncodedData), key)
	if err != nil {
		return "", SafeError(err)
	}
	return parseSubmission(decoded)
}

// SDK v1.3.5 does not check the decrypted result state or cardinality.
// Check both without exposing upstream messages (which can contain credentials/URLs).
func parseSubmission(data []byte) (string, error) {
	var result struct {
		sdk.BasicResp
		Result []struct {
			InfoHash string        `json:"info_hash"`
			State    *bool         `json:"state"`
			Errno    sdk.StringInt `json:"errno"`
			ErrNo    int           `json:"errNo"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", SafeError(err)
	}
	if err := result.BasicResp.Err(); err != nil {
		return "", SafeError(err)
	}
	if len(result.Result) != 1 {
		return "", &Error{"uncertain", "115 未返回单个有效任务，等待核对", false}
	}
	r := result.Result[0]
	if r.State != nil && !*r.State {
		code := int(r.Errno)
		if code == 0 {
			code = r.ErrNo
		}
		return "", SafeError(sdk.GetErr(code))
	}
	if matched, _ := regexp.MatchString(`(?i)^[0-9a-f]{40}$`, r.InfoHash); !matched {
		return "", &Error{"uncertain", "115 未返回有效任务标识，等待核对", false}
	}
	return strings.ToLower(r.InfoHash), nil
}
func fromFile(f *sdk.File) File {
	return File{f.FileID, f.ParentID, f.Name, f.Size, f.Sha1, f.IsDirectory}
}
func (c *Client) GetFile(id string) (File, error) {
	f, err := c.sdk.GetFile(id)
	if err != nil {
		return File{}, SafeError(err)
	}
	if f == nil || f.FileID != id {
		return File{}, &Error{"not_found", "115 文件尚不可见", true}
	}
	return fromFile(f), nil
}
func (c *Client) ListFiles(directory string) ([]File, error) {
	if !ValidDirectory(directory) {
		return nil, fmt.Errorf("目录 ID 无效")
	}
	out := []File{}
	for offset := int64(0); offset < 10000; offset += 100 {
		r, err := sdk.GetFiles(c.sdk.NewRequest().ForceContentType("application/json"), directory, sdk.WithLimit(100), sdk.WithOffset(offset))
		if err != nil {
			return nil, SafeError(err)
		}
		if int64(r.Count) > 10000 {
			return nil, &Error{"scan_limit", "115 目录超过查询限制", true}
		}
		for _, f := range r.Files {
			out = append(out, fromFile((&sdk.File{}).From(&f)))
		}
		if offset+100 >= int64(r.Count) {
			return out, nil
		}
	}
	return nil, &Error{"scan_limit", "115 目录超过查询限制", true}
}
