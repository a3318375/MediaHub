package tmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTVScheduleReadsNativeDatesAndUnknowns(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("api_key") != "test-key" || r.URL.Query().Get("language") != "zh-CN" {
			t.Error("missing request credentials or locale")
		}
		switch r.URL.Path {
		case "/tv/123":
			w.Write([]byte(`{"name":"测试剧集","poster_path":"/poster.jpg"}`))
		case "/tv/123/season/2":
			w.Write([]byte(`{"episodes":[{"episode_number":1,"name":"第一集","air_date":"2026-10-15"},{"episode_number":2,"air_date":null},{"episode_number":3,"air_date":"invalid"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client := NewClient()
	client.BaseURL = server.URL
	client.HTTP = server.Client()
	got, err := client.TVSchedule(context.Background(), "test-key", "123", 2)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "测试剧集" || len(got.Episodes) != 3 || got.Episodes[0].AirDate != "2026-10-15" || got.Episodes[1].AirDate != "" || got.Episodes[2].AirDate != "" {
		t.Fatalf("unexpected schedule: %+v", got)
	}
	if _, err = client.TVSchedule(context.Background(), "", "123", 2); err == nil {
		t.Fatal("missing credentials not reported")
	}
}

func TestTVScheduleReportsIncompleteUpstreamPayload(t *testing.T) {
	for _, body := range []string{`{}`, `{"episodes":null}`} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/tv/123" {
					w.Write([]byte(`{"name":"测试"}`))
					return
				}
				w.Write([]byte(body))
			}))
			defer server.Close()
			client := NewClient()
			client.BaseURL = server.URL
			client.HTTP = server.Client()
			if _, err := client.TVSchedule(context.Background(), "key", "123", 1); err == nil {
				t.Fatal("incomplete payload treated as an unannounced schedule")
			}
		})
	}
}
