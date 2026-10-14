package download

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type TorrentFile struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}
type Torrent struct {
	Hash   string        `json:"hash"`
	Magnet string        `json:"magnet"`
	Files  []TorrentFile `json:"files"`
}
type bdecoder struct {
	data       []byte
	pos, nodes int
	info       []byte
}

func (d *bdecoder) value(depth int) (any, error) {
	if depth > 32 || d.pos >= len(d.data) || d.nodes > 100000 {
		return nil, fmt.Errorf("种子结构超出限制")
	}
	d.nodes++
	c := d.data[d.pos]
	switch c {
	case 'i':
		d.pos++
		start := d.pos
		for d.pos < len(d.data) && d.data[d.pos] != 'e' {
			d.pos++
		}
		if d.pos == len(d.data) {
			return nil, fmt.Errorf("种子整数不完整")
		}
		text := string(d.data[start:d.pos])
		d.pos++
		n, e := strconv.ParseInt(text, 10, 64)
		if e != nil || text == "-0" || strings.HasPrefix(text, "+") || (len(text) > 1 && text[0] == '0') || strings.HasPrefix(text, "-0") {
			return nil, fmt.Errorf("种子整数无效")
		}
		return n, nil
	case 'l':
		d.pos++
		list := []any{}
		for d.pos < len(d.data) && d.data[d.pos] != 'e' {
			v, e := d.value(depth + 1)
			if e != nil {
				return nil, e
			}
			list = append(list, v)
		}
		if d.pos >= len(d.data) {
			return nil, fmt.Errorf("种子列表不完整")
		}
		d.pos++
		return list, nil
	case 'd':
		d.pos++
		dict := map[string]any{}
		last := ""
		for d.pos < len(d.data) && d.data[d.pos] != 'e' {
			key, e := d.value(depth + 1)
			if e != nil {
				return nil, e
			}
			kb, ok := key.([]byte)
			if !ok {
				return nil, fmt.Errorf("种子字典键无效")
			}
			k := string(kb)
			if _, exists := dict[k]; exists || len(dict) > 0 && k <= last {
				return nil, fmt.Errorf("种子字典不规范")
			}
			last = k
			start := d.pos
			v, e := d.value(depth + 1)
			if e != nil {
				return nil, e
			}
			dict[k] = v
			if depth == 0 && k == "info" {
				d.info = d.data[start:d.pos]
			}
		}
		if d.pos >= len(d.data) {
			return nil, fmt.Errorf("种子字典不完整")
		}
		d.pos++
		return dict, nil
	default:
		if c < '0' || c > '9' {
			return nil, fmt.Errorf("种子编码无效")
		}
		start := d.pos
		for d.pos < len(d.data) && d.data[d.pos] >= '0' && d.data[d.pos] <= '9' {
			d.pos++
		}
		if d.pos >= len(d.data) || d.data[d.pos] != ':' {
			return nil, fmt.Errorf("种子字串无效")
		}
		text := string(d.data[start:d.pos])
		n, e := strconv.Atoi(text)
		if e != nil || len(text) > 1 && text[0] == '0' || n < 0 || n > len(d.data)-d.pos-1 {
			return nil, fmt.Errorf("种子字串长度无效")
		}
		d.pos++
		v := d.data[d.pos : d.pos+n]
		d.pos += n
		return v, nil
	}
}
func ParseTorrent(data []byte) (Torrent, error) {
	out := Torrent{Files: []TorrentFile{}}
	if len(data) == 0 || len(data) > 2<<20 {
		return out, fmt.Errorf("种子大小无效（最多 2 MiB）")
	}
	d := bdecoder{data: data}
	v, e := d.value(0)
	if e != nil {
		return out, e
	}
	root, ok := v.(map[string]any)
	if !ok || d.pos != len(data) {
		return out, fmt.Errorf("需要完整 BT 种子")
	}
	info, ok := root["info"].(map[string]any)
	if !ok || len(d.info) == 0 {
		return out, fmt.Errorf("种子缺少 info")
	}
	pieces, ok := info["pieces"].([]byte)
	if !ok || len(pieces)%20 != 0 {
		return out, fmt.Errorf("暂不支持纯 BT v2 种子")
	}
	pieceLength, ok := info["piece length"].(int64)
	if !ok || pieceLength <= 0 {
		return out, fmt.Errorf("种子分片长度无效")
	}
	name, _ := info["name"].([]byte)
	if !safeTorrentSegment(string(name)) {
		return out, fmt.Errorf("种子文件名无效")
	}
	if private, _ := info["private"].(int64); private == 1 {
		return out, fmt.Errorf("私有种子不支持转磁力离线")
	}
	var total int64
	add := func(p string, length int64) error {
		if length < 0 || len(out.Files) >= 2000 || length > int64(^uint64(0)>>1)-total {
			return fmt.Errorf("种子文件数量或大小超出限制")
		}
		total += length
		out.Files = append(out.Files, TorrentFile{p, length})
		return nil
	}
	if list, ok := info["files"].([]any); ok {
		for _, item := range list {
			f, ok := item.(map[string]any)
			if !ok {
				return out, fmt.Errorf("种子文件结构无效")
			}
			parts, ok := f["path"].([]any)
			if !ok || len(parts) == 0 || len(parts) > 16 {
				return out, fmt.Errorf("种子路径无效")
			}
			names := []string{string(name)}
			for _, part := range parts {
				b, ok := part.([]byte)
				if !ok || !safeTorrentSegment(string(b)) {
					return out, fmt.Errorf("种子路径无效")
				}
				names = append(names, string(b))
			}
			length, ok := f["length"].(int64)
			if !ok {
				return out, fmt.Errorf("种子文件长度缺失")
			}
			if e = add(strings.Join(names, "/"), length); e != nil {
				return out, e
			}
		}
	} else {
		length, ok := info["length"].(int64)
		if !ok {
			return out, fmt.Errorf("种子文件长度缺失")
		}
		if e = add(string(name), length); e != nil {
			return out, e
		}
	}
	if total <= 0 || (total-1)/pieceLength+1 != int64(len(pieces)/20) {
		return out, fmt.Errorf("种子分片数与文件大小不一致")
	}
	hash := sha1.Sum(d.info)
	out.Hash = hex.EncodeToString(hash[:])
	q := url.Values{"xt": []string{"urn:btih:" + out.Hash}, "dn": []string{string(name)}}
	seen := map[string]bool{}
	track := func(v any) {
		if b, ok := v.([]byte); ok {
			raw := string(b)
			u, e := url.Parse(raw)
			if e == nil && u.Hostname() != "" && u.User == nil && (u.Scheme == "http" || u.Scheme == "https" || u.Scheme == "udp") && !seen[raw] && len(seen) < 20 {
				q.Add("tr", raw)
				seen[raw] = true
			}
		}
	}
	track(root["announce"])
	if lists, ok := root["announce-list"].([]any); ok {
		for _, list := range lists {
			if items, ok := list.([]any); ok {
				for _, item := range items {
					track(item)
				}
			}
		}
	}
	out.Magnet = "magnet:?" + q.Encode()
	return out, nil
}
func safeTorrentSegment(s string) bool {
	return s != "" && s != "." && s != ".." && !strings.ContainsAny(s, "/\\\x00") && len(s) <= 1024
}
