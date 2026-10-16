package store

import (
	"fmt"
	"os"
	"path/filepath"
)

// Preserve existing SQLite data, including uncheckpointed WAL transactions.
// Never choose silently between two databases.
func migrateDatabaseName(dataDir string) error {
	oldPath := filepath.Join(dataDir, "media-center.db")
	newPath := filepath.Join(dataDir, "mediahub.db")
	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if _, err := os.Stat(newPath + suffix); err == nil {
			return fmt.Errorf("database migration blocked: %s already exists; preserve both databases and resolve explicitly", newPath+suffix)
		} else if !os.IsNotExist(err) {
			return err
		}
	}
	moved := []string{}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if _, err := os.Stat(oldPath + suffix); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return err
		}
		if err := os.Rename(oldPath+suffix, newPath+suffix); err != nil {
			for i := len(moved) - 1; i >= 0; i-- {
				if rollbackErr := os.Rename(newPath+moved[i], oldPath+moved[i]); rollbackErr != nil {
					return fmt.Errorf("database migration failed: %v; rollback failed: %w", err, rollbackErr)
				}
			}
			return fmt.Errorf("rename database (stop other backend processes first): %w", err)
		}
		moved = append(moved, suffix)
	}
	return nil
}
