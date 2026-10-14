// Package normalization converts upstream markup to readable display text.
package normalization

import (
	"golang.org/x/net/html"
	"io"
	"strings"
)

// PlainText decodes entities, strips tags, and preserves paragraph/line boundaries.
func PlainText(value string) string {
	z := html.NewTokenizer(strings.NewReader(value))
	var out strings.Builder
	for {
		switch z.Next() {
		case html.ErrorToken:
			if z.Err() == io.EOF {
				lines := strings.Split(out.String(), "\n")
				clean := make([]string, 0, len(lines))
				for _, line := range lines {
					if line = strings.Join(strings.Fields(line), " "); line != "" {
						clean = append(clean, line)
					}
				}
				return strings.Join(clean, "\n")
			}
			return strings.Join(strings.Fields(out.String()), " ")
		case html.TextToken:
			out.WriteString(string(z.Text()))
		case html.StartTagToken, html.SelfClosingTagToken:
			name, _ := z.TagName()
			if string(name) == "br" || string(name) == "p" {
				out.WriteByte('\n')
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			if string(name) == "p" {
				out.WriteByte('\n')
			}
		}
	}
}
