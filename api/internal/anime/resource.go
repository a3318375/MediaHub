package anime

import (
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strings"

	"media-center/internal/download"
)

// DescribeResource never promotes a release detail page to a downloadable file.
func DescribeResource(e *Entry, declaredTorrent bool) {
	e.ResourceID = ""
	e.DownloadKind = ""
	if magnet, hash, err := download.NormalizeMagnet(e.URL); err == nil {
		e.URL = magnet
		e.ResourceID = "btih:" + hash
		e.DownloadKind = "magnet"
		return
	}
	u, err := url.Parse(e.URL)
	if err != nil || u.User != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") {
		e.URL = ""
		return
	}
	if !declaredTorrent && !strings.HasSuffix(strings.ToLower(u.Path), ".torrent") {
		e.URL = ""
		return
	}
	u.Fragment = ""
	u.Host = strings.ToLower(u.Host)
	e.URL = u.String()
	h := sha256.Sum256([]byte(e.URL))
	e.ResourceID = "torrent-url:" + hex.EncodeToString(h[:])
	e.DownloadKind = "torrent"
}
