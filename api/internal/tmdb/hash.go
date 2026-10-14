package tmdb

import (
	"crypto/sha256"
	"fmt"
)

func credentialHash(key string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(key))) }
