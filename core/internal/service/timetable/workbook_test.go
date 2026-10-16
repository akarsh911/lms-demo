package timetable

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSanitiseSheetNameStripsWhatExcelRefuses(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"XI A", "XI A"},
		{"XI A/1", "XI A 1"},
		{"XI A\\1", "XI A 1"},
		{"Commerce [Sec]: A*?", "Commerce Sec A"},
		{"   ", "Sheet"},
		{"", "Sheet"},
		{"'Quoted'", "Quoted"},
		{"History", "History class"},
		{"history", "History class"},
	}

	for _, tc := range cases {
		got := SanitiseSheetName(tc.raw)
		if got != tc.want {
			t.Errorf("SanitiseSheetName(%q) = %q, want %q", tc.raw, got, tc.want)
		}
		if strings.ContainsAny(got, `[]:*?/\`) {
			t.Errorf("SanitiseSheetName(%q) = %q, which Excel will not open", tc.raw, got)
		}
	}
}

func TestSanitiseSheetNameStaysInsideExcelsLimit(t *testing.T) {
	long := "Standard Eleven Science Stream Section A"
	got := SanitiseSheetName(long)

	if n := utf8.RuneCountInString(got); n > SheetNameRunes {
		t.Fatalf("SanitiseSheetName(%q) is %d runes, which Excel refuses above %d",
			long, n, SheetNameRunes)
	}
	if !strings.HasPrefix(long, got) {
		t.Fatalf("SanitiseSheetName(%q) = %q, which no longer starts the class name", long, got)
	}
}

func TestCollidingSheetNamesEachKeepTheirOwnSheet(t *testing.T) {
	namer := newSheetNamer()

	first := namer.name("XI A/1")
	second := namer.name("XI A:1")
	third := namer.name("XI A*1")

	if first != "XI A 1" {
		t.Fatalf("first sheet = %q, want %q", first, "XI A 1")
	}
	if second == first || third == first || second == third {
		t.Fatalf("three classes collapsed onto fewer names: %q, %q, %q", first, second, third)
	}
	if second != "XI A 1 (2)" || third != "XI A 1 (3)" {
		t.Fatalf("de-collided names = %q and %q, want %q and %q",
			second, third, "XI A 1 (2)", "XI A 1 (3)")
	}
}

func TestDeCollidedSheetNameStillFitsExcelsLimit(t *testing.T) {
	namer := newSheetNamer()
	long := "Standard Eleven Science Stream Section A"

	seen := map[string]bool{}
	for attempt := 0; attempt < 12; attempt++ {
		got := namer.name(long)
		if n := utf8.RuneCountInString(got); n > SheetNameRunes {
			t.Fatalf("de-collided name %q is %d runes, above Excel's %d", got, n, SheetNameRunes)
		}
		if seen[got] {
			t.Fatalf("name %q was handed out twice, so one class overwrites another", got)
		}
		seen[got] = true
	}
}

func TestClockRendersMinutesSinceMidnight(t *testing.T) {
	cases := []struct {
		minute int
		want   string
	}{
		{0, "00:00"},
		{545, "09:05"},
		{625, "10:25"},
		{1439, "23:59"},
	}
	for _, tc := range cases {
		if got := Clock(tc.minute); got != tc.want {
			t.Errorf("Clock(%d) = %q, want %q", tc.minute, got, tc.want)
		}
	}
	if got := ClockSpan(545, 585); got != "09:05–09:45" {
		t.Errorf("ClockSpan(545, 585) = %q", got)
	}
	if got := ClockSpan(0, 0); got != "" {
		t.Errorf("an unresolved span must render as nothing, got %q", got)
	}
}
