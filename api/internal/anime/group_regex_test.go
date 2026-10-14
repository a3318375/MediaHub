package anime

import "testing"

func TestGroupOptionsAreDerivedAndDeduplicated(t *testing.T) {
	g := BuildGroupRegex([]string{"番剧 01 [1080p 简 HEVC]", "番剧 02 [1080p 简 HEVC]", "番剧 01 [1080p 繁 HEVC]"})
	if len(g.RegexList) != 2 {
		t.Fatalf("%+v", g)
	}
	for _, option := range g.RegexList {
		d := validDraft()
		for _, item := range option {
			d.Match = append(d.Match, item.Regex)
		}
		if e := Validate(&d); e != nil {
			t.Fatal(e)
		}
	}
	plain := BuildGroupRegex([]string{"番剧 第1集"})
	if len(plain.RegexList) != 0 || len(plain.Tags) != 0 {
		t.Fatalf("invented options: %+v", plain)
	}
}
func TestCombinedLanguageTitleStaysOneCombination(t *testing.T) {
	g := BuildGroupRegex([]string{"番剧 [1080p 简繁字幕]"})
	if len(g.RegexList) != 1 || len(g.RegexList[0]) != 3 {
		t.Fatalf("%+v", g)
	}
}
