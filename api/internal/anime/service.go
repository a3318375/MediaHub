package anime

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type cacheEntry struct {
	Body  []byte
	Until time.Time
}
type Service struct {
	mu    sync.Mutex
	cache map[string]cacheEntry
	Fetch func(context.Context, string) ([]byte, error)
}

func New() *Service { return &Service{cache: map[string]cacheEntry{}, Fetch: fetchPublic} }
func publicIP(ip net.IP) bool {
	return ip != nil && ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified()
}

// Validate resolved addresses and dial the validated IP to prevent DNS rebinding.
func fetchPublic(ctx context.Context, raw string) ([]byte, error) {
	u, e := FeedURL(raw)
	if e != nil {
		return nil, e
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return nil, fmt.Errorf("仅支持标准 HTTP/HTTPS 端口")
	}
	tr := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil {
			return nil, e
		}
		ips, e := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if e != nil {
			return nil, e
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("上游域名解析失败")
		}
		for _, ip := range ips {
			if !publicIP(ip) {
				return nil, fmt.Errorf("不允许访问内网或保留地址")
			}
		}
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}}
	trusted := u.Hostname() == "mikanani.me" || u.Hostname() == "mikanime.tv" || u.Hostname() == "api.bgm.tv"
	if trusted {
		proxyURL, proxyErr := http.ProxyFromEnvironment(&http.Request{URL: u})
		if proxyErr != nil {
			return nil, fmt.Errorf("上游代理配置无效")
		}
		if proxyURL != nil {
			tr.Proxy = http.ProxyFromEnvironment
			tr.DialContext = (&net.Dialer{Timeout: 5 * time.Second}).DialContext
		}
	}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, Timeout: 12 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if trusted && req.URL.Hostname() != u.Hostname() {
			return fmt.Errorf("来源跨域重定向被拒绝")
		}
		if len(via) > 3 {
			return fmt.Errorf("重定向次数过多")
		}
		_, e := FeedURL(req.URL.String())
		if req.URL.Port() != "" && req.URL.Port() != "80" && req.URL.Port() != "443" {
			return fmt.Errorf("重定向端口无效")
		}
		return e
	}}
	req, e := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("User-Agent", "media-center/0.1 (+https://github.com/a3318375/media-center-api)")
	res, e := client.Do(req)
	if e != nil {
		return nil, fmt.Errorf("无法连接上游，请检查地址与网络")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("上游返回 HTTP %d", res.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, 2<<20+1))
	if e != nil {
		return nil, e
	}
	if len(b) > 2<<20 {
		return nil, fmt.Errorf("上游响应超过 2 MiB")
	}
	return b, nil
}
func (s *Service) cached(ctx context.Context, raw string, ttl time.Duration, refresh bool) ([]byte, error) {
	s.mu.Lock()
	c, ok := s.cache[raw]
	s.mu.Unlock()
	if ok && !refresh && time.Now().Before(c.Until) {
		return c.Body, nil
	}
	b, e := s.Fetch(ctx, raw)
	if e != nil {
		return nil, e
	}
	s.mu.Lock()
	if len(s.cache) >= 128 {
		s.cache = map[string]cacheEntry{}
	}
	s.cache[raw] = cacheEntry{b, time.Now().Add(ttl)}
	s.mu.Unlock()
	return b, nil
}
func (s *Service) RSS(ctx context.Context, raw string) ([]Entry, error) {
	b, e := s.Fetch(ctx, raw)
	if e != nil {
		return nil, e
	}
	var feed struct {
		XMLName xml.Name
		Channel struct {
			Items []struct {
				Title       string `xml:"title"`
				Link        string `xml:"link"`
				Date        string `xml:"pubDate"`
				GUID        string `xml:"guid"`
				MagnetURI   string `xml:"magnetURI"`
				MagnetLower string `xml:"magneturi"`
				InfoHash    string `xml:"infoHash"`
				SubjectID   string `xml:"https://animes.garden/ns/rss/1.0 subjectId"`
				Torrent     struct {
					MagnetURI string `xml:"magnetURI"`
				} `xml:"torrent"`
				Enclosure struct {
					URL    string `xml:"url,attr"`
					Type   string `xml:"type,attr"`
					Length string `xml:"length,attr"`
				} `xml:"enclosure"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if e = xml.Unmarshal(b, &feed); e != nil || feed.XMLName.Local != "rss" {
		return nil, fmt.Errorf("需要有效 RSS 2.0 XML")
	}
	out := []Entry{}
	for _, it := range feed.Channel.Items {
		if len(out) >= 1000 {
			return nil, fmt.Errorf("RSS 超过 1000 条，请缩小订阅范围")
		}
		link := it.Enclosure.URL
		if link == "" {
			link = it.Link
		}
		for _, magnet := range []string{it.MagnetURI, it.MagnetLower, it.Torrent.MagnetURI} {
			if magnet != "" {
				link = magnet
				break
			}
		}
		if it.InfoHash != "" {
			link = "magnet:?xt=urn:btih:" + strings.TrimSpace(it.InfoHash)
		}
		entry := Entry{Title: it.Title, URL: link, DetailURL: it.Link, GUID: it.GUID, PublishedAt: it.Date, BangumiID: strings.TrimSpace(it.SubjectID)}
		if entry.BangumiID != "" && !ValidID(entry.BangumiID) {
			return nil, fmt.Errorf("RSS 作品 ID 无效")
		}
		if length, err := strconv.ParseInt(it.Enclosure.Length, 10, 64); err == nil && length > 0 {
			entry.ContentLength = length
		}
		DescribeResource(&entry, strings.EqualFold(it.Enclosure.Type, "application/x-bittorrent") && link == it.Enclosure.URL)
		out = append(out, entry)
	}
	return out, nil
}
func (s *Service) Preview(ctx context.Context, d Draft) (Preview, error) {
	if e := Validate(&d); e != nil {
		return Preview{}, e
	}
	out := Preview{Items: []Entry{}, Warnings: []string{"仅预览 RSS 识别与规则结果，尚未提交下载任务。"}}
	seen := map[float64]bool{}
	for _, f := range append([]Feed{{Label: d.Subgroup, URL: d.URL, Offset: d.Offset}}, d.Standby...) {
		items, e := s.RSS(ctx, f.URL)
		if e != nil {
			return Preview{}, e
		}
		for i := range items {
			items[i].Feed = f.Label
		}
		items = Apply(d, items, f.Offset, seen)
		for _, it := range items {
			if it.Accepted {
				out.Accepted++
			}
		}
		out.Items = append(out.Items, items...)
	}
	return out, nil
}
func (s *Service) Resolve(ctx context.Context, d Draft) (Draft, error) {
	if _, e := FeedURL(d.URL); e != nil {
		return d, e
	}
	u, _ := url.Parse(d.URL)
	if d.Source == "ani-bt" {
		d.BangumiID = u.Query().Get("bgmId")
		d.Subgroup = u.Query().Get("groupSlug")
	}
	if d.Source == "anime-garden" {
		d.BangumiID = u.Query().Get("subject")
		d.Subgroup = u.Query().Get("fansub")
	}
	if e := ValidateSourceURL(d); e != nil {
		return d, e
	}
	if d.Source == "mikan" {
		if u.Hostname() != "mikanani.me" && u.Hostname() != "mikanime.tv" {
			return d, fmt.Errorf("Mikan RSS 域名无效")
		}
		d.MikanID = u.Query().Get("bangumiId")
		if !ValidID(d.MikanID) {
			return d, fmt.Errorf("请使用单番剧的 Mikan RSS")
		}
		groups, e := s.Groups(ctx, d.MikanID, false)
		if e != nil {
			return d, e
		}
		for _, g := range groups {
			gu, _ := url.Parse(g.URL)
			if gu.Query().Get("subgroupid") == u.Query().Get("subgroupid") {
				d.BangumiID = g.BangumiID
				d.Subgroup = g.Label
				break
			}
		}
	}
	if !ValidID(d.BangumiID) {
		return d, fmt.Errorf("请填写有效的 Bangumi ID")
	}
	var e error
	d, e = s.Metadata(ctx, d, false)
	if e != nil {
		return d, e
	}
	if d.Season == 0 {
		d.Season = 1
	}
	if d.Match == nil {
		d.Match = []string{}
	}
	if d.Exclude == nil {
		d.Exclude = []string{`720[Pp]`, `合集`, `特别篇`}
	}
	if d.Standby == nil {
		d.Standby = []Feed{}
	}
	if d.Source == "" {
		d.Source = "other"
	}
	if _, e = s.RSS(ctx, d.URL); e != nil {
		return d, e
	}
	return d, Validate(&d)
}

type CatalogItem struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Poster string `json:"poster"`
	Week   string `json:"week"`
}
type Catalog struct {
	Items   []CatalogItem `json:"items"`
	Seasons []string      `json:"seasons"`
}
type Group struct {
	GroupRegex GroupRegex `json:"groupRegex"`
	Label      string     `json:"label"`
	URL        string     `json:"url"`
	BangumiID  string     `json:"bangumiId"`
	Items      []Entry    `json:"items"`
}

func absolute(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	base, _ := url.Parse("https://mikanani.me")
	u, e := url.Parse(raw)
	if e != nil {
		return ""
	}
	v := base.ResolveReference(u)
	if v.Scheme != "https" && v.Scheme != "http" {
		return ""
	}
	return v.String()
}
func (s *Service) Catalog(ctx context.Context, q, year, season string, refresh bool) (Catalog, error) {
	if len([]rune(q)) > 100 {
		return Catalog{}, fmt.Errorf("搜索词过长")
	}
	raw := "https://mikanani.me"
	if q != "" {
		raw += "/Home/Search?searchstr=" + url.QueryEscape(q)
	} else if year != "" {
		y, e := strconv.Atoi(year)
		if e != nil || y < 2000 || y > 2100 || !strings.Contains("春夏秋冬", season) || len([]rune(season)) != 1 {
			return Catalog{}, fmt.Errorf("季度无效")
		}
		raw += "/Home/BangumiCoverFlowByDayOfWeek?year=" + year + "&seasonStr=" + url.QueryEscape(season)
	}
	b, e := s.cached(ctx, raw, 10*time.Minute, refresh)
	if e != nil {
		return Catalog{}, e
	}
	doc, e := goquery.NewDocumentFromReader(strings.NewReader(string(b)))
	if e != nil {
		return Catalog{}, e
	}
	out := Catalog{Items: []CatalogItem{}, Seasons: []string{}}
	doc.Find("a[data-year][data-season]").Each(func(_ int, a *goquery.Selection) {
		y, _ := a.Attr("data-year")
		v, _ := a.Attr("data-season")
		out.Seasons = append(out.Seasons, y+" "+v)
	})
	seen := map[string]bool{}
	doc.Find(".sk-bangumi, .an-ul").Each(func(_ int, section *goquery.Selection) {
		week := strings.TrimSpace(section.Children().First().Text())
		if section.HasClass("an-ul") {
			week = "搜索"
		}
		section.Find("li").Each(func(_ int, li *goquery.Selection) {
			a := li.Find("a[href*='/Home/Bangumi/']").First()
			href, _ := a.Attr("href")
			id := strings.TrimSuffix(strings.TrimPrefix(href, "/Home/Bangumi/"), "/")
			if !ValidID(id) || seen[id] {
				return
			}
			seen[id] = true
			poster, _ := li.Find("[data-src]").First().Attr("data-src")
			out.Items = append(out.Items, CatalogItem{id, strings.TrimSpace(a.Text()), absolute(poster), week})
		})
	})
	if doc.Find(".sk-bangumi,.an-ul").Length() == 0 {
		return out, fmt.Errorf("Mikan 页面结构变化或访问被拦截")
	}
	return out, nil
}
func (s *Service) Groups(ctx context.Context, id string, refresh bool) ([]Group, error) {
	if !ValidID(id) {
		return nil, fmt.Errorf("Mikan ID 无效")
	}
	b, e := s.cached(ctx, "https://mikanani.me/Home/Bangumi/"+id, 2*time.Minute, refresh)
	if e != nil {
		return nil, e
	}
	doc, e := goquery.NewDocumentFromReader(strings.NewReader(string(b)))
	if e != nil {
		return nil, e
	}
	bgm := ""
	doc.Find("a[href*='/subject/']").Each(func(_ int, a *goquery.Selection) {
		h, _ := a.Attr("href")
		u, e := url.Parse(h)
		if e == nil && (u.Hostname() == "bgm.tv" || u.Hostname() == "bangumi.tv" || u.Hostname() == "chii.in") {
			v := strings.TrimPrefix(u.Path, "/subject/")
			if ValidID(v) {
				bgm = v
			}
		}
	})
	out := []Group{}
	doc.Find(".leftbar-item").Each(func(_ int, a *goquery.Selection) {
		label := strings.TrimSpace(a.Find("a.subgroup-name").Text())
		anchor, _ := a.Find("a.subgroup-name").Attr("data-anchor")
		if !strings.HasPrefix(anchor, "#") {
			return
		}
		section := doc.Find("[id]").FilterFunction(func(_ int, s *goquery.Selection) bool { id, _ := s.Attr("id"); return "#"+id == anchor }).First()
		rss, _ := section.Find(".mikan-rss").Attr("href")
		if rss == "" {
			return
		}
		items := []Entry{}
		titles := []string{}
		section.Next().Find("tbody tr").Each(func(_ int, row *goquery.Selection) {
			title := strings.TrimSpace(row.Find("a").First().Text())
			if title != "" {
				titles = append(titles, title)
			}
			magnet, _ := row.Find("[data-clipboard-text]").Attr("data-clipboard-text")
			torrent, _ := row.Find("a[href*='.torrent']").Attr("href")
			link := absolute(torrent)
			if strings.HasPrefix(magnet, "magnet:") {
				link = magnet
			}
			if title != "" && len(items) < 20 {
				items = append(items, Entry{Title: title, URL: link, PublishedAt: strings.TrimSpace(row.Find("td").Eq(3).Text())})
			}
		})
		out = append(out, Group{Label: label, URL: absolute(rss), BangumiID: bgm, Items: items, GroupRegex: BuildGroupRegex(titles)})
	})
	if len(out) == 0 {
		return nil, fmt.Errorf("未找到字幕组 RSS，页面结构可能变化")
	}
	return out, nil
}

func (s *Service) Metadata(ctx context.Context, d Draft, refresh bool) (Draft, error) {
	if !ValidID(d.BangumiID) {
		return d, fmt.Errorf("Bangumi ID 无效")
	}
	b, e := s.cached(ctx, "https://api.bgm.tv/v0/subjects/"+d.BangumiID, 30*time.Minute, refresh)
	if e != nil {
		return d, e
	}
	var bg struct {
		Type    int
		Name    string
		NameCN  string `json:"name_cn"`
		Summary string
		Date    string
		Eps     int
		Images  struct{ Large string }
		Rating  struct{ Score float64 }
	}
	if e = json.Unmarshal(b, &bg); e != nil || bg.Type != 2 {
		return d, fmt.Errorf("Bangumi 作品不是有效动画")
	}
	d.Title = bg.NameCN
	if d.Title == "" {
		d.Title = bg.Name
	}
	d.OriginalTitle = bg.Name
	d.Description = bg.Summary
	d.Poster = bg.Images.Large
	d.ReleaseDate = bg.Date
	FillWeek(&d)
	d.TotalEpisodes = bg.Eps
	d.Rating = strconv.FormatFloat(bg.Rating.Score, 'f', 1, 64)

	return d, nil
}
