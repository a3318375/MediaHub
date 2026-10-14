package pan115

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(body string) *http.Response {
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}
}
func TestOfflinePaginationUsesCookieAndCancelsRequests(t *testing.T) {
	type contextKey struct{}
	ctx, cancel := context.WithCancel(context.WithValue(context.Background(), contextKey{}, "download"))
	defer cancel()
	calls := 0
	c, err := New(ctx, "UID=123_A1; CID=fixture; SEID=fixture", nil, transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if !strings.Contains(r.Header.Get("Cookie"), "UID=123_A1") {
			t.Fatal("Cookie missing")
		}
		if r.Context().Value(contextKey{}) != "download" {
			t.Fatal("SDK lost cancellation context")
		}
		if r.URL.Query().Get("page") == "1" {
			return response(`{"state":true,"page_count":2,"tasks":[{"info_hash":"a","status":1,"percentDone":4}]}`), nil
		}
		return response(`{"state":true,"page_count":2,"tasks":[{"info_hash":"b","status":2,"file_id":"77"}]}`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	tasks, err := c.OfflineTasks()
	if err != nil || len(tasks) != 2 || calls != 2 {
		t.Fatal(tasks, calls, err)
	}
	cancel()
	if _, err = c.OfflineTasks(); err == nil || calls != 2 {
		t.Fatal("cancellation did not prevent requests", err, calls)
	}
}
func TestErrorDoesNotExposeUpstreamBodyAndResponseBound(t *testing.T) {
	c, err := New(context.Background(), "UID=123_A1; CID=fixture; SEID=fixture", nil, transportFunc(func(*http.Request) (*http.Response, error) {
		return response(`{"state":false,"errno":99,"message":"secret-cookie-and-url"}`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.OfflineTasks()
	if err == nil || strings.Contains(err.Error(), "secret-cookie") {
		t.Fatal(err)
	}
	b := boundedBody{ReadCloser: io.NopCloser(strings.NewReader("12345")), remaining: 4}
	if _, err = io.ReadAll(&b); err == nil {
		t.Fatal("body bound missing")
	}
}

func TestDecryptedSubmissionChecksEachResult(t *testing.T) {
	hash := "0123456789abcdef0123456789abcdef01234567"
	got, err := parseSubmission([]byte(`{"state":true,"result":[{"info_hash":"` + hash + `","state":true}]}`))
	if err != nil || got != hash {
		t.Fatal(got, err)
	}
	for _, body := range []string{
		`{"state":true,"result":[]}`,
		`{"state":true,"result":[{"info_hash":"` + hash + `"},{"info_hash":"` + hash + `"}]}`,
		`{"state":false,"errno":10010,"message":"secret"}`,
		`{"state":true,"result":[{"info_hash":"` + hash + `","state":false,"errno":10004}]}`,
		`{"state":true,"result":[{"info_hash":"invalid"}]}`,
	} {
		if _, err = parseSubmission([]byte(body)); err == nil || strings.Contains(err.Error(), "secret") {
			t.Fatal(body, err)
		}
	}
}

func TestNativeShareSnapshotAndReceiveCookieRoute(t *testing.T) {
	c, err := New(context.Background(), "UID=123_A1; CID=fixture; SEID=fixture", nil, transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "webapi.115.com" || r.Header.Get("User-Agent") != shareUA || r.Header.Get("Referer") != shareReferer {
			t.Fatal("share endpoint/profile mismatch")
		}
		if r.URL.Path == "/share/receive" {
			body, _ := io.ReadAll(r.Body)
			form, e := url.ParseQuery(string(body))
			if e != nil || form.Get("file_id") != "7" || form.Get("cid") != "100" || form.Get("user_id") != "123" {
				t.Fatal(form, e)
			}
			return response(`{"state":true}`), nil
		}
		return response(`{"state":true,"data":{"count":1,"list":[{"fid":"7","cid":"0","n":"movie.mkv","s":"4","sha":"abc"}]}}`), nil
	}))
	if err != nil {
		t.Fatal(err)
	}
	c.sdk.UserID = 123
	files, err := c.ListShare("fixture123", "fixture", "0")
	if err != nil || len(files) != 1 || files[0].Directory || files[0].ID != "7" {
		t.Fatal(files, err)
	}
	if err = c.ReceiveShare("fixture123", "fixture", []string{"7"}, "100"); err != nil {
		t.Fatal(err)
	}
}
