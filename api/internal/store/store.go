package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema embed.FS

var ErrNotFound = errors.New("not found")
var ErrAlreadyInitialized = errors.New("account is already initialized")

type Store struct {
	db        *sql.DB
	secretKey []byte
}

type User struct {
	ID           string `json:"id"`
	Account      string `json:"account"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Avatar       string `json:"avatar"`
	PasswordHash string `json:"-"`
}

type APIKey struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	CreatedAt  string  `json:"createdAt"`
	LastUsedAt *string `json:"lastUsedAt"`
	RevokedAt  *string `json:"revokedAt"`
}

type LogEntry struct {
	ID      int64  `json:"id"`
	Time    string `json:"time"`
	Source  string `json:"source"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	key, err := loadOrCreateKey(filepath.Join(dataDir, "master.key"))
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(dataDir, "media-center.db"))
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	for _, pragma := range []string{`PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, `PRAGMA foreign_keys=ON`} {
		if _, err = db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("configure sqlite: %w", err)
		}
	}
	migration, err := schema.ReadFile("schema.sql")
	if err == nil {
		for _, statement := range strings.Split(string(migration), ";") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			if _, err = db.Exec(statement); err != nil {
				break
			}
		}
	}
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize schema: %w", err)
	}
	return &Store{db: db, secretKey: key}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func loadOrCreateKey(path string) ([]byte, error) {
	key, err := os.ReadFile(path)
	if err == nil {
		if len(key) != 32 {
			return nil, fmt.Errorf("invalid encryption key at %s", path)
		}
		return key, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read encryption key: %w", err)
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			key, err = os.ReadFile(path)
			if err == nil && len(key) == 32 {
				return key, nil
			}
		}
		return nil, fmt.Errorf("create encryption key: %w", err)
	}
	if _, err = file.Write(key); err != nil {
		file.Close()
		return nil, err
	}
	if err = file.Close(); err != nil {
		return nil, err
	}
	return key, nil
}

func (s *Store) encrypt(plain []byte) (string, error) {
	block, err := aes.NewCipher(s.secretKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plain, nil)
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (s *Store) decrypt(encoded string) ([]byte, error) {
	sealed, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(s.secretKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("invalid encrypted setting")
	}
	return gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
}

func (s *Store) HasUser() (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count > 0, err
}

func (s *Store) CreateUser(account, name, passwordHash string) (User, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	user := User{ID: "owner", Account: account, Name: name}
	_, err := s.db.Exec(`INSERT INTO users(id, account, display_name, password_hash, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`, user.ID, account, name, passwordHash, now, now)
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) UserByAccount(account string) (User, error) {
	var user User
	err := s.db.QueryRow(`SELECT id, account, display_name, password_hash FROM users WHERE account = ? COLLATE NOCASE`, account).Scan(&user.ID, &user.Account, &user.Name, &user.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) UserByID(id string) (User, error) {
	var user User
	err := s.db.QueryRow(`SELECT id, account, display_name, password_hash FROM users WHERE id = ?`, id).Scan(&user.ID, &user.Account, &user.Name, &user.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) UpdateUser(id, account, name string) error {
	_, err := s.db.Exec(`UPDATE users SET account = ?, display_name = ?, updated_at = ? WHERE id = ?`, account, name, time.Now().UTC().Format(time.RFC3339Nano), id)
	return err
}

func (s *Store) UpdatePassword(id, hash string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hash, time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM sessions WHERE user_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CreateSession(tokenHash, userID string, expires time.Time) error {
	_, err := s.db.Exec(`INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)`, tokenHash, userID, expires.UTC().Unix(), time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func (s *Store) SessionUser(tokenHash string) (User, error) {
	var user User
	err := s.db.QueryRow(`SELECT u.id, u.account, u.display_name, u.password_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, tokenHash, time.Now().UTC().Unix()).Scan(&user.ID, &user.Account, &user.Name, &user.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) DeleteSession(tokenHash string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func (s *Store) CreateAPIKey(id, userID, name, prefix, keyHash string) (APIKey, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.db.Exec(`INSERT INTO api_keys(id, user_id, name, key_prefix, key_hash, created_at) VALUES(?, ?, ?, ?, ?, ?)`, id, userID, name, prefix, keyHash, now)
	if err != nil {
		return APIKey{}, err
	}
	return APIKey{ID: id, Name: name, Prefix: prefix, CreatedAt: now}, nil
}

func (s *Store) ListAPIKeys(userID string) ([]APIKey, error) {
	rows, err := s.db.Query(`SELECT id, name, key_prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []APIKey{}
	for rows.Next() {
		var key APIKey
		if err := rows.Scan(&key.ID, &key.Name, &key.Prefix, &key.CreatedAt, &key.LastUsedAt, &key.RevokedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (s *Store) RevokeAPIKey(userID, id string) error {
	_, err := s.db.Exec(`UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), id, userID)
	return err
}

func (s *Store) APIKeyUser(keyHash string) (User, error) {
	var user User
	err := s.db.QueryRow(`SELECT u.id, u.account, u.display_name FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked_at IS NULL`, keyHash).Scan(&user.ID, &user.Account, &user.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	_, err = s.db.Exec(`UPDATE api_keys SET last_used_at=? WHERE key_hash=?`, time.Now().UTC().Format(time.RFC3339Nano), keyHash)
	return user, err
}

func (s *Store) RecordLog(source, level, message string) error {
	_, err := s.db.Exec(`INSERT INTO activity_logs(occurred_at, source, level, message) VALUES(?, ?, ?, ?)`, time.Now().UTC().Format(time.RFC3339Nano), source, level, message)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 5000)`)
	return err
}

func (s *Store) ListLogs(level, source, query string, limit int) ([]LogEntry, error) {
	if limit < 1 || limit > 500 {
		limit = 200
	}
	rows, err := s.db.Query(`SELECT id, occurred_at, source, level, message FROM activity_logs WHERE (?='' OR level=?) AND (?='' OR source=?) AND (?='' OR message LIKE '%' || ? || '%') ORDER BY id DESC LIMIT ?`, level, level, source, source, query, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []LogEntry{}
	for rows.Next() {
		var entry LogEntry
		if err := rows.Scan(&entry.ID, &entry.Time, &entry.Source, &entry.Level, &entry.Message); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

var secretSettingNames = map[string]bool{
	"tmdb.apiKey":                 true,
	"emby.apiKey":                 true,
	"115.cookie":                  true,
	"notifications.botToken":      true,
	"notifications.webhookSecret": true,
}

func (s *Store) SaveSettings(section string, values map[string]json.RawMessage, clearSecrets []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for key, raw := range values {
		if !strings.HasPrefix(key, section+".") || len(raw) == 0 {
			return fmt.Errorf("invalid setting key %q", key)
		}
		if secretSettingNames[key] {
			var value string
			if err := json.Unmarshal(raw, &value); err != nil {
				return fmt.Errorf("secret %s must be a string", key)
			}
			if value == "" {
				continue
			}
			stored, err := s.encrypt([]byte(value))
			if err != nil {
				return err
			}
			if _, err = tx.Exec(`INSERT INTO settings(section, setting_key, value, is_secret, updated_at) VALUES(?, ?, ?, 1, ?) ON CONFLICT(section, setting_key) DO UPDATE SET value=excluded.value, is_secret=1, updated_at=excluded.updated_at`, section, key, stored, now); err != nil {
				return err
			}
			continue
		}
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return fmt.Errorf("invalid JSON value for %s", key)
		}
		if _, err := tx.Exec(`INSERT INTO settings(section, setting_key, value, is_secret, updated_at) VALUES(?, ?, ?, 0, ?) ON CONFLICT(section, setting_key) DO UPDATE SET value=excluded.value, is_secret=0, updated_at=excluded.updated_at`, section, key, string(raw), now); err != nil {
			return err
		}
	}
	for _, key := range clearSecrets {
		if !strings.HasPrefix(key, section+".") || !secretSettingNames[key] {
			return fmt.Errorf("invalid secret key %q", key)
		}
		if _, err := tx.Exec(`DELETE FROM settings WHERE section=? AND setting_key=? AND is_secret=1`, section, key); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ReadSettings(section string) (map[string]any, []string, error) {
	rows, err := s.db.Query(`SELECT setting_key, value, is_secret FROM settings WHERE section=? ORDER BY setting_key`, section)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	values := map[string]any{}
	secrets := []string{}
	for rows.Next() {
		var key, value string
		var secret bool
		if err := rows.Scan(&key, &value, &secret); err != nil {
			return nil, nil, err
		}
		if secret {
			secrets = append(secrets, key)
			continue
		}
		var decoded any
		if err := json.Unmarshal([]byte(value), &decoded); err != nil {
			return nil, nil, err
		}
		values[key] = decoded
	}
	return values, secrets, rows.Err()
}

// ReadSecret decrypts service credentials for adapters and the explicit administrator reveal endpoint.
func (s *Store) ReadSecret(section, key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE section=? AND setting_key=? AND is_secret=1`, section, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	plain, err := s.decrypt(value)
	return string(plain), err
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum[:])
}
