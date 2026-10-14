package anilist

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCountryAndOverviewMapping(t *testing.T) {
	p := New()
	r := record{ID: 1, Country: "JP", Description: "A<br><i>B</i> &amp; C"}
	r.Title.Native = "Title"
	s, err := p.mapRecord(r)
	if err != nil || len(s.OriginCountries) != 1 || s.OriginCountries[0] != "JP" || s.Overview != "A\nB & C" {
		t.Fatalf("%+v %v", s, err)
	}
}

type mappingRoundTrip func(*http.Request) (*http.Response, error)

func (f mappingRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestDetailRegion(t *testing.T) {
	p := New()
	p.ProxyURL = ""
	p.Transport.HTTP.Transport = mappingRoundTrip(func(r *http.Request) (*http.Response, error) {
		w := httptest.NewRecorder()
		w.Write([]byte(`{"data":{"Media":{"id":1,"title":{"native":"Title"},"countryOfOrigin":"JP"}}}`))
		return w.Result(), nil
	})
	d, err := p.Detail(context.Background(), "anime", "1", "zh-CN")
	if err != nil || d.Region != "JP" || len(d.OriginCountries) != 1 || d.OriginCountries[0] != "JP" {
		t.Fatalf("%+v %v", d, err)
	}
}
