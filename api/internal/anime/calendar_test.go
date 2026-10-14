package anime

import "testing"

func TestFillWeekPreservesSourceAndHandlesSunday(t *testing.T) {
	for _, tc := range []struct {
		date       string
		week, want int
	}{{"2026-01-08", 0, 4}, {"2026-10-11", 0, 7}, {"2026-10-11", 2, 2}, {"", 0, 0}, {"2026-02-30", 0, 0}} {
		d := Draft{ReleaseDate: tc.date, Week: tc.week}
		FillWeek(&d)
		if d.Week != tc.want {
			t.Fatalf("%+v got=%d", tc, d.Week)
		}
	}
}
