package discovery

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
)

const MappingVersion = "v1"

type Query struct {
	MediaType                                                        string
	Page, PageSize                                                   int
	Genre, Region, Year, Month, Season, Status, Sort, Search, Locale string
}

func (q Query) Normalize() Query {
	q.Search = strings.TrimSpace(q.Search)
	for _, field := range []*string{&q.Year, &q.Month} {
		if *field != "" {
			if n, e := strconv.Atoi(*field); e == nil {
				*field = strconv.Itoa(n)
			}
		}
	}
	if q.Locale == "" {
		q.Locale = "zh-CN"
	}
	return q
}
func (q Query) Key(source string) string {
	q = q.Normalize()
	b, _ := json.Marshal(map[string]any{"mediaType": q.MediaType, "page": q.Page, "pageSize": q.PageSize, "genre": q.Genre, "region": q.Region, "year": q.Year, "month": q.Month, "season": q.Season, "status": q.Status, "sort": q.Sort, "query": q.Search, "locale": q.Locale})
	sum := sha256.Sum256(b)
	return source + ":" + hex.EncodeToString(sum[:]) + ":" + strconv.Itoa(q.Page) + ":" + q.Locale + ":" + MappingVersion
}
func DetailKey(source, kind, id, locale string) string {
	b, _ := json.Marshal([]string{source, kind, id, locale, MappingVersion})
	sum := sha256.Sum256(b)
	return source + ":detail:" + hex.EncodeToString(sum[:])
}
func ValidID(id string) bool {
	n, e := strconv.Atoi(id)
	return e == nil && n > 0 && strconv.Itoa(n) == id
}
