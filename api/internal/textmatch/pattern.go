// Package textmatch keeps subscription matching independent of its resource source.
package textmatch

import (
	"fmt"
	"regexp"
	"strings"
)

type Pattern struct {
	all     []*regexp.Regexp
	flatten bool
}

// Compile accepts Go regex and the deliberately limited generated form
// ^(?=.*A)(?=.*B).*$, translating positive conditions to independent AND checks.
// It does not introduce a backtracking engine or claim general PCRE support.
func Compile(raw string) (Pattern, error) {
	parts := []string{raw}
	body, flags := raw, ""
	if strings.HasPrefix(body, "(?i)") {
		body = body[4:]
		flags = "(?i)"
	}
	generated := strings.HasPrefix(body, "^(?=.*")
	if generated {
		rest := body[1:]
		parts = nil
		for strings.HasPrefix(rest, "(?=.*") {
			depth := 1
			escaped, inClass := false, false
			end := -1
			for i := 1; i < len(rest); i++ {
				c := rest[i]
				if escaped {
					escaped = false
					continue
				}
				if c == '\\' {
					escaped = true
					continue
				}
				if c == '[' {
					inClass = true
				}
				if c == ']' {
					inClass = false
				}
				if inClass {
					continue
				}
				if c == '(' {
					depth++
				}
				if c == ')' {
					depth--
					if depth == 0 {
						end = i
						break
					}
				}
			}
			if end < 5 {
				return Pattern{}, fmt.Errorf("正则条件括号不完整")
			}
			parts = append(parts, flags+rest[5:end])
			rest = rest[end+1:]
		}
		if rest != ".*$" {
			return Pattern{}, fmt.Errorf("仅支持 ^(?=.*条件)(?=.*条件).*$ 形式的正向前瞻组合，其他规则请使用 Go 正则")
		}
	}
	if len(parts) > 20 {
		return Pattern{}, fmt.Errorf("匹配条件最多 20 个")
	}
	p := Pattern{flatten: generated}
	for _, part := range parts {
		r, err := regexp.Compile(part)
		if err != nil {
			return Pattern{}, fmt.Errorf("正则无效（支持 Go 正则及生成的正向条件组合）: %w", err)
		}
		p.all = append(p.all, r)
	}
	return p, nil
}

func (p Pattern) MatchString(text string) bool {
	// Generated conditions target a single resource block; normalize its line
	// breaks so channel formatting does not change the AND conditions.
	if p.flatten {
		text = strings.Join(strings.Fields(text), " ")
	}
	for _, r := range p.all {
		if !r.MatchString(text) {
			return false
		}
	}
	return len(p.all) > 0
}
