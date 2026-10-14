package anime

import (
	"math"
	"sort"
)

// Coverage tracks observed releases, never claims that downloads have completed.
func Covered(episodes []int, total int) bool {
	if total <= 0 {
		return false
	}
	seen := map[int]bool{}
	for _, n := range episodes {
		if n >= 1 && n <= total {
			seen[n] = true
		}
	}
	return len(seen) == total
}
func UpdateProgress(s *Subscription, p Preview) {
	seen := map[int]bool{}
	for _, n := range s.KnownEpisodes {
		if n > 0 && n <= 10000 {
			seen[n] = true
		}
	}
	resources := []Entry{}
	for _, e := range p.Items {
		if !e.Accepted || e.Episode == nil {
			continue
		}
		resources = append(resources, e)
		value := *e.Episode
		if value == math.Trunc(value) && value > 0 && value <= 10000 {
			seen[int(value)] = true
		}
	}
	s.KnownEpisodes = []int{}
	s.LatestEpisode = 0
	for n := range seen {
		s.KnownEpisodes = append(s.KnownEpisodes, n)
		if n > s.LatestEpisode {
			s.LatestEpisode = n
		}
	}
	sort.Ints(s.KnownEpisodes)
	sort.SliceStable(resources, func(i, j int) bool { return *resources[i].Episode > *resources[j].Episode })
	if len(resources) > 100 {
		resources = resources[:100]
	}
	s.Resources = resources
	s.Completed = Covered(s.KnownEpisodes, s.TotalEpisodes)
}
