package httpapi

import (
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/store"
	"net/http/httptest"
	"strings"
	"testing"
)

type contractProvider struct {
	source string
	fail   bool
}

func (p contractProvider) Capabilities() discovery.Capabilities {
	return discovery.NewCapabilities(p.source, p.source, []string{"anime"}, []string{"rank"}, 20, 100)
}
func (p contractProvider) Validate(q discovery.Query) error {
	return discovery.Validate(p.Capabilities(), q)
}
func (p contractProvider) Discover(context.Context, discovery.Query) (discovery.Page, error) {
	n := 100
	return discovery.Page{Items: []media.Summary{{Identity: discovery.Identity(p.source, "anime", "1"), Title: "测试", Genres: []string{}, Ratings: []media.Rating{}}}, Total: &n}, nil
}
func (p contractProvider) Detail(context.Context, string, string, string) (media.Detail, error) {
	return media.Detail{Summary: media.Summary{Identity: discovery.Identity(p.source, "anime", "1"), Title: "测试"}}, nil
}
func (p contractProvider) Ranking(context.Context, string) (discovery.Page, error) {
	if p.fail {
		return discovery.Page{}, discovery.Problem(503, "来源暂不可用")
	}
	return p.Discover(context.Background(), discovery.Query{})
}
func TestDiscoveryDTOAndParameterValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a := &API{discovery: discovery.NewService(discovery.NewRegistry(contractProvider{source: "bangumi"}))}
	invoke := func(path string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", path, nil)
		handler(c)
		return w
	}
	for _, path := range []string{"/api/media/discover?source=bangumi&mediaType=anime&page=abc", "/api/media/discover?source=bangumi&mediaType=anime&pageSize=21", "/api/media/discover?source=bangumi&mediaType=anime&bad=1", "/api/media/discover?source=bangumi&mediaType=anime&sort=rank&sort=date", "/api/media/discover?source=unknown&mediaType=anime"} {
		w := invoke(path, a.discoverMedia)
		if w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	w := invoke("/api/media/discover?source=bangumi&mediaType=anime", a.discoverMedia)
	var page map[string]any
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || w.Code != 200 || page["totalCapped"] != true || len(page["people"].([]any)) != 0 {
		t.Fatal(w.Body.String())
	}
	w = invoke("/api/media/providers", a.mediaProviders)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	w = invoke("/api/media/rankings", a.mediaRankings)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	a.discovery = discovery.NewService(discovery.NewRegistry(contractProvider{source: "bangumi", fail: true}))
	w = invoke("/api/media/rankings", a.mediaRankings)
	if w.Code != 503 || w.Header().Get("Retry-After") == "" {
		t.Fatal(w.Code)
	}
	w = invoke("/api/media/image?source=bangumi&url=https://evil.test", a.mediaImage)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
func TestNewMediaRoutesRequireUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, e := store.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	r := NewRouter(db, func(c *gin.Context) { c.Status(204) })
	wSearch := httptest.NewRecorder()
	r.ServeHTTP(wSearch, httptest.NewRequest("POST", "/api/v1/resources/search", strings.NewReader(`{"query":"test"}`)))
	if wSearch.Code != 401 {
		t.Fatal(wSearch.Code)
	}
	for _, path := range []string{"/api/media/providers", "/api/media/rankings", "/api/media/image?source=douban&url=https://img1.doubanio.com/a.jpg", "/api/media/discover?source=bangumi&mediaType=anime", "/api/media/anilist/9253?mediaType=anime"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 401 {
			t.Fatal(path, w.Code)
		}
	}
}

func TestBangumiUnsupportedFiltersHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a := &API{}
	for _, field := range []string{"genre", "region", "season", "status", "platform", "cat"} {
		for _, value := range []string{"TV", ""} {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/api/media/discover?source=bangumi&mediaType=anime&"+field+"="+value, nil)
			a.discoverMedia(c)
			if w.Code != 400 || !strings.Contains(w.Body.String(), "Bangumi 官方接口不支持该筛选") {
				t.Fatal(field, w.Code, w.Body.String())
			}
		}
	}
}
