package anime

import "time"

// Explicit source weekday wins. Premiere date is a fallback for legacy drafts.
func FillWeek(d *Draft) bool {
	if d.Week != 0 {
		return false
	}
	date, e := time.Parse("2006-01-02", d.ReleaseDate)
	if e != nil {
		return false
	}
	week := int(date.Weekday())
	if week == 0 {
		week = 7
	}
	d.Week = week
	return true
}
