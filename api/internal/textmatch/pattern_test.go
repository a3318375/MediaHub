package textmatch

import "testing"

func TestGeneratedPositiveLookaheads(t *testing.T) {
	p, err := Compile(`^(?=.*绿灯军团)(?=.*(?:4K|2160P|UHD))(?=.*2026).*$`)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"绿灯军团 2026 UHD S01E02", "2160P 2026 绿灯军团", "绿灯军团 4K 2026"} {
		if !p.MatchString(s) {
			t.Errorf("expected match: %s", s)
		}
	}
	for _, s := range []string{"绿灯军团 2026 1080P", "绿灯军团 UHD 2025", "其他作品 UHD 2026", "绿灯军团 4k 2026"} {
		if p.MatchString(s) {
			t.Errorf("false positive: %s", s)
		}
	}
	for _, s := range []string{`^(?=.*abc).+$`, `^(?=.*abc)(?!.*bad).*$`, `(?<=abc)def`} {
		if _, err := Compile(s); err == nil {
			t.Errorf("unsupported syntax accepted: %s", s)
		}
	}
}
func TestEscapedAndNestedConditions(t *testing.T) {
	p, err := Compile(`^(?=.*A\(B\))(?=.*(?:4K|UHD)).*$`)
	if err != nil || !p.MatchString("A(B) UHD") {
		t.Fatalf("nested conditions: %v", err)
	}
}

func TestGeneratedConditionsNormalizeLinesAndAllowExplicitCaseFlag(t *testing.T) {
	p, err := Compile(`(?i)^(?=.*绿灯军团)(?=.*(?:4K|2160P|UHD))(?=.*2026).*$`)
	if err != nil || !p.MatchString("绿灯军团\n2026\n2160p") {
		t.Fatalf("channel formatting fallback: %v", err)
	}
}
