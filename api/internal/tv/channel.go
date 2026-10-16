package tv

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"mediahub/internal/download"
)

// ChannelReader reads only public Telegram previews. Private/invite channels
// need an authorized account client and are never silently routed to PanSou.
type ChannelReader struct {
	HTTP     *http.Client
	BaseURL  string
	MaxPages int
}

func NewChannelReader() *ChannelReader {
	return &ChannelReader{BaseURL: "https://t.me", MaxPages: 5, HTTP: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (r *ChannelReader) Search(ctx context.Context, d Draft) ([]Candidate, error) {
	if SourceOf(d) != "tg" {
		return nil, fmt.Errorf("直接频道检索仅用于 TG 订阅")
	}
	if err := Validate(&d); err != nil {
		return nil, err
	}
	out := []Candidate{}
	seen := map[string]bool{}
	for _, channel := range d.Channels {
		before := ""
		for page := 0; page < min(max(r.MaxPages, 1), 10); page++ {
			q := url.Values{"q": {d.Title}}
			if before != "" {
				q.Set("before", before)
			}
			request, err := http.NewRequestWithContext(ctx, "GET", r.BaseURL+"/s/"+channel+"?"+q.Encode(), nil)
			if err != nil {
				return nil, err
			}
			request.Header.Set("User-Agent", "MediaHub/1.0 public-channel-reader")
			resp, err := r.HTTP.Do(request)
			if err != nil {
				return nil, fmt.Errorf("TG 频道 %s 连接失败，请检查代理或网络", channel)
			}
			if resp.StatusCode != 200 {
				resp.Body.Close()
				return nil, fmt.Errorf("TG 频道 %s 返回 HTTP %d", channel, resp.StatusCode)
			}
			body, err := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
			resp.Body.Close()
			if err != nil {
				return nil, err
			}
			if len(body) > 2<<20 {
				return nil, fmt.Errorf("TG 消息页面过大")
			}
			items, next, err := parseChannelPage(string(body), channel)
			if err != nil {
				return nil, err
			}
			for _, item := range items {
				key := item.URL + "\n" + item.Title
				if !seen[key] {
					seen[key] = true
					out = append(out, item)
				}
			}
			if next == "" || next == before {
				break
			}
			before = next
		}
	}
	return out, nil
}

var channelURLs = regexp.MustCompile(`(?:https?://|magnet:\?)[^\s<>"，。]+`)
var sizeLine = regexp.MustCompile(`(?:大小|体积)\s*[：:]\s*([^\n]+)`)

func parseChannelPage(body, channel string) ([]Candidate, string, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		return nil, "", err
	}
	if doc.Find(".tgme_channel_info").Length() == 0 && doc.Find(".tgme_widget_message").Length() == 0 {
		return nil, "", fmt.Errorf("TG 频道 %s 未提供公开消息预览", channel)
	}
	out := []Candidate{}
	doc.Find(".tgme_widget_message").Each(func(_ int, message *goquery.Selection) {
		textNode := message.Find(".tgme_widget_message_text").Clone()
		textNode.Find("br").ReplaceWithHtml("\n")
		text := strings.TrimSpace(textNode.Text())
		if text == "" {
			return
		}
		// This reader intentionally skips multi-work posts until they can be split
		// reliably; a link must not inherit another work's episode or size.
		if strings.Count(text, "名称：")+strings.Count(text, "名称:") > 1 {
			return
		}
		title := strings.TrimSpace(strings.Split(text, "\n")[0])
		title = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(title, "名称："), "名称:"))
		if m := sizeLine.FindStringSubmatch(text); len(m) > 1 {
			title += " " + m[1]
		}
		links := channelURLs.FindAllString(text, -1)
		message.Find(".tgme_widget_message_text a[href]").Each(func(_ int, a *goquery.Selection) {
			if href, ok := a.Attr("href"); ok {
				links = append(links, href)
			}
		})
		for _, raw := range links {
			link, e := download.NormalizeLink(strings.TrimRight(raw, ")）]】,，。；;"), "")
			if e != nil {
				continue
			}
			out = append(out, Candidate{Title: title, URL: link.URL, Password: link.ReceiveCode, Channel: channel, Size: ParseSize(title)})
		}
	})
	next := ""
	doc.Find("a.tme_messages_more[href]").Each(func(_ int, a *goquery.Selection) {
		href, _ := a.Attr("href")
		u, e := url.Parse(href)
		if e != nil {
			return
		}
		n := u.Query().Get("before")
		if value, e := strconv.Atoi(n); e == nil && value > 0 {
			next = n
		}
	})
	return out, next, nil
}
