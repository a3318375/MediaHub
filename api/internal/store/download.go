package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"media-center/internal/download"
	"media-center/internal/pan115"
)

func scanDownload(row interface{ Scan(...any) error }) (download.Task, error) {
	var t download.Task
	var data string
	if err := row.Scan(&data, &t.Revision); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return t, download.ErrNotFound
		}
		return t, err
	}
	revision := t.Revision
	err := json.Unmarshal([]byte(data), &t)
	t.Revision = revision
	if t.Artifacts == nil {
		t.Artifacts = []pan115.File{}
	}
	t.References = []download.Reference{}
	return t, err
}
func (s *Store) CreateDownload(account, hash string, r download.Request) (download.Task, bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return download.Task{}, false, err
	}
	defer tx.Rollback()
	t, err := scanDownload(tx.QueryRow(`SELECT data,revision FROM download_tasks WHERE account_id=? AND resource_id=?`, account, hash))
	created := false
	if errors.Is(err, download.ErrNotFound) {
		var count int
		if err = tx.QueryRow(`SELECT COUNT(*) FROM download_tasks WHERE state NOT IN ('completed','failed','cancelled')`).Scan(&count); err != nil {
			return t, false, err
		}
		if count >= 200 {
			return t, false, download.ErrQueueFull
		}
		id := make([]byte, 16)
		if _, err = rand.Read(id); err != nil {
			return t, false, err
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		t = download.Task{ID: hex.EncodeToString(id), AccountID: account, Kind: r.Kind, URL: r.URL, ResourceID: hash, DirectoryID: r.DirectoryID, State: "queued", CreatedAt: now, UpdatedAt: now, Revision: 1, Artifacts: []pan115.File{}}
		t.SourceDirectoryID = r.SourceDirectoryID
		t.WholeShare = r.WholeShare
		t.FileIDs = r.FileIDs
		data, e := json.Marshal(t)
		if e != nil {
			return t, false, e
		}
		if _, err = tx.Exec(`INSERT INTO download_tasks(id,account_id,resource_id,state,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, t.ID, account, hash, t.State, string(data), now, now); err != nil {
			return t, false, err
		}
		if _, err = tx.Exec(`INSERT INTO download_events(task_id,state,error_code,occurred_at) VALUES(?,'queued','',?)`, t.ID, now); err != nil {
			return t, false, err
		}
		created = true
	} else if err != nil {
		return t, false, err
	}
	if t.DirectoryID != r.DirectoryID {
		return t, false, download.ErrConflict
	}
	if r.Kind == "share_transfer" {
		encrypted, e := s.encrypt([]byte(r.ReceiveCode))
		if e != nil {
			return t, false, e
		}
		if _, err = tx.Exec(`INSERT INTO download_task_secrets(task_id,value) VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET value=excluded.value`, t.ID, encrypted); err != nil {
			return t, false, err
		}
	}
	data, err := json.Marshal(r.Reference)
	if err != nil {
		return t, false, err
	}
	if _, err = tx.Exec(`INSERT INTO download_references(task_id,reference_key,data) VALUES(?,?,?) ON CONFLICT DO NOTHING`, t.ID, download.ReferenceKey(r.Reference), string(data)); err != nil {
		return t, false, err
	}
	if err = tx.Commit(); err != nil {
		return t, false, err
	}
	t, err = s.GetDownload(t.ID)
	return t, created, err
}

func (s *Store) DownloadReceiveCode(id string) (string, error) {
	var encrypted string
	if err := s.db.QueryRow(`SELECT value FROM download_task_secrets WHERE task_id=?`, id).Scan(&encrypted); err != nil {
		return "", err
	}
	raw, err := s.decrypt(encrypted)
	return string(raw), err
}
func (s *Store) references(t *download.Task) error {
	rows, err := s.db.Query(`SELECT data FROM download_references WHERE task_id=? ORDER BY reference_key`, t.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		var r download.Reference
		if err = rows.Scan(&raw); err != nil {
			return err
		}
		if err = json.Unmarshal([]byte(raw), &r); err != nil {
			return err
		}
		t.References = append(t.References, r)
	}
	return rows.Err()
}
func (s *Store) GetDownload(id string) (download.Task, error) {
	t, err := scanDownload(s.db.QueryRow(`SELECT data,revision FROM download_tasks WHERE id=?`, id))
	if err == nil {
		err = s.references(&t)
	}
	return t, err
}
func (s *Store) ListDownloads(active bool) ([]download.Task, error) {
	query := `SELECT data,revision FROM download_tasks ORDER BY created_at DESC LIMIT 200`
	if active {
		query = `SELECT data,revision FROM download_tasks WHERE state NOT IN ('completed','failed','cancelled') ORDER BY created_at LIMIT 200`
	}
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	out := []download.Task{}
	for rows.Next() {
		t, e := scanDownload(rows)
		if e != nil {
			rows.Close()
			return nil, e
		}
		out = append(out, t)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for i := range out {
		if err = s.references(&out[i]); err != nil {
			return nil, err
		}
	}
	return out, nil
}
func (s *Store) SaveDownload(t download.Task) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var state, code string
	if err = tx.QueryRow(`SELECT state,COALESCE(json_extract(data,'$.errorCode'),'') FROM download_tasks WHERE id=? AND revision=?`, t.ID, t.Revision).Scan(&state, &code); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return download.ErrConflict
		}
		return err
	}
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	t.References = nil
	data, err := json.Marshal(t)
	if err != nil {
		return err
	}
	result, err := tx.Exec(`UPDATE download_tasks SET state=?,revision=revision+1,data=?,updated_at=? WHERE id=? AND revision=?`, t.State, string(data), t.UpdatedAt, t.ID, t.Revision)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return download.ErrConflict
	}
	if state != t.State || code != t.ErrorCode {
		if _, err = tx.Exec(`INSERT INTO download_events(task_id,state,error_code,occurred_at) VALUES(?,?,?,?)`, t.ID, t.State, t.ErrorCode, t.UpdatedAt); err != nil {
			return err
		}
	}
	return tx.Commit()
}
