package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDatabaseNameMigrationPreservesFiles(t *testing.T) {
	dir := t.TempDir()
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if err := os.WriteFile(filepath.Join(dir, "media-center.db"+suffix), []byte("preserve"+suffix), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := migrateDatabaseName(dir); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		data, err := os.ReadFile(filepath.Join(dir, "mediahub.db"+suffix))
		if err != nil || string(data) != "preserve"+suffix {
			t.Fatalf("lost file %s: %v", suffix, err)
		}
	}
	if err := migrateDatabaseName(dir); err != nil {
		t.Fatal(err)
	}
}

func TestDatabaseNameMigrationRefusesConflicts(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"media-center.db", "mediahub.db"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := migrateDatabaseName(dir); err == nil {
		t.Fatal("must not choose between existing databases")
	}
	for _, name := range []string{"media-center.db", "mediahub.db"} {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil || string(data) != name {
			t.Fatalf("changed %s", name)
		}
	}
}
