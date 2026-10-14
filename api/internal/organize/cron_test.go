package organize

import (
	"testing"
	"time"
)

func TestCronFiveFieldsAndBeijingSlots(t *testing.T) {
	r := Rule{Enabled: true, Cron: "*/30 * * * *"}
	first := time.Date(2026, 10, 14, 0, 30, 12, 0, time.UTC)
	slot := DueSlot(r, first)
	if slot == "" || slot != DueSlot(r, first.Add(20*time.Second)) || DueSlot(r, first.Add(time.Minute)) != "" || slot == DueSlot(r, first.Add(30*time.Minute)) {
		t.Fatal("multiple daily slots or minute dedup")
	}
	r.Cron = "0 9 * * 1-5"
	if DueSlot(r, time.Date(2026, 10, 14, 1, 0, 0, 0, time.UTC)) == "" || DueSlot(r, time.Date(2026, 10, 14, 9, 0, 0, 0, time.UTC)) != "" {
		t.Fatal("Beijing timezone")
	}
	r.Enabled = false
	if DueSlot(r, first) != "" {
		t.Fatal("disabled schedule")
	}
}
func TestCronValidationAndLegacyConversion(t *testing.T) {
	for _, text := range []string{"", "60 3 * * *", "0 25 * * *", "0 0 0 * * *", "@every 1h", "TZ=UTC 0 3 * * *", "0 0 31 2 *"} {
		if _, e := ParseCron(text); e == nil {
			t.Fatalf("accepted %q", text)
		}
	}
	for _, text := range []string{"0 3 * * *", "*/30 * * * *", "0 8,20 * * 1-5"} {
		if _, e := ParseCron(text); e != nil {
			t.Fatal(text, e)
		}
	}
	if CronExpression(Rule{DailyAt: "04:35"}) != "35 4 * * *" {
		t.Fatal("legacy time conversion")
	}
}
