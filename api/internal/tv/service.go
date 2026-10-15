package tv

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

var ErrBusy = errors.New("该追剧订阅正在刷新")

type Repository interface {
	ListTV() ([]Subscription, error)
	GetTV(string) (Subscription, error)
	SaveTVRefresh(Subscription) (Subscription, error)
}
type Metadata struct {
	Title    string
	Poster   string
	Episodes []Episode
}
type Service struct {
	Store    Repository
	Metadata func(context.Context, string, int) (Metadata, error)
	Search   func(context.Context, Draft) ([]Candidate, error)
	Now      func() time.Time
	mu       sync.Mutex
	active   map[string]bool
	wake     chan struct{}
}

func New(repo Repository) *Service {
	return &Service{Store: repo, Now: time.Now, active: map[string]bool{}, wake: make(chan struct{}, 1)}
}

func (s *Service) Wake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

var Location = time.FixedZone("Asia/Shanghai", 8*60*60)

// Refresh serializes work per subscription; persistence rejects results whose
// revision changed while metadata or search requests were in flight.
func (s *Service) Refresh(ctx context.Context, id string) (Subscription, error) {
	s.mu.Lock()
	if s.active[id] {
		s.mu.Unlock()
		return Subscription{}, ErrBusy
	}
	s.active[id] = true
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.active, id); s.mu.Unlock() }()
	sub, err := s.Store.GetTV(id)
	if err != nil {
		return sub, err
	}
	now := s.Now()
	sub.Resources = Select(sub.Draft, sub.Resources)
	today := now.In(Location).Format("2006-01-02")
	sub.LastError = ""
	sub.MetadataError = ""
	if s.Metadata == nil {
		sub.MetadataError = "TMDB 服务未连接"
	} else if data, e := s.Metadata(ctx, sub.TMDBID, sub.Season); e != nil {
		sub.MetadataError = e.Error()
	} else {
		sub.Episodes = data.Episodes
		sub.Poster = data.Poster
	}
	// Missing metadata and undated episodes use a daily fallback; never invent an air date.
	searchDue := len(sub.Episodes) == 0 || sub.MetadataError != ""
	known := map[int]bool{}
	for _, v := range sub.Resources {
		known[v.Episode] = true
	}
	for _, e := range sub.Episodes {
		if e.AirDate == "" || (e.AirDate <= today && !known[e.Number]) {
			searchDue = true
		}
	}
	if searchDue {
		if s.Search == nil {
			sub.LastError = "PanSou 服务未连接"
		} else if items, e := s.Search(ctx, sub.Draft); e != nil {
			sub.LastError = e.Error()
		} else {
			// Re-rank old and new results together so a later search cannot replace
			// an existing 115 share with a smaller share or a magnet.
			selected := Select(sub.Draft, append(items, sub.Resources...))
			merged := map[int]Candidate{}
			for _, v := range sub.Resources {
				merged[v.Episode] = v
			}
			allowed := map[int]bool{}
			for _, v := range sub.Episodes {
				if v.AirDate == "" || v.AirDate <= today {
					allowed[v.Number] = true
				}
			}
			for _, v := range selected {
				if len(sub.Episodes) == 0 || allowed[v.Episode] {
					merged[v.Episode] = v
				}
			}
			sub.Resources = []Candidate{}
			for _, v := range merged {
				sub.Resources = append(sub.Resources, v)
			}
			sort.Slice(sub.Resources, func(i, j int) bool { return sub.Resources[i].Episode < sub.Resources[j].Episode })
		}
	}
	sub.LastCheckedAt = now.UTC().Format(time.RFC3339)
	// Daily metadata refresh also discovers date changes; actual resource searches follow the schedule.
	sub.NextCheckAt = now.Add(24 * time.Hour).UTC().Format(time.RFC3339)
	for _, e := range sub.Episodes {
		date, err := time.ParseInLocation("2006-01-02", e.AirDate, Location)
		if err == nil && date.After(now) && date.Before(now.Add(24*time.Hour)) {
			sub.NextCheckAt = date.UTC().Format(time.RFC3339)
		}
	}
	if ctx.Err() != nil {
		return sub, ctx.Err()
	}
	saved, err := s.Store.SaveTVRefresh(sub)
	if err != nil {
		return sub, err
	}
	return saved, nil
}

// Run checks persisted deadlines, so restarts do not reset the daily schedule.
func (s *Service) Run(ctx context.Context, log func(string)) {
	if log == nil {
		log = func(string) {}
	}
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		items, err := s.Store.ListTV()
		if err != nil {
			log("读取追剧订阅失败")
		} else {
			for _, v := range items {
				if ctx.Err() != nil {
					return
				}
				if !v.Enabled {
					continue
				}
				next, e := time.Parse(time.RFC3339, v.NextCheckAt)
				if e == nil && s.Now().Before(next) {
					continue
				}
				run, cancel := context.WithTimeout(ctx, 90*time.Second)
				out, e := s.Refresh(run, v.ID)
				cancel()
				if e != nil {
					log(fmt.Sprintf("追剧刷新失败：%v", e))
				} else if out.LastError != "" || out.MetadataError != "" {
					log("追剧《" + v.Title + "》：" + out.MetadataError + " " + out.LastError)
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		case <-s.wake:
		}
	}
}
