package store

import (
	"strings"
	"testing"
)

func TestSecretMaskShowsOnlyBoundedEnds(t *testing.T) {
	for _, value := range []string{"", "a", "ab", "abc", "abcdefgh", "abcdefghijklmnop", "中文凭证用于测试长字符串"} {
		masked := MaskSecret(value)
		if value != "" && strings.Contains(masked, value) {
			t.Fatalf("full value exposed for length %d", len([]rune(value)))
		}
	}
	if got := MaskSecret("1234567890abcdef"); got != "1234••••••••cdef" {
		t.Fatal(got)
	}
	if IsSecretSetting("tmdb", "115.cookie") || IsSecretSetting("tmdb", "tmdb.url") {
		t.Fatal("unregistered secret allowed")
	}
}
