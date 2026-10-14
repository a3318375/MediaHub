package anime

import "testing"

func TestCoverageRequiresEveryIntegerEpisode(t *testing.T) {
	for _, tc := range []struct {
		known []int
		total int
		want  bool
	}{{[]int{1, 3}, 3, false}, {[]int{1, 2, 3}, 3, true}, {[]int{1, 1, 2}, 3, false}, {[]int{1, 2}, 0, false}} {
		if Covered(tc.known, tc.total) != tc.want {
			t.Fatalf("%+v", tc)
		}
	}
}
func TestProgressAccumulatesRollingFeedsAndIgnoresSpecials(t *testing.T) {
	s := Subscription{Draft: Draft{TotalEpisodes: 3}, KnownEpisodes: []int{1}}
	two, three, special := 2.0, 3.0, 2.5
	UpdateProgress(&s, Preview{Items: []Entry{{Title: "two", Accepted: true, Episode: &two}, {Title: "special", Accepted: true, Episode: &special}}})
	if s.Completed || s.LatestEpisode != 2 || len(s.KnownEpisodes) != 2 {
		t.Fatalf("%+v", s)
	}
	UpdateProgress(&s, Preview{Items: []Entry{{Accepted: true, Episode: &three}}})
	if !s.Completed || len(s.KnownEpisodes) != 3 {
		t.Fatalf("%+v", s)
	}
}
