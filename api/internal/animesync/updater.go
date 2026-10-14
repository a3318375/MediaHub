package animesync

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"media-center/internal/anime"
)

var ErrBusy = errors.New("该订阅正在刷新，请稍后再试")
var ErrDisabled = errors.New("未配置 115，自动订阅更新已停用")

type Repository interface {
	ListAnime() ([]anime.Subscription, error)
	GetAnime(string) (anime.Subscription, error)
	SaveAnimeRefresh(anime.Subscription) (anime.Subscription, error)
	Anime115Ready() (bool, error)
	AnimeDailyDone(string) (bool, error)
	FinishAnimeDaily(string) error
}
type Source interface {
	Preview(context.Context, anime.Draft) (anime.Preview, error)
	Metadata(context.Context, anime.Draft, bool) (anime.Draft, error)
}
type Updater struct {
	Store      Repository
	Source     Source
	Now        func() time.Time
	mu         sync.Mutex
	active     map[string]bool
	wake       chan struct{}
	autoCancel context.CancelFunc
}

func New(store Repository, source Source) *Updater {
	return &Updater{Store: store, Source: source, Now: time.Now, active: map[string]bool{}, wake: make(chan struct{}, 1)}
}
func (u *Updater) Wake() {
	u.mu.Lock()
	if u.autoCancel != nil {
		u.autoCancel()
	}
	u.mu.Unlock()
	select {
	case u.wake <- struct{}{}:
	default:
	}
}
func (u *Updater) acquire(id string) bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.active[id] {
		return false
	}
	u.active[id] = true
	return true
}
func (u *Updater) release(id string) { u.mu.Lock(); delete(u.active, id); u.mu.Unlock() }
func DueMetadata(s anime.Subscription, now time.Time) bool {
	last, e := time.Parse(time.RFC3339Nano, s.LastMetadataAt)
	return e != nil || !now.Before(last.Add(12*time.Hour))
}
func applyMetadata(s *anime.Subscription, d anime.Draft) {
	s.Rating = d.Rating
	s.Description = d.Description
	s.Poster = d.Poster
	s.OriginalTitle = d.OriginalTitle
	if s.TotalEpisodes == 0 && d.TotalEpisodes > 0 {
		s.TotalEpisodes = d.TotalEpisodes
	}
	if s.Week == 0 {
		s.Week = d.Week
	}
	if s.ReleaseDate == "" {
		s.ReleaseDate = d.ReleaseDate
	}
}
func (u *Updater) metadata(ctx context.Context, s *anime.Subscription, now time.Time) {
	d, e := u.Source.Metadata(ctx, s.Draft, true)
	if e != nil {
		s.MetadataError = "Bangumi 信息更新失败"
		return
	}
	s.LastMetadataAt = now.UTC().Format(time.RFC3339Nano)
	applyMetadata(s, d)
	s.MetadataError = ""
}
func (u *Updater) Refresh(ctx context.Context, id string) (anime.Subscription, error) {
	return u.refresh(ctx, id, "")
}
func (u *Updater) refresh(ctx context.Context, id, scheduledDate string) (anime.Subscription, error) {
	if !u.acquire(id) {
		return anime.Subscription{}, ErrBusy
	}
	defer u.release(id)
	s, e := u.Store.GetAnime(id)
	if e != nil {
		return s, e
	}
	if s.Completed || (scheduledDate != "" && (!s.Enabled || s.LastScheduledDate == scheduledDate)) {
		return s, nil
	}
	if anime.Covered(s.KnownEpisodes, s.TotalEpisodes) {
		s.Completed = true
		return u.Store.SaveAnimeRefresh(s)
	}
	now := u.Now()
	if DueMetadata(s, now) {
		u.metadata(ctx, &s, now)
	}
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	if anime.Covered(s.KnownEpisodes, s.TotalEpisodes) {
		s.Completed = true
		return u.Store.SaveAnimeRefresh(s)
	}
	p, e := u.Source.Preview(ctx, s.Draft)
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	s.LastCheckedAt = now.UTC().Format(time.RFC3339Nano)
	if scheduledDate != "" {
		s.LastScheduledDate = scheduledDate
	}
	if e != nil {
		s.LastError = "RSS 更新失败，请检查来源、规则或网络"
	} else {
		s.Discovered = p.Items
		anime.UpdateProgress(&s, p)
		s.LastError = ""
	}
	saved, saveErr := u.Store.SaveAnimeRefresh(s)
	if saveErr != nil {
		return s, saveErr
	}
	if e != nil {
		return saved, errors.New(s.LastError)
	}
	return saved, nil
}
func (u *Updater) RefreshMetadata(ctx context.Context, id string) error {
	if !u.acquire(id) {
		return ErrBusy
	}
	defer u.release(id)
	s, e := u.Store.GetAnime(id)
	if e != nil {
		return e
	}
	if !s.Enabled || s.Completed || !DueMetadata(s, u.Now()) {
		return nil
	}
	if anime.Covered(s.KnownEpisodes, s.TotalEpisodes) {
		s.Completed = true
		_, e = u.Store.SaveAnimeRefresh(s)
		return e
	}
	u.metadata(ctx, &s, u.Now())
	if ctx.Err() != nil {
		return ctx.Err()
	}
	s.Completed = anime.Covered(s.KnownEpisodes, s.TotalEpisodes)
	_, e = u.Store.SaveAnimeRefresh(s)
	return e
}
func Beijing() *time.Location { return time.FixedZone("Asia/Shanghai", 8*60*60) }
func Weekday(now time.Time) int {
	w := int(now.In(Beijing()).Weekday())
	if w == 0 {
		return 7
	}
	return w
}
func NextDaily(now time.Time) time.Time {
	local := now.In(Beijing())
	next := time.Date(local.Year(), local.Month(), local.Day(), 4, 0, 0, 0, Beijing())
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}
func Eligible(s anime.Subscription, now time.Time) bool {
	today := Weekday(now)
	yesterday := Weekday(now.In(Beijing()).AddDate(0, 0, -1))
	return s.Enabled && !s.Completed && (s.Week == today || s.Week == yesterday)
}
func (u *Updater) guard(ctx context.Context) error {
	if e := ctx.Err(); e != nil {
		return e
	}
	ready, e := u.Store.Anime115Ready()
	if e != nil {
		return e
	}
	if !ready {
		return ErrDisabled
	}
	return nil
}
func (u *Updater) RunDaily(ctx context.Context) error {
	if e := u.guard(ctx); e != nil {
		return e
	}
	now := u.Now()
	date := now.In(Beijing()).Format("2006-01-02")
	done, e := u.Store.AnimeDailyDone(date)
	if e != nil || done {
		return e
	}
	list, e := u.Store.ListAnime()
	if e != nil {
		return e
	}
	busy := false
	var persistenceErr error
	for _, s := range list {
		if !Eligible(s, now) || s.LastScheduledDate == date {
			continue
		}
		if e = u.guard(ctx); e != nil {
			return e
		}
		attemptCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		_, refreshErr := u.refresh(attemptCtx, s.ID, date)
		cancel()
		if errors.Is(refreshErr, ErrBusy) {
			busy = true
		} else if refreshErr != nil {
			persisted, lookupErr := u.Store.GetAnime(s.ID)
			if lookupErr != nil || (persisted.LastScheduledDate != date && !persisted.Completed) {
				persistenceErr = errors.Join(persistenceErr, fmt.Errorf("订阅 %s 更新结果未保存", s.ID))
			}
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
	if e = u.guard(ctx); e != nil {
		return e
	}
	if persistenceErr != nil {
		return persistenceErr
	}
	if busy {
		return ErrBusy
	}
	return u.Store.FinishAnimeDaily(date)
}
func (u *Updater) RunMetadata(ctx context.Context) error {
	if e := u.guard(ctx); e != nil {
		return e
	}
	list, e := u.Store.ListAnime()
	if e != nil {
		return e
	}
	for _, s := range list {
		if !s.Enabled || s.Completed || !DueMetadata(s, u.Now()) {
			continue
		}
		if e = u.guard(ctx); e != nil {
			return e
		}
		attemptCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		_ = u.RefreshMetadata(attemptCtx, s.ID)
		cancel()
	}
	return ctx.Err()
}

// No cron timers or upstream calls are active while 115 is unconfigured.
// Settings writes wake this loop, activating or cancelling the automatic work.
func (u *Updater) Run(ctx context.Context, report func(string)) {
	for ctx.Err() == nil {
		ready, e := u.Store.Anime115Ready()
		if e != nil {
			if report != nil {
				report("读取 115 配置失败，自动更新暂停")
			}
			ready = false
		}
		if !ready {
			select {
			case <-ctx.Done():
				return
			case <-u.wake:
				continue
			}
		}
		autoCtx, cancel := context.WithCancel(ctx)
		u.mu.Lock()
		u.autoCancel = cancel
		u.mu.Unlock()
		// Catch up today's pass after restart; persist dates before marking the batch done.
		var dailyErr error
		now := u.Now()
		if now.In(Beijing()).Hour() >= 4 {
			dailyErr = u.RunDaily(autoCtx)
			if dailyErr != nil && !errors.Is(dailyErr, context.Canceled) && report != nil {
				report(fmt.Sprintf("动漫每日更新：%v", dailyErr))
			}
		}
		if autoCtx.Err() == nil {
			if e = u.RunMetadata(autoCtx); e != nil && !errors.Is(e, context.Canceled) && report != nil {
				report("Bangumi 定时更新失败")
			}
		}
		daily := time.NewTimer(dailyDelay(u.Now(), dailyErr))
		metadata := time.NewTicker(12 * time.Hour)
		running := true
		for running && autoCtx.Err() == nil {
			select {
			case <-autoCtx.Done():
				running = false
			case <-u.wake:
				running = false
			case <-daily.C:
				e = u.RunDaily(autoCtx)
				if e != nil && !errors.Is(e, context.Canceled) && report != nil {
					report(fmt.Sprintf("动漫每日更新：%v", e))
				}
				daily.Reset(dailyDelay(u.Now(), e))
			case <-metadata.C:
				_ = u.RunMetadata(autoCtx)
			}
		}
		daily.Stop()
		metadata.Stop()
		cancel()
		u.mu.Lock()
		u.autoCancel = nil
		u.mu.Unlock()
	}
}

func dailyDelay(now time.Time, err error) time.Duration {
	if errors.Is(err, ErrBusy) {
		return time.Minute
	}
	if err != nil && !errors.Is(err, ErrDisabled) && !errors.Is(err, context.Canceled) {
		return 5 * time.Minute
	}
	return NextDaily(now).Sub(now)
}
