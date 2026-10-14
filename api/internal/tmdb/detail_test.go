package tmdb

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestDetailCountries(t *testing.T) {
	for _, tt := range []struct {
		name, kind, fields, region string
		countries                  []string
	}{
		{"movie production", "movie", `"production_countries":[{"iso_3166_1":"US"},{"iso_3166_1":"GB"}],"origin_country":["CN"]`, "US,GB", []string{"US", "GB"}},
		{"movie fallback", "movie", `"origin_country":["CN","HK"]`, "CN,HK", []string{"CN", "HK"}},
		{"movie empty production fallback", "movie", `"production_countries":[],"origin_country":["TW"]`, "TW", []string{"TW"}},
		{"movie missing code fallback", "movie", `"production_countries":[{}],"origin_country":["TW"]`, "TW", []string{"TW"}},
		{"tv origin", "tv", `"origin_country":["JP","KR"],"production_countries":[{"iso_3166_1":"US"}]`, "JP,KR", []string{"JP", "KR"}},
		{"unknown", "movie", `"production_countries":[{"iso_3166_1":"ZZ"}]`, "ZZ", []string{"ZZ"}},
		{"empty", "tv", `"origin_country":[]`, "", []string{}},
		{"missing", "movie", `"overview":""`, "", nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/external_ids") {
					w.WriteHeader(404)
					return
				}
				w.Write([]byte(`{"id":12,"title":"电影","name":"剧集",` + tt.fields + `}`))
			})
			d, err := c.Detail(context.Background(), testKey(t), tt.kind, "12")
			if err != nil || d.Region != tt.region || !reflect.DeepEqual(d.OriginCountries, tt.countries) {
				t.Fatalf("region=%q countries=%v err=%v", d.Region, d.OriginCountries, err)
			}
		})
	}
}

func TestDetailExternalIDs(t *testing.T) {
	for _, kind := range []string{"movie", "tv"} {
		for _, tt := range []struct {
			name   string
			status int
			body   string
			imdb   string
			calls  int
		}{
			{"success", 200, `{"id":12,"imdb_id":"tt0000012"}`, "tt0000012", 1},
			{"absent", 200, `{"id":12,"imdb_id":null}`, "", 1},
			{"404", 404, ``, "", 1},
			{"500", 500, ``, "", 3},
			{"malformed", 200, `{`, "", 1},
			{"wrong type", 200, `{"id":12,"imdb_id":123}`, "", 1},
			{"wrong id", 200, `{"id":13,"imdb_id":"tt0000012"}`, "", 1},
		} {
			t.Run(kind+"/"+tt.name, func(t *testing.T) {
				calls := 0
				c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
					switch r.URL.Path {
					case "/" + kind + "/12":
						w.Write([]byte(`{"id":12,"title":"电影","name":"剧集"}`))
					case "/" + kind + "/12/external_ids":
						calls++
						w.WriteHeader(tt.status)
						w.Write([]byte(tt.body))
					default:
						t.Error("unexpected upstream path")
						w.WriteHeader(404)
					}
				})
				d, err := c.Detail(context.Background(), testKey(t), kind, "12")
				if err != nil || d.SourceID != "12" || calls != tt.calls {
					t.Fatalf("detail failed: %v calls=%d", err, calls)
				}
				if tt.imdb != "" {
					if d.ExternalIDs == nil || d.ExternalIDs.IMDb != tt.imdb || d.ExternalIDs.TMDB != "12" {
						t.Fatal("missing external IDs")
					}
				} else {
					if d.ExternalIDs != nil {
						t.Fatal("unexpected external IDs")
					}
					body, e := json.Marshal(d)
					if e != nil || strings.Contains(string(body), "externalIds") {
						t.Fatal("failed external IDs should be omitted")
					}
				}
			})
		}
	}
}
