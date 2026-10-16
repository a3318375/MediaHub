package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"mediahub/internal/discovery"
)

func TestSelectedRankingsValidationAndErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a := &API{discovery: discovery.NewService(discovery.NewRegistry(contractProvider{source: "bangumi"}))}
	invoke := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", path, nil)
		a.mediaRankings(c)
		return w
	}
	for _, path := range []string{"?source=bangumi", "?name=rank", "?source=&name=", "?source=bangumi&name=rank&name=airing", "?source=bogus&name=rank", "?source=bangumi&name=rank&extra=1"} {
		w := invoke("/api/media/rankings" + path)
		if w.Code != 400 {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	w := invoke("/api/media/rankings?source=bangumi&name=rank")
	var out struct {
		Rankings []rankingDTO `json:"rankings"`
	}
	if json.Unmarshal(w.Body.Bytes(), &out) != nil || w.Code != 200 || len(out.Rankings) != 1 || out.Rankings[0].Source != "bangumi" || out.Rankings[0].Name != "rank" {
		t.Fatal(w.Code, w.Body.String())
	}
	a.discovery = discovery.NewService(discovery.NewRegistry(contractProvider{source: "bangumi", fail: true}))
	w = invoke("/api/media/rankings?source=bangumi&name=rank")
	if w.Code != 503 || !json.Valid(w.Body.Bytes()) {
		t.Fatal(w.Code, w.Body.String())
	}
	var problem struct{ Message string }
	_ = json.Unmarshal(w.Body.Bytes(), &problem)
	if problem.Message != "来源暂不可用" {
		t.Fatal("lost selected-source error", problem.Message)
	}
	for _, path := range []string{"?mediaType=person&region=US", "?mediaType=tv&region=global", "?mediaType=tv&region=US&region=JP", "?mediaType=tv&region=US&bad=1"} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/api/media/rankings/platforms"+path, nil)
		a.rankingPlatforms(c)
		if w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
}
