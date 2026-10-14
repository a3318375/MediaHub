package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"media-center/internal/anime"
	"media-center/internal/pan115"
	"strings"
	"time"
)

var ErrSubscriptionExists = errors.New("subscription already exists")

func (s *Store) ListAnime() ([]anime.Subscription, error) {
	rows, e := s.db.Query(`SELECT data FROM anime_subscriptions ORDER BY updated_at DESC`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []anime.Subscription{}
	type repair struct{ id, old, data string }
	repairs := []repair{}
	for rows.Next() {
		var b string
		var v anime.Subscription
		if e = rows.Scan(&b); e != nil {
			return nil, e
		}
		if e = json.Unmarshal([]byte(b), &v); e != nil {
			return nil, e
		}
		if anime.FillWeek(&v.Draft) {
			normalized, e := json.Marshal(v)
			if e != nil {
				return nil, e
			}
			repairs = append(repairs, repair{v.ID, b, string(normalized)})
		}
		out = append(out, v)
	}
	if e = rows.Err(); e != nil {
		return nil, e
	}
	if e = rows.Close(); e != nil {
		return nil, e
	}
	for _, r := range repairs {
		if _, e = s.db.Exec(`UPDATE anime_subscriptions SET data=? WHERE id=? AND data=?`, r.data, r.id, r.old); e != nil {
			return nil, e
		}
	}
	return out, nil
}
func (s *Store) CreateAnime(d anime.Draft) (anime.Subscription, error) {
	return s.createAnime(d, false)
}
func (s *Store) CreateAnimeWithDownload(d anime.Draft) (anime.Subscription, error) {
	return s.createAnime(d, true)
}
func (s *Store) createAnime(d anime.Draft, automatic bool) (anime.Subscription, error) {
	account := ""
	if automatic {
		cookie, e := s.ReadSecret("115", "115.cookie")
		if e == nil {
			account, _ = pan115.AccountID(cookie)
		}
	}
	anime.FillWeek(&d)
	v := anime.Subscription{Draft: d, AutoDownload: automatic}
	id := make([]byte, 16)
	if _, e := rand.Read(id); e != nil {
		return v, e
	}
	v.ID = hex.EncodeToString(id)
	v.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	v.UpdatedAt = v.CreatedAt
	b, e := json.Marshal(v)
	if e != nil {
		return v, e
	}
	tx, e := s.db.Begin()
	if e != nil {
		return v, e
	}
	defer tx.Rollback()
	res, e := tx.Exec(`INSERT INTO anime_subscriptions(id,bangumi_id,season,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(bangumi_id,season) DO NOTHING`, v.ID, d.BangumiID, d.Season, string(b), v.UpdatedAt)
	if e != nil {
		return v, e
	}
	n, e := res.RowsAffected()
	if e == nil && n == 0 {
		return v, ErrSubscriptionExists
	}
	if e != nil {
		return v, e
	}
	if automatic {
		if _, e = tx.Exec(`INSERT INTO anime_download_rules(subscription_id,enabled,directory_id,from_episode,updated_at) VALUES(?,1,'library',1,?)`, v.ID, v.CreatedAt); e != nil {
			return v, e
		}
		if _, e = tx.Exec(`INSERT INTO anime_download_rule_accounts(subscription_id,account_id) VALUES(?,?)`, v.ID, account); e != nil {
			return v, e
		}
	}
	e = tx.Commit()
	return v, e
}
func (s *Store) SetAnimeEnabled(id string, enabled bool) (anime.Subscription, error) {
	tx, e := s.db.Begin()
	if e != nil {
		return anime.Subscription{}, e
	}
	defer tx.Rollback()
	var raw string
	var v anime.Subscription
	if e = tx.QueryRow(`SELECT data FROM anime_subscriptions WHERE id=?`, id).Scan(&raw); e != nil {
		return v, ErrNotFound
	}
	if e = json.Unmarshal([]byte(raw), &v); e != nil {
		return v, e
	}
	v.Enabled = enabled
	v.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	b, e := json.Marshal(v)
	if e != nil {
		return v, e
	}
	if _, e = tx.Exec(`UPDATE anime_subscriptions SET data=?,updated_at=? WHERE id=?`, string(b), v.UpdatedAt, id); e != nil {
		return v, e
	}
	return v, tx.Commit()
}

func (s *Store) GetAnime(id string) (anime.Subscription, error) {
	var raw string
	var v anime.Subscription
	e := s.db.QueryRow(`SELECT data FROM anime_subscriptions WHERE id=?`, id).Scan(&raw)
	if errors.Is(e, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	if e != nil {
		return v, e
	}
	e = json.Unmarshal([]byte(raw), &v)
	return v, e
}

// Merge only server-owned refresh fields, so a concurrent pause is preserved.
func (s *Store) SaveAnimeRefresh(v anime.Subscription) (anime.Subscription, error) {
	tx, e := s.db.Begin()
	if e != nil {
		return v, e
	}
	defer tx.Rollback()
	var raw string
	var current anime.Subscription
	if e = tx.QueryRow(`SELECT data FROM anime_subscriptions WHERE id=?`, v.ID).Scan(&raw); errors.Is(e, sql.ErrNoRows) {
		return v, ErrNotFound
	} else if e != nil {
		return v, e
	}
	if e = json.Unmarshal([]byte(raw), &current); e != nil {
		return v, e
	}
	current.LatestEpisode = v.LatestEpisode
	current.KnownEpisodes = v.KnownEpisodes
	current.Completed = v.Completed
	current.Resources = v.Resources
	current.LastScheduledDate = v.LastScheduledDate
	current.LastCheckedAt = v.LastCheckedAt
	current.LastError = v.LastError
	current.LastMetadataAt = v.LastMetadataAt
	current.MetadataError = v.MetadataError
	current.OriginalTitle = v.OriginalTitle
	current.Description = v.Description
	current.Poster = v.Poster
	current.Rating = v.Rating
	if current.TotalEpisodes == 0 {
		current.TotalEpisodes = v.TotalEpisodes
	}
	if current.Week == 0 {
		current.Week = v.Week
	}
	if current.ReleaseDate == "" {
		current.ReleaseDate = v.ReleaseDate
	}
	current.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	b, e := json.Marshal(current)
	if e != nil {
		return current, e
	}
	if _, e = tx.Exec(`UPDATE anime_subscriptions SET data=?,updated_at=? WHERE id=?`, string(b), current.UpdatedAt, current.ID); e != nil {
		return current, e
	}
	if v.Discovered != nil && v.LastError == "" {
		if e = saveAnimeCandidates(tx, current, v.Discovered); e != nil {
			return current, e
		}
	}
	return current, tx.Commit()
}
func (s *Store) AnimeDailyDone(date string) (bool, error) {
	var count int
	e := s.db.QueryRow(`SELECT COUNT(*) FROM anime_schedule_runs WHERE run_date=?`, date).Scan(&count)
	return count > 0, e
}
func (s *Store) FinishAnimeDaily(date string) error {
	_, e := s.db.Exec(`INSERT INTO anime_schedule_runs(run_date) VALUES(?) ON CONFLICT(run_date) DO NOTHING`, date)
	return e
}
func (s *Store) Anime115Ready() (bool, error) {
	secret, e := s.ReadSecret("115", "115.cookie")
	if errors.Is(e, ErrNotFound) {
		return false, nil
	}
	return strings.TrimSpace(secret) != "", e
}
