package providers_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"media-center/internal/discovery"
	"media-center/internal/media"
	"media-center/internal/providers/anilist"
	"media-center/internal/providers/bangumi"
	"media-center/internal/providers/douban"
	tmdbprovider "media-center/internal/providers/tmdb"
	"media-center/internal/providers/transport"
	legacy "media-center/internal/tmdb"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const bgmItem = `{"id":253,"name":"Cowboy Bebop","name_cn":"","date":"1998-04-03","type":2,"rating":{"score":9,"total":123},"images":{"large":"https://lain.bgm.tv/a.jpg"}}`
const aniItem = `{"id":9253,"title":{"native":"STEINS;GATE","romaji":"Steins;Gate","english":"Steins Gate"},"synonyms":["命运石之门"],"averageScore":92,"startDate":{"year":2011,"month":4,"day":6},"genres":["Sci-Fi"],"coverImage":{"large":"https://s4.anilist.co/a.jpg"}}`
const dbItem = `{"id":"1292052","title":"作品","year":"2024","uri":"douban://douban.com/movie/1292052","rating":{"value":4.5,"max":5,"count":10},"pic":{"large":"https://img1.doubanio.com/a.jpg"},"pubdate":["2024-01-02(中国大陆)"],"genres":["剧情"],"countries":["中国"],"directors":[{"name":"导演"}],"actors":[{"name":"演员"}],"durations":["120 分钟"]}`

func response(w http.ResponseWriter, s string) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, s)
}
func newProvider(source, base string) discovery.Provider {
	switch source {
	case "bangumi":
		p := bangumi.New()
		p.BaseURL = base
		p.Transport.Interval = 0
		return p
	case "anilist":
		p := anilist.New()
		p.BaseURL = base
		p.ProxyURL = ""
		p.Transport.Interval = 0
		p.DatasetURL = base + "/dataset"
		p.DatasetTransport.Interval = 0
		return p
	case "douban":
		p := douban.New()
		p.BaseURL = base
		p.Transport.Interval = 0
		return p
	default:
		c := legacy.NewClient()
		c.BaseURL = base
		return &tmdbprovider.Provider{Client: c, Key: func(context.Context) (string, error) { return "", nil }}
	}
}
func TestBangumiNativeRequests(t *testing.T) {
	var requests atomic.Int32
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("User-Agent") != bangumi.UserAgent {
			t.Error("UA")
		}
		switch r.URL.Path {
		case "/v0/subjects":
			if r.URL.Query().Get("type") != "2" || r.URL.Query().Get("sort") != "date" || r.URL.Query().Get("year") != "2024" || r.URL.Query().Get("month") != "1" {
				t.Error(r.URL)
			}
			response(w, `{"data":[`+bgmItem+`],"total":125,"limit":2,"offset":2}`)
		case "/v0/search/subjects":
			var body struct {
				Keyword string
				Filter  struct{ Type []int }
			}
			json.NewDecoder(r.Body).Decode(&body)
			if r.Method != "POST" || body.Keyword != "星际牛仔" || len(body.Filter.Type) != 1 || body.Filter.Type[0] != 2 || r.URL.Query().Get("offset") != "2" {
				t.Error("search request")
			}
			response(w, `{"data":[`+bgmItem+`],"limit":2,"offset":2}`)
		case "/v0/subjects/253":
			response(w, bgmItem)
		case "/v0/subjects/253/persons":
			response(w, `[{"id":1,"name":"导演","relation":"导演"}]`)
		default:
			t.Error(r.URL.Path)
		}
	}))
	defer srv.Close()
	p := newProvider("bangumi", srv.URL)
	s := discovery.NewService(discovery.NewRegistry(p))
	q := discovery.Query{MediaType: "anime", Page: 2, PageSize: 2, Sort: "date", Year: "2024", Month: "1"}
	page, e := s.Discover(context.Background(), "bangumi", q)
	if e != nil || len(page.Items) != 1 || page.Items[0].Title != "Cowboy Bebop" || page.Items[0].MediaID != "bangumi:anime:253" || !page.HasMore || page.TotalCapped {
		t.Fatal(page, e)
	}
	q = discovery.Query{MediaType: "anime", Page: 2, PageSize: 2, Search: "星际牛仔"}
	page, e = s.Discover(context.Background(), "bangumi", q)
	if e != nil || page.Total != nil || page.People == nil {
		t.Fatal(page, e)
	}
	d, e := s.Detail(context.Background(), "bangumi", "anime", "253", "")
	if e != nil || d.ReleaseDate != "1998-04-03" || len(d.Credits) != 1 || d.Ratings[0].Value != 9 {
		t.Fatal(d, e)
	}
	n := requests.Load()
	for _, q := range []discovery.Query{{MediaType: "anime", Page: 1, PageSize: 20, Sort: "popularity"}, {MediaType: "anime", Page: 1, PageSize: 20, Month: "13", Year: "2024"}, {MediaType: "anime", Page: 1, PageSize: 20, Year: "2024", Search: "x"}, {MediaType: "movie", Page: 1, PageSize: 20}} {
		if _, e = s.Discover(context.Background(), "bangumi", q); e == nil {
			t.Fatal("invalid accepted", q)
		}
	}
	if requests.Load() != n {
		t.Fatal("invalid reached upstream")
	}
}
func TestAniListProxyFallbackAndMapping(t *testing.T) {
	var proxyCalls, officialCalls atomic.Int32
	proxy := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyCalls.Add(1)
		w.WriteHeader(403)
		response(w, `{"errors":[{"message":"blocked","status":403}]}`)
	}))
	defer proxy.Close()
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		officialCalls.Add(1)
		var req struct {
			Query     string
			Variables map[string]any
		}
		json.NewDecoder(r.Body).Decode(&req)
		if _, ok := req.Variables["id"]; ok {
			response(w, `{"data":{"Media":`+aniItem+`}}`)
		} else {
			if req.Variables["page"] != float64(2) {
				t.Error("page")
			}
			response(w, `{"data":{"Page":{"pageInfo":{"total":5000,"hasNextPage":true},"media":[`+aniItem+`]}}}`)
		}
	}))
	defer srv.Close()
	p := anilist.New()
	p.BaseURL = srv.URL
	p.ProxyURL = proxy.URL
	p.Transport.Interval = 0
	p.ProxyTransport.Interval = 0
	s := discovery.NewService(discovery.NewRegistry(p))
	q := discovery.Query{MediaType: "anime", Page: 2, PageSize: 2}
	page, e := s.Discover(context.Background(), "anilist", q)
	if e != nil || !page.TotalCapped || page.Items[0].Title != "命运石之门" || page.Items[0].Titles.English != "Steins Gate" || page.Items[0].Ratings[0].Value != 9.2 || page.Items[0].ReleaseDate != "2011-04-06" {
		t.Fatal(page, e)
	}
	d, e := s.Detail(context.Background(), "anilist", "anime", "9253", "")
	if e != nil || d.MediaID != "anilist:anime:9253" || d.ExternalIDs != nil {
		t.Fatal(d, e)
	}
	if proxyCalls.Load() != 1 || officialCalls.Load() != 2 {
		t.Fatal(proxyCalls.Load(), officialCalls.Load())
	}
	if !p.Capabilities().SupportsRanking || !discovery.Contains(p.Capabilities().Filters.Sort, "POPULARITY_DESC") {
		t.Fatal("not verified")
	}
	if available, _ := p.Transport.Availability(); !available {
		t.Fatal("proxy403 affected official quota")
	}
}
func TestAniListChineseIndexFallback(t *testing.T) {
	var datasetCalls, idCalls atomic.Int32
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			datasetCalls.Add(1)
			response(w, `{"9253":{"id":9253,"title":"命运石之门","synonyms":["命运"]}}`)
			return
		}
		var req struct {
			Query     string
			Variables map[string]any
		}
		json.NewDecoder(r.Body).Decode(&req)
		if ids, ok := req.Variables["ids"]; ok {
			if !strings.Contains(req.Query, "id_in:$ids") || !strings.Contains(req.Query, "genre:$genre") || !strings.Contains(req.Query, "$genre:String") || req.Variables["genre"] != "Sci-Fi" || len(ids.([]any)) != 1 {
				t.Error(req)
			}
			idCalls.Add(1)
			response(w, `{"data":{"Page":{"pageInfo":{"total":1,"hasNextPage":false},"media":[`+strings.Replace(aniItem, `["命运石之门"]`, `[]`, 1)+`]}}}`)
		} else {
			if req.Variables["search"] != "命运" {
				t.Error(req)
			}
			response(w, `{"data":{"Page":{"pageInfo":{"total":0,"hasNextPage":false},"media":[]}}}`)
		}
	}))
	defer srv.Close()
	p := newProvider("anilist", srv.URL)
	q := discovery.Query{MediaType: "anime", Page: 1, PageSize: 20, Search: "命运", Genre: "Sci-Fi"}
	for i := 0; i < 2; i++ {
		page, e := p.Discover(context.Background(), q)
		if e != nil || len(page.Items) != 1 || page.Items[0].Title != "命运石之门" {
			t.Fatal(page, e)
		}
	}
	if datasetCalls.Load() != 1 || idCalls.Load() != 2 {
		t.Fatal(datasetCalls.Load(), idCalls.Load())
	}
}
func TestDoubanNativeFilteringAndDetail(t *testing.T) {
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v := r.URL.Query()
		if v.Get("_sig") != douban.Signature(r.URL.Path, v.Get("_ts")) || !strings.HasPrefix(r.Header.Get("User-Agent"), "api-client/") {
			t.Error("signature or UA")
		}
		switch r.URL.Path {
		case "/api/v2/movie/recommend":
			if v.Get("tags") != "科幻" || v.Get("start") != "2" {
				t.Error(v)
			}
			response(w, `{"items":[{"id":"movie_scifi","title":"高分科幻榜","uri":"douban://douban.com/subject_collection/movie_scifi"},`+dbItem+`],"total":500,"start":2,"count":2}`)
		case "/api/v2/search/weixin":
			if v.Get("q") != "作品" || v.Get("start") != "2" {
				t.Error(v)
			}
			response(w, `{"items":[{},{"target_type":"movie","target":`+dbItem+`},{"target_type":"book","target":`+dbItem+`}],"total":959,"start":2,"count":2}`)
		case "/api/v2/movie/1292052":
			response(w, dbItem)
		case "/api/v2/tv/1292052":
			response(w, strings.Replace(dbItem, "/movie/", "/tv/", 1))
		case "/api/v2/subject_collection/movie_top250/items":
			response(w, `{"total":250,"subject_collection_items":[`+dbItem+`]}`)
		default:
			t.Error(r.URL.Path)
		}
	}))
	defer srv.Close()
	p := newProvider("douban", srv.URL)
	s := discovery.NewService(discovery.NewRegistry(p))
	q := discovery.Query{MediaType: "movie", Page: 2, PageSize: 2, Genre: "科幻"}
	page, e := s.Discover(context.Background(), "douban", q)
	if e != nil || len(page.Items) != 1 || !page.TotalCapped || !strings.HasPrefix(*page.Items[0].PosterPath, "/api/media/image?source=douban") {
		t.Fatal(page, e)
	}
	q.Genre = ""
	q.Search = "作品"
	page, e = s.Discover(context.Background(), "douban", q)
	if e != nil || len(page.Items) != 1 || page.Total != nil || page.TotalCapped {
		t.Fatal(page, e)
	}
	for _, kind := range []string{"movie", "tv"} {
		d, e := s.Detail(context.Background(), "douban", kind, "1292052", "")
		if e != nil || d.MediaID != "douban:"+kind+":1292052" || d.Ratings[0].Value != 9 || d.ReleaseDate != "2024-01-02" || d.RuntimeMinutes == nil || *d.RuntimeMinutes != 120 || len(d.Credits) != 2 {
			t.Fatal(d, e)
		}
	}
	rank, e := s.Ranking(context.Background(), "douban", "movie_top250")
	if e != nil || *rank.Total != 250 {
		t.Fatal(rank, e)
	}
	for _, q := range []discovery.Query{{MediaType: "movie", Page: 1, PageSize: 20, Genre: "爱情"}, {MediaType: "movie", Page: 1, PageSize: 20, Region: "美剧"}, {MediaType: "tv", Page: 1, PageSize: 20, Genre: "科幻"}, {MediaType: "movie", Page: 1, PageSize: 20, Year: "2024"}} {
		if p.Validate(q) == nil {
			t.Fatal(q)
		}
	}
}
func TestProviderErrorResponsesNeverCached(t *testing.T) {
	for _, source := range []string{"bangumi", "anilist", "douban", "tmdb"} {
		for _, tt := range []struct {
			name   string
			status int
			body   string
			want   int
			retry  string
		}{{"forbidden", 403, `{}`, 503, "600"}, {"rate", 429, `{}`, 503, "3601"}, {"server", 500, `{}`, 502, ""}, {"invalidJSON", 200, `{`, 502, ""}, {"missingShape", 200, `{}`, 502, ""}, {"oversize", 200, strings.Repeat("x", transport.MaxBody+1), 502, ""}, {"notFound", 404, `{}`, 404, ""}} {
			t.Run(source+"/"+tt.name, func(t *testing.T) {
				var n atomic.Int32
				srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					n.Add(1)
					if tt.status == 429 {
						w.Header().Set("Retry-After", "3600")
					}
					w.WriteHeader(tt.status)
					fmt.Fprint(w, tt.body)
				}))
				defer srv.Close()
				p := newProvider(source, srv.URL)
				s := discovery.NewService(discovery.NewRegistry(p))
				kind := "anime"
				if source == "douban" || source == "tmdb" {
					kind = "movie"
				}
				q := discovery.Query{MediaType: kind, Page: 1, PageSize: 20}
				for i := 0; i < 2; i++ {
					_, e := s.Discover(context.Background(), source, q)
					var d *discovery.Error
					var legacyErr *legacy.Error
					if errors.As(e, &d) {
						if d.Status != tt.want || tt.retry != "" && source != "tmdb" && d.RetryAfter == "" {
							t.Fatal(d)
						}
					} else if errors.As(e, &legacyErr) {
						if legacyErr.Status != tt.want {
							t.Fatal(legacyErr)
						}
					} else {
						t.Fatal(e)
					}
				}
				if tt.want == 404 || tt.status == 429 || tt.status == 403 {
					if n.Load() != 1 && source != "tmdb" {
						t.Fatal("cooldown/negative", n.Load())
					}
				} else if n.Load() < 2 {
					t.Fatal("error cached")
				}
			})
		}
	}
}
func TestProviderTimeout(t *testing.T) {
	for _, source := range []string{"bangumi", "anilist", "douban", "tmdb"} {
		t.Run(source, func(t *testing.T) {
			srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { time.Sleep(50 * time.Millisecond); response(w, `{}`) }))
			defer srv.Close()
			p := newProvider(source, srv.URL)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
			defer cancel()
			kind := "anime"
			if source == "tmdb" || source == "douban" {
				kind = "movie"
			}
			_, e := p.Discover(ctx, discovery.Query{MediaType: kind, Page: 1, PageSize: 20})
			if !errors.Is(e, context.DeadlineExceeded) {
				t.Fatal(e)
			}
		})
	}
}
func TestGraphQLErrorsAndNoQuotaBypass(t *testing.T) {
	for _, status := range []int{200, 400, 429} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			var official atomic.Int32
			srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { official.Add(1); response(w, `{}`) }))
			defer srv.Close()
			proxy := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				response(w, `{"errors":[{"message":"invalid field"}],"data":{"Page":{}}}`)
			}))
			defer proxy.Close()
			p := anilist.New()
			p.ProxyURL = proxy.URL
			p.BaseURL = srv.URL
			p.ProxyTransport.Interval = 0
			_, e := p.Discover(context.Background(), discovery.Query{MediaType: "anime", Page: 1, PageSize: 20})
			if e == nil || official.Load() != 0 {
				t.Fatal("errors or bypass", e, official.Load())
			}
		})
	}
}
func TestDoubanRiskStopsRequests(t *testing.T) {
	for _, tt := range []struct {
		status int
		body   string
	}{{400, `{"code":996,"message":"invalid_request_996"}`}, {200, `<html>captcha 验证码</html>`}, {403, `{"message":"invalid_apikey"}`}} {
		t.Run(strconv.Itoa(tt.status), func(t *testing.T) {
			var n atomic.Int32
			srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				n.Add(1)
				w.WriteHeader(tt.status)
				fmt.Fprint(w, tt.body)
			}))
			defer srv.Close()
			p := newProvider("douban", srv.URL)
			for i := 0; i < 2; i++ {
				_, e := p.Discover(context.Background(), discovery.Query{MediaType: "movie", Page: 1, PageSize: 20})
				var d *discovery.Error
				if !errors.As(e, &d) || d.Status != 503 || d.RetryAfter == "" {
					t.Fatal(e)
				}
			}
			if n.Load() != 1 || p.Capabilities().Available {
				t.Fatal(n.Load())
			}
		})
	}
}
func TestProviderIdentityIsolation(t *testing.T) {
	seen := map[string]bool{}
	for _, source := range []string{"tmdb", "douban", "bangumi", "anilist"} {
		for _, kind := range []string{"movie", "tv", "anime"} {
			id := discovery.Identity(source, kind, "1")
			if seen[id.MediaID] || string(id.Source) != source || id.ProviderID != "1" {
				t.Fatal(id)
			}
			seen[id.MediaID] = true
		}
	}
	_ = media.SourceTMDB
}

// httptest recorder transport works in sandboxes where listening sockets are forbidden.
// Only dedicated fake hosts are intercepted; tagged real tests retain the real transport.
type fakeServer struct{ URL string }

var fakeMu sync.Mutex
var fakeHandlers = map[string]http.Handler{}
var fakeNumber int
var originalTransport = http.DefaultTransport

func init() { http.DefaultTransport = fakeTransport{} }
func newFakeServer(h http.Handler) *fakeServer {
	fakeMu.Lock()
	defer fakeMu.Unlock()
	fakeNumber++
	host := fmt.Sprintf("fixture-%d.test", fakeNumber)
	fakeHandlers[host] = h
	return &fakeServer{URL: "http://" + host}
}
func (s *fakeServer) Close() {
	fakeMu.Lock()
	defer fakeMu.Unlock()
	delete(fakeHandlers, strings.TrimPrefix(s.URL, "http://"))
}

type fakeTransport struct{}

func (fakeTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	fakeMu.Lock()
	h := fakeHandlers[r.URL.Host]
	fakeMu.Unlock()
	if h == nil {
		return originalTransport.RoundTrip(r)
	}
	if e := r.Context().Err(); e != nil {
		return nil, e
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if e := r.Context().Err(); e != nil {
		return nil, e
	}
	return w.Result(), nil
}

func TestTMDBAdapterPreservesNativeContractAndTrending(t *testing.T) {
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("language") != "zh-CN" {
			t.Error("locale")
		}
		switch r.URL.Path {
		case "/discover/movie":
			response(w, `{"results":[{"id":550,"title":"搏击俱乐部","release_date":"1999-10-15"}],"page":1,"total_results":20001,"total_pages":1001}`)
		case "/trending/all/day":
			response(w, `{"results":[{"id":550,"media_type":"movie","title":"电影"},{"id":550,"media_type":"tv","name":"剧集"},{"id":1,"media_type":"person","name":"演员"}],"total_results":20001,"total_pages":500}`)
		case "/movie/550":
			response(w, `{"id":550,"title":"电影"}`)
		case "/movie/550/external_ids":
			response(w, `{"id":550,"imdb_id":"tt0137523"}`)
		default:
			t.Error(r.URL.Path)
		}
	}))
	defer srv.Close()
	p := newProvider("tmdb", srv.URL)
	s := discovery.NewService(discovery.NewRegistry(p))
	page, e := s.Discover(context.Background(), "tmdb", discovery.Query{MediaType: "movie", Page: 1, PageSize: 20})
	if e != nil || !page.TotalCapped || page.Items[0].MediaID != "tmdb:movie:550" || page.Items[0].ReleaseDate != "1999-10-15" || page.FetchedAt == "" {
		t.Fatal(page, e)
	}
	d, e := s.Detail(context.Background(), "tmdb", "movie", "550", "")
	if e != nil || d.ExternalIDs == nil || d.ExternalIDs.IMDb != "tt0137523" || d.ExternalIDs.TMDB != "550" {
		t.Fatal(d, e)
	}
	rank, e := s.Ranking(context.Background(), "tmdb", "trending")
	if e != nil || len(rank.Items) != 2 || rank.Items[0].MediaID == rank.Items[1].MediaID {
		t.Fatal(rank, e)
	}
	for _, q := range []discovery.Query{{MediaType: "anime", Page: 1, PageSize: 20}, {MediaType: "movie", Page: 501, PageSize: 20}, {MediaType: "movie", Page: 1, PageSize: 21}, {MediaType: "movie", Page: 1, PageSize: 20, Search: "x", Genre: "16"}, {MediaType: "movie", Page: 1, PageSize: 20, Month: "1"}} {
		if p.Validate(q) == nil {
			t.Fatal(q)
		}
	}
}

func TestProviderDetailMismatchedIdentityIsInvalid(t *testing.T) {
	for _, source := range []string{"bangumi", "anilist", "douban", "tmdb"} {
		t.Run(source, func(t *testing.T) {
			srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch source {
				case "bangumi":
					response(w, bgmItem)
				case "anilist":
					response(w, `{"data":{"Media":`+aniItem+`}}`)
				case "douban":
					response(w, dbItem)
				default:
					response(w, `{"id":550,"title":"测试"}`)
				}
			}))
			defer srv.Close()
			s := discovery.NewService(discovery.NewRegistry(newProvider(source, srv.URL)))
			kind := "anime"
			if source == "douban" || source == "tmdb" {
				kind = "movie"
			}
			_, e := s.Detail(context.Background(), source, kind, "1", "")
			var de *discovery.Error
			if !errors.As(e, &de) || de.Status != 502 {
				t.Fatal(e)
			}
		})
	}
}

func TestAniListSortCapabilitiesRequireNativeSuccess(t *testing.T) {
	var n atomic.Int32
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		var body struct{ Query string }
		json.NewDecoder(r.Body).Decode(&body)
		if !strings.Contains(body.Query, "sort:POPULARITY_DESC") && !strings.Contains(body.Query, "sort:SCORE_DESC") && !strings.Contains(body.Query, "sort:TRENDING_DESC") {
			t.Error(body.Query)
		}
		response(w, `{"data":{"Page":{"pageInfo":{"total":5000,"hasNextPage":true},"media":[`+aniItem+`]}}}`)
	}))
	defer srv.Close()
	p := newProvider("anilist", srv.URL).(*anilist.Provider)
	if len(p.Capabilities().Filters.Sort) != 0 {
		t.Fatal("unverified advertised")
	}
	p.VerifyCapabilities(context.Background())
	p.VerifyCapabilities(context.Background())
	if len(p.Capabilities().Filters.Sort) != 3 || n.Load() != 3 {
		t.Fatal("probe/TTL", n.Load())
	}
	for _, sort := range p.Capabilities().Filters.Sort {
		if e := p.Validate(discovery.Query{MediaType: "anime", Page: 1, PageSize: 20, Sort: sort}); e != nil {
			t.Fatal(e)
		}
	}
}

func TestAniListNativeFilters(t *testing.T) {
	var calls int
	var expected map[string]any
	srv := newFakeServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body struct {
			Query     string
			Variables map[string]any
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		for key, value := range expected {
			if body.Variables[key] != value || !strings.Contains(body.Query, key+":$"+key) {
				t.Errorf("%s: %v query=%s", key, body.Variables, body.Query)
			}
		}
		for _, declaration := range []string{"$genre:String", "$season:MediaSeason", "$status:MediaStatus", "$countryOfOrigin:CountryCode", "$seasonYear:Int"} {
			key := strings.Split(strings.TrimPrefix(declaration, "$"), ":")[0]
			if _, ok := expected[key]; ok && !strings.Contains(body.Query, declaration) {
				t.Error(body.Query)
			}
		}
		response(w, `{"data":{"Page":{"pageInfo":{"total":5000,"hasNextPage":true},"media":[`+aniItem+`]}}}`)
	}))
	defer srv.Close()
	p := newProvider("anilist", srv.URL)
	base := discovery.Query{MediaType: "anime", Page: 1, PageSize: 1}
	cases := []struct {
		q    discovery.Query
		vars map[string]any
	}{}
	for _, genre := range p.Capabilities().Filters.Genre {
		q := base
		q.Genre = genre
		cases = append(cases, struct {
			q    discovery.Query
			vars map[string]any
		}{q, map[string]any{"genre": genre}})
	}
	for _, season := range p.Capabilities().Filters.Season {
		q := base
		q.Season = season
		cases = append(cases, struct {
			q    discovery.Query
			vars map[string]any
		}{q, map[string]any{"season": season}})
	}
	for _, status := range p.Capabilities().Filters.Status {
		q := base
		q.Status = status
		cases = append(cases, struct {
			q    discovery.Query
			vars map[string]any
		}{q, map[string]any{"status": status}})
	}
	for _, country := range p.Capabilities().Filters.Region {
		q := base
		q.Region = country
		cases = append(cases, struct {
			q    discovery.Query
			vars map[string]any
		}{q, map[string]any{"countryOfOrigin": country}})
	}
	q := base
	q.Year = "2025"
	cases = append(cases, struct {
		q    discovery.Query
		vars map[string]any
	}{q, map[string]any{"seasonYear": float64(2025)}})
	q = base
	q.Genre = "Action"
	q.Season = "WINTER"
	q.Year = "2024"
	q.Region = "JP"
	q.Status = "FINISHED"
	cases = append(cases, struct {
		q    discovery.Query
		vars map[string]any
	}{q, map[string]any{"genre": "Action", "season": "WINTER", "seasonYear": float64(2024), "countryOfOrigin": "JP", "status": "FINISHED"}})
	for _, tc := range cases {
		expected = tc.vars
		page, err := p.Discover(context.Background(), tc.q)
		if err != nil || !page.TotalCapped || len(page.Items) != 1 {
			t.Fatal(page, err)
		}
	}
	before := calls
	for _, field := range []string{"genre", "season", "status", "region", "year"} {
		for _, value := range []string{"INVALID", "", "1899", "2101"} {
			if value == "" {
				continue
			}
			q := base
			switch field {
			case "genre":
				q.Genre = value
			case "season":
				q.Season = value
			case "status":
				q.Status = value
			case "region":
				q.Region = value
			case "year":
				q.Year = value
			}
			_, err := p.Discover(context.Background(), q)
			var de *discovery.Error
			if !errors.As(err, &de) || de.Status != 400 || !strings.Contains(de.Message, "不支持") {
				t.Fatal(field, value, err)
			}
		}
	}
	if calls != before {
		t.Fatal("invalid filters reached upstream")
	}
	if p.Capabilities().Filters.SeasonRequiresYear {
		t.Fatal("season alone is supported")
	}
}
