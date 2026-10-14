package download

import (
	"crypto/sha1"
	"encoding/hex"
	"strings"
	"testing"
)

func TestTorrentUsesRawInfoHashAndKeepsTracker(t *testing.T) {
	info := "d6:lengthi4e4:name5:a.mkv12:piece lengthi4e6:pieces20:" + strings.Repeat("p", 20) + "e"
	data := []byte("d8:announce18:https://tracker.io4:info" + info + "e")
	out, err := ParseTorrent(data)
	hash := sha1.Sum([]byte(info))
	if err != nil || out.Hash != hex.EncodeToString(hash[:]) || len(out.Files) != 1 || out.Files[0].Path != "a.mkv" || !strings.Contains(out.Magnet, "tr=") {
		t.Fatal(out, err)
	}
	for _, raw := range []string{
		string(data) + "junk",
		"d4:info" + strings.Replace(info, "i4e4:name", "i8e4:name", 1) + "e",
		"d4:info" + strings.Replace(info, "5:a.mkv", "2:..", 1) + "e",
		"d4:info" + strings.Replace(info, "i4e4:name", "i04e4:name", 1) + "e",
		"d4:info" + strings.Replace(info, "6:pieces20:", "6:pieces19:", 1) + "e",
	} {
		if _, err = ParseTorrent([]byte(raw)); err == nil {
			t.Fatal("invalid torrent accepted", raw)
		}
	}
}
