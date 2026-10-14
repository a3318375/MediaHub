package animesync

import (
	"context"
	"errors"
	"media-center/internal/anime"
	"media-center/internal/store"
	"sync/atomic"
	"testing"
	"time"
)

type repo struct {
	*store.Store
	ready   atomic.Bool
	checked chan struct{}
}

func (r *repo) Anime115Ready() (bool, error) {
	if r.checked != nil {
		select {
		case r.checked <- struct{}{}:
		default:
		}
	}
	return r.ready.Load(), nil
}

type source struct {
	previews, metadata int
	items              []anime.Entry
	err                error
	started, release   chan struct{}
}

func (s *source) Metadata(_ context.Context, d anime.Draft, _ bool) (anime.Draft, error) {
	s.metadata++
	return d, nil
}
func (s *source) Preview(ctx context.Context, _ anime.Draft) (anime.Preview, error) {
	s.previews++
	if s.started != nil {
		close(s.started)
		select {
		case <-s.release:
		case <-ctx.Done():
			return anime.Preview{}, ctx.Err()
		}
	}
	return anime.Preview{Items: s.items}, s.err
}
func fixture(t *testing.T) (*repo, *source, *Updater) {
	t.Helper()
	db, e := store.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	r := &repo{Store: db}
	src := &source{}
	u := New(r, src)
	u.Now = func() time.Time { return time.Date(2026, 10, 13, 4, 0, 0, 0, Beijing()) }
	return r, src, u
}
func add(t *testing.T, r *repo, id string, week int, enabled bool) anime.Subscription {
	t.Helper()
	v, e := r.CreateAnime(anime.Draft{Title: "作品", BangumiID: id, Season: 1, Week: week, Enabled: enabled, URL: "https://example.org/rss", Source: "other", TotalEpisodes: 3})
	if e != nil {
		t.Fatal(e)
	}
	return v
}
func TestDailySelectsTodayAndYesterdayAndIsPersistent(t *testing.T) {
	r, s, u := fixture(t)
	r.ready.Store(true)
	add(t, r, "1", 2, true)
	add(t, r, "2", 1, true)
	add(t, r, "3", 2, false)
	add(t, r, "5", 7, true)
	done := add(t, r, "4", 2, true)
	done.Completed = true
	_, _ = r.SaveAnimeRefresh(done)
	if e := u.RunDaily(context.Background()); e != nil {
		t.Fatal(e)
	}
	if s.previews != 2 {
		t.Fatal(s.previews)
	}
	again := New(r, s)
	again.Now = u.Now
	if e := again.RunDaily(context.Background()); e != nil || s.previews != 2 {
		t.Fatalf("repeat %v %d", e, s.previews)
	}
}
func Test115GuardMakesNoUpstreamRequests(t *testing.T) {
	r, s, u := fixture(t)
	add(t, r, "1", 2, true)
	if !errors.Is(u.RunDaily(context.Background()), ErrDisabled) {
		t.Fatal("daily ran")
	}
	if !errors.Is(u.RunMetadata(context.Background()), ErrDisabled) {
		t.Fatal("metadata ran")
	}
	if s.previews+s.metadata != 0 {
		t.Fatal("upstream called")
	}
}
func TestManualRefreshWorksWithout115AndRetainsProgressOnFailure(t *testing.T) {
	r, s, u := fixture(t)
	v := add(t, r, "1", 2, true)
	one := 1.0
	s.items = []anime.Entry{{Title: "one", URL: "magnet:?xt=x", Episode: &one, Accepted: true}}
	first, e := u.Refresh(context.Background(), v.ID)
	if e != nil || first.LatestEpisode != 1 {
		t.Fatalf("%+v %v", first, e)
	}
	s.err = errors.New("network")
	failed, e := u.Refresh(context.Background(), v.ID)
	if e == nil || failed.LatestEpisode != 1 || len(failed.Resources) != 1 || failed.LastError == "" {
		t.Fatalf("lost state %+v %v", failed, e)
	}
	if s.metadata != 1 {
		t.Fatal("metadata did not respect 12h")
	}
}
func TestCompleteIsSkippedAndMetadataDoesNotOverwriteUserFields(t *testing.T) {
	r, s, u := fixture(t)
	v := add(t, r, "1", 2, true)
	v.KnownEpisodes = []int{1, 2, 3}
	_, _ = r.SaveAnimeRefresh(v)
	got, e := u.Refresh(context.Background(), v.ID)
	if e != nil || !got.Completed || s.previews+s.metadata != 0 {
		t.Fatalf("%+v %v", got, e)
	}
}
func TestConcurrentRefreshAndPause(t *testing.T) {
	r, s, u := fixture(t)
	v := add(t, r, "1", 2, true)
	s.started = make(chan struct{})
	s.release = make(chan struct{})
	finished := make(chan error, 1)
	go func() { _, e := u.Refresh(context.Background(), v.ID); finished <- e }()
	<-s.started
	if _, e := u.Refresh(context.Background(), v.ID); !errors.Is(e, ErrBusy) {
		t.Fatal(e)
	}
	if _, e := r.SetAnimeEnabled(v.ID, false); e != nil {
		t.Fatal(e)
	}
	close(s.release)
	if e := <-finished; e != nil {
		t.Fatal(e)
	}
	got, _ := r.GetAnime(v.ID)
	if got.Enabled {
		t.Fatal("pause overwritten")
	}
}
func TestCalendarUsesBeijingAndNextFourAM(t *testing.T) {
	now := time.Date(2026, 10, 11, 19, 59, 0, 0, time.UTC)
	if Weekday(now) != 1 {
		t.Fatal("timezone")
	}
	next := NextDaily(now)
	if next.Hour() != 4 || next.Day() != 12 || next.Sub(now) != time.Minute {
		t.Fatal(next)
	}
	at := next
	if NextDaily(at).Day() != 13 {
		t.Fatal("same-day timer")
	}
}
func TestMetadataPreservesUserTitleTotalAndRule(t *testing.T) {
	s := anime.Subscription{Draft: anime.Draft{Title: "自定义标题", Season: 3, TotalEpisodes: 12, Match: []string{"HEVC"}, Offset: -12, Week: 4}}
	applyMetadata(&s, anime.Draft{Title: "来源标题", TotalEpisodes: 24, Week: 2, Rating: "8.2"})
	if s.Title != "自定义标题" || s.TotalEpisodes != 12 || s.Season != 3 || s.Offset != -12 || s.Match[0] != "HEVC" || s.Week != 4 || s.Rating != "8.2" {
		t.Fatalf("%+v", s)
	}
}

type failingSaveRepo struct{ *repo }

func (r failingSaveRepo) SaveAnimeRefresh(s anime.Subscription) (anime.Subscription, error) {
	return s, errors.New("disk unavailable")
}
func TestSaveFailureDoesNotFinishDailyBatch(t *testing.T) {
	r, s, u := fixture(t)
	r.ready.Store(true)
	add(t, r, "1", 2, true)
	u.Store = failingSaveRepo{r}
	if e := u.RunDaily(context.Background()); e == nil {
		t.Fatal("save failure hidden")
	}
	done, e := r.AnimeDailyDone("2026-10-13")
	if e != nil || done || s.previews != 1 {
		t.Fatal("batch incorrectly marked done")
	}
}
func TestPersistedRSSFailureIsNotRetriedEveryMinute(t *testing.T) {
	r, s, u := fixture(t)
	r.ready.Store(true)
	v := add(t, r, "1", 2, true)
	s.err = errors.New("upstream down")
	if e := u.RunDaily(context.Background()); e != nil {
		t.Fatal(e)
	}
	got, _ := r.GetAnime(v.ID)
	if got.LastError == "" || got.LastScheduledDate != "2026-10-13" {
		t.Fatalf("%+v", got)
	}
	if e := u.RunDaily(context.Background()); e != nil || s.previews != 1 {
		t.Fatal("retry loop")
	}
}
func TestDailyContentionIsNotMarkedDone(t *testing.T) {
	r, _, u := fixture(t)
	r.ready.Store(true)
	v := add(t, r, "1", 2, true)
	if !u.acquire(v.ID) {
		t.Fatal("lock")
	}
	if e := u.RunDaily(context.Background()); !errors.Is(e, ErrBusy) {
		t.Fatal(e)
	}
	done, _ := r.AnimeDailyDone("2026-10-13")
	if done {
		t.Fatal("busy batch finished")
	}
	u.release(v.ID)
	if e := u.RunDaily(context.Background()); e != nil {
		t.Fatal(e)
	}
}
func TestSchedulerSleepsUnconfiguredAndWakesOnSettings(t *testing.T) {
	r, s, u := fixture(t)
	u.Now = time.Now
	r.checked = make(chan struct{}, 1)
	today := Weekday(time.Now())
	v := add(t, r, "1", today, true)
	s.started = make(chan struct{})
	s.release = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); u.Run(ctx, nil) }()
	select {
	case <-r.checked:
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("configuration not checked")
	}
	// No timers or upstream calls are active until this settings notification.
	r.ready.Store(true)
	u.Wake()
	if time.Now().In(Beijing()).Hour() < 4 {
		// Startup metadata sync runs before the daily RSS pass. Exercise cancellation below without waiting for 04:00.
		cancel()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("scheduler did not stop")
		}
		return
	}
	select {
	case <-s.started:
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("did not wake")
	}
	r.ready.Store(false)
	u.Wake()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("scheduler cancellation hung")
	}
	got, _ := r.GetAnime(v.ID)
	if got.LastCheckedAt != "" {
		t.Fatal("cancelled refresh persisted")
	}
}
func TestRetryDelays(t *testing.T) {
	now := time.Date(2026, 10, 13, 5, 0, 0, 0, Beijing())
	if dailyDelay(now, ErrBusy) != time.Minute || dailyDelay(now, errors.New("db")) != 5*time.Minute || dailyDelay(now, nil) != 23*time.Hour {
		t.Fatal("retry delay")
	}
}

func TestEligibleIncludesSundayBeforeMonday(t *testing.T) {
	now := time.Date(2026, 10, 12, 4, 0, 0, 0, Beijing())
	for _, tc := range []struct {
		week                     int
		enabled, completed, want bool
	}{
		{1, true, false, true}, {7, true, false, true}, {6, true, false, false}, {2, true, false, false},
		{0, true, false, false}, {7, false, false, false}, {7, true, true, false},
	} {
		s := anime.Subscription{Draft: anime.Draft{Week: tc.week, Enabled: tc.enabled}, Completed: tc.completed}
		if got := Eligible(s, now); got != tc.want {
			t.Fatalf("%+v eligible=%t", tc, got)
		}
	}
	// UTC Sunday evening is already Monday in Beijing.
	if !Eligible(anime.Subscription{Draft: anime.Draft{Week: 7, Enabled: true}}, time.Date(2026, 10, 11, 20, 0, 0, 0, time.UTC)) {
		t.Fatal("Beijing previous-day selection failed")
	}
}
