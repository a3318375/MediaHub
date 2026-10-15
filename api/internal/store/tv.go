package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"media-center/internal/tv"
)

func (s *Store) ListTV() ([]tv.Subscription, error) {
	rows, err := s.db.Query(`SELECT data FROM tv_subscriptions ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tv.Subscription{}
	for rows.Next() {
		var data []byte
		var v tv.Subscription
		if err = rows.Scan(&data); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(data, &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) GetTV(id string) (tv.Subscription, error) {
	var data []byte
	var v tv.Subscription
	err := s.db.QueryRow(`SELECT data FROM tv_subscriptions WHERE id=?`, id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	err = json.Unmarshal(data, &v)
	return v, err
}

func (s *Store) CreateTV(d tv.Draft) (tv.Subscription, error) {
	if err := tv.Validate(&d); err != nil {
		return tv.Subscription{}, err
	}
	id := fmt.Sprintf("tmdb-%s-s%d", d.TMDBID, d.Season)
	v := tv.Subscription{Draft: d, ID: id, Revision: 1, Episodes: []tv.Episode{}, Resources: []tv.Candidate{}, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	data, err := json.Marshal(v)
	if err != nil {
		return v, err
	}
	result, err := s.db.Exec(`INSERT INTO tv_subscriptions(id,data) VALUES(?,?) ON CONFLICT(id) DO NOTHING`, id, data)
	if err != nil {
		return v, err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return v, ErrSubscriptionExists
	}
	return v, nil
}

func (s *Store) SaveTVRefresh(v tv.Subscription) (tv.Subscription, error) {
	// Only refresh fields are merged: a concurrent pause/rule edit cannot be overwritten.
	tx, err := s.db.Begin()
	if err != nil {
		return v, err
	}
	defer tx.Rollback()
	var raw []byte
	if err = tx.QueryRow(`SELECT data FROM tv_subscriptions WHERE id=?`, v.ID).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return v, ErrNotFound
		}
		return v, err
	}
	var current tv.Subscription
	if err = json.Unmarshal(raw, &current); err != nil {
		return v, err
	}
	// Revision rejects in-flight results after edits or pause/resume. CreatedAt
	// also distinguishes a deleted-and-recreated subscription with the same ID.
	if v.Revision != current.Revision || v.CreatedAt != current.CreatedAt {
		return current, nil
	}
	v.Draft = current.Draft
	data, err := json.Marshal(v)
	if err != nil {
		return v, err
	}
	if _, err = tx.Exec(`UPDATE tv_subscriptions SET data=? WHERE id=?`, data, v.ID); err != nil {
		return v, err
	}
	return v, tx.Commit()
}

func (s *Store) UpdateTV(id string, d tv.Draft) (tv.Subscription, error) {
	if err := tv.Validate(&d); err != nil {
		return tv.Subscription{}, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return tv.Subscription{}, err
	}
	defer tx.Rollback()
	var raw []byte
	if err = tx.QueryRow(`SELECT data FROM tv_subscriptions WHERE id=?`, id).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			err = ErrNotFound
		}
		return tv.Subscription{}, err
	}
	var v tv.Subscription
	if err = json.Unmarshal(raw, &v); err != nil {
		return v, err
	}
	if v.TMDBID != d.TMDBID || v.Season != d.Season {
		return v, tv.ErrIdentityImmutable
	}
	old, _ := json.Marshal(v.Rules)
	updated, _ := json.Marshal(d.Rules)
	if string(old) != string(updated) || d.Title != v.Title {
		v.Resources = []tv.Candidate{}
	}
	v.Draft = d
	v.Revision++
	v.NextCheckAt = ""
	data, err := json.Marshal(v)
	if err != nil {
		return v, err
	}
	if _, err = tx.Exec(`UPDATE tv_subscriptions SET data=? WHERE id=?`, data, id); err != nil {
		return v, err
	}
	return v, tx.Commit()
}

func (s *Store) DeleteTV(id string) error {
	r, err := s.db.Exec(`DELETE FROM tv_subscriptions WHERE id=?`, id)
	if err != nil {
		return err
	}
	n, _ := r.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
