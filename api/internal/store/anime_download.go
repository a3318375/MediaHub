package store

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"time"

	"media-center/internal/anime"
	"media-center/internal/download"
	"media-center/internal/pan115"
)

func saveAnimeCandidates(tx *sql.Tx, s anime.Subscription, entries []anime.Entry) error {
	rules, _ := json.Marshal(s.Draft)
	version := sha256.Sum256(rules)
	for _, e := range entries {
		if !e.Accepted || e.Episode == nil || *e.Episode != math.Trunc(*e.Episode) || *e.Episode < 1 {
			continue
		}
		if e.ResourceID == "" {
			anime.DescribeResource(&e, e.DownloadKind == "torrent")
		}
		if e.ResourceID == "" {
			continue
		}
		number := int(*e.Episode)
		original := number - s.Offset
		if e.OriginalEpisode != nil {
			original = int(*e.OriginalEpisode)
		}
		c := download.Candidate{SubscriptionID: s.ID, ResourceID: e.ResourceID, URL: e.URL, Kind: e.DownloadKind, Episode: number, Title: e.Title, State: "pending", Reference: download.Reference{Source: "anime_subscription", SourceID: s.ID, Media: download.MediaContext{Type: "anime", Title: s.Title, BangumiID: s.BangumiID, MikanID: s.MikanID, Season: s.Season, Episodes: []int{number}, OriginalEpisodes: []int{max(0, original)}, Offset: number - original, Subgroup: e.Feed, RuleVersion: hex.EncodeToString(version[:])}}}
		id := make([]byte, 16)
		if _, err := rand.Read(id); err != nil {
			return err
		}
		c.ID = hex.EncodeToString(id)
		raw, err := json.Marshal(c)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(`INSERT INTO anime_download_candidates(id,subscription_id,resource_id,episode,state,data,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(subscription_id,resource_id) DO NOTHING`, c.ID, s.ID, c.ResourceID, c.Episode, c.State, string(raw), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) SetAnimeDownloadRule(id string, r download.AnimeDownloadRule) error {
	if r.DirectoryID == "" {
		r.DirectoryID = "library"
	}
	if r.DirectoryID != "library" && (!pan115.ValidDirectory(r.DirectoryID) || r.DirectoryID == "0") || r.FromEpisode < 1 || r.FromEpisode > 10000 {
		return errors.New("需要具体的 115 目录 ID 和 1–10000 的起始集数")
	}
	cookie, secretErr := s.ReadSecret("115", "115.cookie")
	account, accountErr := pan115.AccountID(cookie)
	if r.Enabled && r.DirectoryID == "library" {
		config, e := s.DownloadLibrary()
		if e != nil || config.SourceID == "" || config.AccountID != account {
			return errors.New("请先在设置中保存当前账号的未整理目录")
		}
	}
	if r.Enabled && (secretErr != nil || accountErr != nil) {
		return &pan115.Error{Code: "credential", Message: "启用下载前请保存有效的 115 Cookie", Certain: true}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var raw string
	var sub anime.Subscription
	if err = tx.QueryRow(`SELECT data FROM anime_subscriptions WHERE id=?`, id).Scan(&raw); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if err = json.Unmarshal([]byte(raw), &sub); err != nil {
		return err
	}
	if err = saveAnimeCandidates(tx, sub, sub.Resources); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO anime_download_rules(subscription_id,enabled,directory_id,from_episode,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET enabled=excluded.enabled,directory_id=excluded.directory_id,from_episode=excluded.from_episode,updated_at=excluded.updated_at`, id, r.Enabled, r.DirectoryID, r.FromEpisode, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if accountErr == nil && secretErr == nil {
		if _, err = tx.Exec(`INSERT INTO anime_download_rule_accounts(subscription_id,account_id) VALUES(?,?) ON CONFLICT(subscription_id) DO UPDATE SET account_id=excluded.account_id`, id, account); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Explicit refresh adopts automatic defaults only when no download choice was saved.
func (s *Store) EnsureAnimeDownloadDefaults(id string) error {
	cookie, _ := s.ReadSecret("115", "115.cookie")
	account, _ := pan115.AccountID(cookie)
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var raw string
	var sub anime.Subscription
	if e = tx.QueryRow(`SELECT data FROM anime_subscriptions WHERE id=?`, id).Scan(&raw); errors.Is(e, sql.ErrNoRows) {
		return ErrNotFound
	} else if e != nil {
		return e
	}
	var count int
	if e = tx.QueryRow(`SELECT COUNT(*) FROM anime_download_rules WHERE subscription_id=?`, id).Scan(&count); e != nil {
		return e
	}
	if count > 0 {
		return nil
	}
	if e = json.Unmarshal([]byte(raw), &sub); e != nil {
		return e
	}
	sub.AutoDownload = true
	if e = saveAnimeCandidates(tx, sub, sub.Resources); e != nil {
		return e
	}
	data, e := json.Marshal(sub)
	if e != nil {
		return e
	}
	if _, e = tx.Exec(`UPDATE anime_subscriptions SET data=? WHERE id=?`, string(data), id); e != nil {
		return e
	}
	if _, e = tx.Exec(`INSERT INTO anime_download_rules(subscription_id,enabled,directory_id,from_episode,updated_at) VALUES(?,1,'library',1,?)`, id, time.Now().UTC().Format(time.RFC3339Nano)); e != nil {
		return e
	}
	if _, e = tx.Exec(`INSERT INTO anime_download_rule_accounts(subscription_id,account_id) VALUES(?,?)`, id, account); e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Store) GetAnimeDownloadRule(id string) (download.AnimeDownloadRule, error) {
	var r download.AnimeDownloadRule
	err := s.db.QueryRow(`SELECT r.enabled,r.directory_id,r.from_episode,COALESCE(a.account_id,'') FROM anime_download_rules r LEFT JOIN anime_download_rule_accounts a ON a.subscription_id=r.subscription_id WHERE r.subscription_id=?`, id).Scan(&r.Enabled, &r.DirectoryID, &r.FromEpisode, &r.AccountID)
	if errors.Is(err, sql.ErrNoRows) {
		if _, e := s.GetAnime(id); e != nil {
			return r, e
		}
		return download.AnimeDownloadRule{FromEpisode: 1}, nil
	}
	return r, err
}
func (s *Store) ListAnimeCandidates(id string) ([]download.Candidate, error) {
	if _, err := s.GetAnime(id); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT data FROM anime_download_candidates WHERE subscription_id=? ORDER BY episode DESC,created_at DESC LIMIT 1000`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []download.Candidate{}
	for rows.Next() {
		var raw string
		var c download.Candidate
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &c); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}
func (s *Store) ReadyAnimeCandidates(account string) ([]download.Candidate, error) {
	config, e := s.DownloadLibrary()
	if e != nil {
		return nil, e
	}
	if config.AccountID == account && config.SourceID != "" {
		if _, e = s.db.Exec(`UPDATE anime_download_rule_accounts SET account_id=? WHERE account_id='' AND subscription_id IN (SELECT id FROM anime_subscriptions WHERE json_extract(data,'$.autoDownload')=1)`, account); e != nil {
			return nil, e
		}
	}
	rows, err := s.db.Query(`SELECT c.data,r.directory_id FROM anime_download_candidates c JOIN anime_download_rules r ON r.subscription_id=c.subscription_id JOIN anime_download_rule_accounts ra ON ra.subscription_id=r.subscription_id JOIN anime_subscriptions a ON a.id=c.subscription_id WHERE ra.account_id=? AND r.enabled=1 AND json_extract(a.data,'$.enabled')=1 AND c.episode>=r.from_episode AND c.state IN ('pending','resolving','retry') AND NOT EXISTS(SELECT 1 FROM anime_download_candidates chosen WHERE chosen.subscription_id=c.subscription_id AND chosen.episode=c.episode AND chosen.task_id<>'') ORDER BY c.episode,c.created_at DESC LIMIT 5`, account)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []download.Candidate{}
	for rows.Next() {
		var raw, dir string
		var c download.Candidate
		if err = rows.Scan(&raw, &dir); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &c); err != nil {
			return nil, err
		}
		c.DirectoryID = dir
		out = append(out, c)
	}
	return out, rows.Err()
}
func (s *Store) SaveAnimeCandidate(c download.Candidate) error {
	raw, err := json.Marshal(c)
	if err != nil {
		return err
	}
	result, err := s.db.Exec(`UPDATE anime_download_candidates SET state=?,task_id=?,data=? WHERE id=?`, c.State, c.TaskID, string(raw), c.ID)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return ErrNotFound
	}
	return err
}
func (s *Store) AnimeCandidateEnabled(id, directory string) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM anime_download_candidates c JOIN anime_download_rules r ON r.subscription_id=c.subscription_id JOIN anime_subscriptions a ON a.id=c.subscription_id WHERE c.id=? AND r.enabled=1 AND r.directory_id=? AND c.episode>=r.from_episode AND json_extract(a.data,'$.enabled')=1 AND NOT EXISTS(SELECT 1 FROM anime_download_candidates chosen WHERE chosen.subscription_id=c.subscription_id AND chosen.episode=c.episode AND chosen.task_id<>'')`, id, directory).Scan(&count)
	return count > 0, err
}

func (s *Store) RetryAnimeCandidates(id string) (int64, error) {
	if _, err := s.GetAnime(id); err != nil {
		return 0, err
	}
	cookie, err := s.ReadSecret("115", "115.cookie")
	if err != nil {
		return 0, &pan115.Error{Code: "credential", Message: "请先配置 115 Cookie", Certain: true}
	}
	account, err := pan115.AccountID(cookie)
	if err != nil {
		return 0, err
	}
	result, err := s.db.Exec(`UPDATE anime_download_candidates SET state='pending',data=json_set(data,'$.state','pending','$.attempts',0,'$.error','','$.nextAttemptAt','') WHERE subscription_id=? AND task_id='' AND state IN ('failed','retry') AND EXISTS(SELECT 1 FROM anime_download_rules r JOIN anime_download_rule_accounts a ON a.subscription_id=r.subscription_id WHERE r.subscription_id=anime_download_candidates.subscription_id AND r.enabled=1 AND a.account_id=? AND anime_download_candidates.episode>=r.from_episode)`, id, account)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
