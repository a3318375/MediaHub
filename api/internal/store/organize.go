package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"media-center/internal/download"
	"media-center/internal/organize"
	"media-center/internal/pan115"
	"time"
)

func organizeID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func (s *Store) SimpleOrganizeRule() (organize.Rule, error) {
	var raw string
	var r organize.Rule
	e := s.db.QueryRow(`SELECT data FROM organize_rules WHERE json_extract(data,'$.simple')=1 LIMIT 1`).Scan(&raw)
	if errors.Is(e, sql.ErrNoRows) {
		return r, organize.ErrNotFound
	}
	if e == nil {
		e = json.Unmarshal([]byte(raw), &r)
	}
	return r, e
}
func (s *Store) DownloadLibrary() (download.LibraryConfig, error) {
	r, e := s.SimpleOrganizeRule()
	if errors.Is(e, organize.ErrNotFound) {
		return download.LibraryConfig{}, nil
	}
	return download.LibraryConfig{AccountID: r.AccountID, SourceID: r.SourceID}, e
}

// Cancelled local monitoring does not prove that an already submitted remote job stopped.
func (s *Store) OrganizeUnfinished(account string) ([]download.Task, error) {
	rows, e := s.db.Query(`SELECT data FROM download_tasks WHERE account_id=? AND (state NOT IN ('completed','failed','cancelled') OR (state='cancelled' AND COALESCE(json_extract(data,'$.submissionStartedAt'),'')!='')) LIMIT 201`, account)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []download.Task{}
	for rows.Next() {
		var raw string
		var task download.Task
		if e = rows.Scan(&raw); e != nil {
			return nil, e
		}
		if e = json.Unmarshal([]byte(raw), &task); e != nil {
			return nil, e
		}
		out = append(out, task)
	}
	if len(out) > 200 {
		return nil, fmt.Errorf("未确认远端完成的下载超过 200 条，请先核对下载记录")
	}
	return out, rows.Err()
}
func (s *Store) OrganizeRules() ([]organize.Rule, error) {
	rows, e := s.db.Query(`SELECT data FROM organize_rules ORDER BY id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []organize.Rule{}
	for rows.Next() {
		var raw string
		var r organize.Rule
		if e = rows.Scan(&raw); e != nil {
			return nil, e
		}
		if e = json.Unmarshal([]byte(raw), &r); e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) OrganizeRule(id string) (organize.Rule, error) {
	var raw string
	var r organize.Rule
	e := s.db.QueryRow(`SELECT data FROM organize_rules WHERE id=?`, id).Scan(&raw)
	if errors.Is(e, sql.ErrNoRows) {
		return r, organize.ErrNotFound
	}
	if e == nil {
		e = json.Unmarshal([]byte(raw), &r)
	}
	return r, e
}
func (s *Store) SaveOrganizeRule(r organize.Rule) (organize.Rule, error) {
	creating := r.ID == ""
	if e := organize.ValidateRule(r); e != nil {
		return r, e
	}
	rules, e := s.OrganizeRules()
	if e != nil {
		return r, e
	}
	if r.ID == "" {
		if len(rules) >= 50 {
			return r, fmt.Errorf("整理规则最多 50 条")
		}
		r.ID = organizeID()
		r.Version = 1
	} else {
		old, e := s.OrganizeRule(r.ID)
		if e != nil {
			return r, e
		}
		r.Version = old.Version + 1
	}
	raw, e := json.Marshal(r)
	if e == nil {
		if creating {
			_, e = s.db.Exec(`INSERT INTO organize_rules(id,data) VALUES(?,?)`, r.ID, string(raw))
		} else {
			var result sql.Result
			result, e = s.db.Exec(`UPDATE organize_rules SET data=? WHERE id=? AND json_extract(data,'$.version')=?`, string(raw), r.ID, r.Version-1)
			if e == nil {
				n, err := result.RowsAffected()
				e = err
				if e == nil && n != 1 {
					e = organize.ErrConflict
				}
			}
		}
	}
	return r, e
}
func (s *Store) CreateOrganizePlan(p organize.Plan) (organize.Plan, error) {
	p.ID = organizeID()
	p.Revision = 1
	p.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	p.UpdatedAt = p.CreatedAt
	raw, e := json.Marshal(p)
	if e != nil {
		return p, e
	}
	var date any
	if p.RunDate != "" {
		date = p.RunDate
	}
	_, e = s.db.Exec(`INSERT INTO organize_plans(id,rule_id,run_date,state,data) VALUES(?,?,?,?,?)`, p.ID, p.Rule.ID, date, p.State, string(raw))
	return p, e
}
func scanOrganize(row interface{ Scan(...any) error }) (organize.Plan, error) {
	var p organize.Plan
	var raw string
	e := row.Scan(&raw, &p.Revision)
	if errors.Is(e, sql.ErrNoRows) {
		return p, organize.ErrNotFound
	}
	revision := p.Revision
	if e == nil {
		e = json.Unmarshal([]byte(raw), &p)
	}
	p.Revision = revision
	return p, e
}
func (s *Store) OrganizePlan(id string) (organize.Plan, error) {
	return scanOrganize(s.db.QueryRow(`SELECT data,revision FROM organize_plans WHERE id=?`, id))
}
func (s *Store) OrganizePlans(active bool) ([]organize.Plan, error) {
	query := `SELECT data,revision FROM organize_plans`
	if active {
		query += ` WHERE state='running'`
	}
	query += ` ORDER BY rowid DESC LIMIT 100`
	rows, e := s.db.Query(query)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []organize.Plan{}
	for rows.Next() {
		p, e := scanOrganize(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Store) SaveOrganizePlan(p organize.Plan) error {
	p.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	raw, e := json.Marshal(p)
	if e != nil {
		return e
	}
	result, e := s.db.Exec(`UPDATE organize_plans SET data=?,state=?,revision=revision+1 WHERE id=? AND revision=?`, string(raw), p.State, p.ID, p.Revision)
	if e != nil {
		return e
	}
	n, e := result.RowsAffected()
	if e == nil && n != 1 {
		return organize.ErrConflict
	}
	return e
}
func (s *Store) OrganizeRan(id, date string) (bool, error) {
	var count int
	e := s.db.QueryRow(`SELECT COUNT(*) FROM organize_plans WHERE rule_id=? AND run_date=?`, id, date).Scan(&count)
	return count > 0, e
}
func (s *Store) BindOrganizeFile(account string, f pan115.File, b organize.Binding) error {
	if b.Media.Provider == "" {
		b.Media.Provider = "manual"
	}
	if e := organize.ValidateMedia(b.Media); e != nil {
		return e
	}
	b.Size = f.Size
	b.SHA1 = f.SHA1
	raw, e := json.Marshal(b)
	if e != nil {
		return e
	}
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`INSERT INTO organize_bindings(account_id,file_id,data) VALUES(?,?,?) ON CONFLICT(account_id,file_id) DO UPDATE SET data=excluded.data`, account, f.ID, string(raw)); e != nil {
		return e
	}
	// Binding changes invalidate old plans, including plans with a manual rule binding.
	if _, e = tx.Exec(`UPDATE organize_rules SET data=json_set(data,'$.version',json_extract(data,'$.version')+1) WHERE json_extract(data,'$.accountId')=?`, account); e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Store) OrganizeLookup(account string) organize.Lookup {
	return func(ctx context.Context, f pan115.File) (organize.Binding, error) {
		var b organize.Binding
		var raw string
		e := s.db.QueryRowContext(ctx, `SELECT data FROM organize_bindings WHERE account_id=? AND file_id=?`, account, f.ID).Scan(&raw)
		if e == nil {
			e = json.Unmarshal([]byte(raw), &b)
			return b, e
		}
		if !errors.Is(e, sql.ErrNoRows) {
			return b, e
		}
		rows, e := s.db.QueryContext(ctx, `SELECT id FROM download_tasks WHERE account_id=? AND EXISTS(SELECT 1 FROM json_each(download_tasks.data,'$.artifacts') WHERE json_extract(value,'$.id')=?)`, account, f.ID)
		if e != nil {
			return b, e
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if e = rows.Scan(&id); e != nil {
				rows.Close()
				return b, e
			}
			ids = append(ids, id)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return b, e
		}
		for _, id := range ids {
			task, e := s.GetDownload(id)
			if e != nil {
				return b, e
			}
			next, e := organize.MetadataForArtifact(task, f)
			if e != nil {
				return b, e
			}
			if b.Ready {
				return b, fmt.Errorf("文件对应多个下载记录，请手动绑定")
			}
			b = next
		}
		return b, nil
	}
}
