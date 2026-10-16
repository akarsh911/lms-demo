package timetable_test

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
)

func everything() timetable.ExportVisibility {
	return timetable.ExportVisibility{Subject: true, Teacher: true, Room: true}
}

func openWorkbook(t *testing.T, export timetable.Export) *excelize.File {
	t.Helper()

	book, err := export.Workbook()
	if err != nil {
		t.Fatalf("the workbook could not be written: %v", err)
	}
	if book.Len() == 0 {
		t.Fatal("the workbook is empty, so nothing was exported")
	}

	file, err := excelize.OpenReader(bytes.NewReader(book.Bytes()))
	if err != nil {
		t.Fatalf("the bytes are not an openable xlsx workbook: %v", err)
	}
	t.Cleanup(func() { _ = file.Close() })
	return file
}

func headerColumn(t *testing.T, file *excelize.File, sheet, title string) string {
	t.Helper()

	rows, err := file.GetRows(sheet)
	if err != nil {
		t.Fatalf("sheet %q could not be read back: %v", sheet, err)
	}
	if len(rows) < 5 {
		t.Fatalf("sheet %q has %d rows, so it carries no header", sheet, len(rows))
	}

	for index, cell := range rows[4] {
		if strings.HasPrefix(cell, title) {
			name, err := excelize.ColumnNumberToName(index + 1)
			if err != nil {
				t.Fatalf("column %d has no name: %v", index+1, err)
			}
			return name
		}
	}
	t.Fatalf("sheet %q has no %q column; its header reads %v", sheet, title, rows[4])
	return ""
}

func headerNote(t *testing.T, file *excelize.File, sheet, title string) string {
	t.Helper()

	column := headerColumn(t, file, sheet, title)
	value, err := file.GetCellValue(sheet, column+"5")
	if err != nil {
		t.Fatalf("the header of %s on %q could not be read: %v", column, sheet, err)
	}
	return value
}

func cellForPeriod(t *testing.T, file *excelize.File, sheet, period, column string) string {
	t.Helper()

	rows, err := file.GetRows(sheet)
	if err != nil {
		t.Fatalf("sheet %q could not be read back: %v", sheet, err)
	}
	index, err := excelize.ColumnNameToNumber(column)
	if err != nil {
		t.Fatalf("column %q has no number: %v", column, err)
	}

	for at := 5; at < len(rows); at++ {
		if len(rows[at]) == 0 || !strings.Contains(rows[at][0], period) {
			continue
		}
		if index-1 >= len(rows[at]) {
			return ""
		}
		return rows[at][index-1]
	}
	t.Fatalf("sheet %q has no row for period %q", sheet, period)
	return ""
}

func sheetNamed(t *testing.T, file *excelize.File, want string) string {
	t.Helper()

	for _, name := range file.GetSheetList() {
		if name == want {
			return name
		}
	}
	t.Fatalf("no sheet named %q; the workbook holds %v", want, file.GetSheetList())
	return ""
}

func TestPatternExportWritesOneOpenableSheetPerClass(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheets := file.GetSheetList()
	if len(sheets) != 3 {
		t.Fatalf("want one sheet for each of the three classes, got %v", sheets)
	}
	if !strings.HasPrefix(sheets[0], "XI A") {
		t.Fatalf("sheets must run in grade order, got %v", sheets)
	}

	sheet := sheets[0]
	monday := headerColumn(t, file, sheet, "Monday")
	saturday := headerColumn(t, file, sheet, "Saturday")

	got := cellForPeriod(t, file, sheet, "Period 1", monday)
	for _, want := range []string{"Physics", "t1-", "Room A"} {
		if !strings.Contains(got, want) {
			t.Errorf("Monday period 1 reads %q, which does not name %q", got, want)
		}
	}

	if got := cellForPeriod(t, file, sheet, "Period 3", monday); !strings.Contains(got, "Commerce") {
		t.Errorf("Monday period 3 reads %q, want the Commerce lesson", got)
	}
	if got := cellForPeriod(t, file, sheet, "Period 3", saturday); got != "" {
		t.Errorf("Saturday period 3 reads %q, but no slot is published there", got)
	}
}

func TestPatternExportLabelsANonTeachingPeriodRatherThanLeavingItBlank(t *testing.T) {
	f := newFixture(t)

	assembly := f.db.Period.Create().
		SetPeriodSchemeID(f.SchemeID).
		SetName("Assembly").
		SetCode("ASM-" + uuid.NewString()[:8]).
		SetSequence(0).
		SetKind(entperiod.KindAssembly).
		SaveX(f.ctx).ID
	f.db.BellSchedulePeriod.Create().
		SetBellScheduleID(f.BellRegular).
		SetPeriodID(assembly).
		SetStartMinute(525).
		SetEndMinute(545).
		SaveX(f.ctx)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := file.GetSheetList()[0]
	monday := headerColumn(t, file, sheet, "Monday")

	if got := cellForPeriod(t, file, sheet, "Assembly", monday); got != "Assembly" {
		t.Fatalf("the assembly period reads %q, but a blank cell would read as a free period", got)
	}
}

func TestPatternExportCarriesTheBellTimes(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := file.GetSheetList()[0]

	if got := cellForPeriod(t, file, sheet, "Period 1", "B"); got != "09:05–09:45" {
		t.Fatalf("period 1 shows the time %q, want the default bell's 09:05-09:45", got)
	}
}

func TestRangeExportShowsTheSubstituteDaysLessonsOnASubstitutedDay(t *testing.T) {
	f := newFixture(t)
	f.substituteDay(f.Sat, 1)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportRange,
		From:     f.Mon,
		To:       f.Sat,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the range export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := sheetNamed(t, file, "XI A")
	saturday := headerColumn(t, file, sheet, "Sat 11 Apr")

	if note := headerNote(t, file, sheet, "Sat 11 Apr"); !strings.Contains(note, "runs as Monday") {
		t.Fatalf("the Saturday header reads %q and never says the day was substituted", note)
	}

	got := cellForPeriod(t, file, sheet, "Period 3", saturday)
	if !strings.Contains(got, "Commerce") {
		t.Fatalf("Saturday period 3 reads %q; only Monday publishes a period 3, so a substituted "+
			"Saturday must carry it", got)
	}

	if got := cellForPeriod(t, file, sheet, "Period 2", saturday); !strings.Contains(got, "History") {
		t.Errorf("Saturday period 2 reads %q, want Monday's History lesson", got)
	}
}

func TestRangeExportMarksAClosedDayRatherThanLeavingItBlank(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportRange,
		From:     f.Mon,
		To:       f.Sat,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the range export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := sheetNamed(t, file, "XI A")
	wednesday := headerColumn(t, file, sheet, "Wed 08 Apr")

	if note := headerNote(t, file, sheet, "Wed 08 Apr"); !strings.Contains(note, "Founder Day") {
		t.Fatalf("the Wednesday header reads %q and never names the holiday", note)
	}
	if got := cellForPeriod(t, file, sheet, "Period 1", wednesday); !strings.Contains(got, "Holiday") {
		t.Fatalf("Wednesday period 1 reads %q, but the school is shut that day", got)
	}
}

func TestSheetNameCollisionDoesNotLoseAClass(t *testing.T) {
	f := newFixture(t)

	tag := uuid.NewString()[:8]
	grade := f.db.GradeLevel.Create().
		SetName("XI").SetCode("XIC-" + tag).SetSequence(11).SaveX(f.ctx).ID

	subject := f.db.Subject.Create().
		SetName("Physics " + tag).SetCode("PHC-" + tag).SaveX(f.ctx).ID

	codes := make([]string, 0, 2)
	for index, name := range []string{"A/1", "A:1"} {
		code := "XIC-" + string(rune('P'+index)) + "-" + tag
		section := f.db.Section.Create().
			SetAcademicSessionID(f.SessionID).
			SetBranchID(f.BranchID).
			SetGradeLevelID(grade).
			SetName(name).
			SetCode(code).
			SaveX(f.ctx).ID
		offering := f.db.SubjectOffering.Create().
			SetAcademicSessionID(f.SessionID).
			SetSectionID(section).
			SetSubjectID(subject).
			SaveX(f.ctx).ID
		f.db.TimetableSlot.Create().
			SetTimetableID(f.TimetableID).
			SetSectionID(section).
			SetPeriodID(f.P1).
			SetDayOfWeek(1).
			SetSubjectOfferingID(offering).
			SetTeacherID(f.Teacher["t1"]).
			SaveX(f.ctx)
		codes = append(codes, code)
	}

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	colliding := make([]string, 0, 2)
	for _, name := range file.GetSheetList() {
		if strings.HasPrefix(name, "XI A 1") {
			colliding = append(colliding, name)
		}
	}
	if len(colliding) != 2 {
		t.Fatalf("two classes sanitise to the same sheet name; the workbook kept %v out of %v",
			colliding, file.GetSheetList())
	}

	carried := map[string]bool{}
	for _, name := range colliding {
		caption, err := file.GetCellValue(name, "A2")
		if err != nil {
			t.Fatalf("the caption of sheet %q could not be read: %v", name, err)
		}
		for _, code := range codes {
			if strings.Contains(caption, code) {
				carried[code] = true
			}
		}
	}
	if len(carried) != 2 {
		t.Fatalf("the two sheets name %d of the two class codes %v, so one class was overwritten",
			len(carried), codes)
	}
}

func TestExportNarrowsToTheNamedClassesOnly(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID:   f.BranchID,
		Mode:       timetable.ExportPattern,
		On:         f.Mon,
		SectionIDs: []uuid.UUID{f.SectionXIIB},
		Show:       everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	if sheets := file.GetSheetList(); len(sheets) != 1 || sheets[0] != "XII B" {
		t.Fatalf("asking for one class produced %v", sheets)
	}
}

func TestExportWithNothingToShowRefusesRatherThanWritingAnEmptyWorkbook(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID:   f.BranchID,
		Mode:       timetable.ExportPattern,
		On:         f.Mon,
		SectionIDs: []uuid.UUID{uuid.New()},
		Show:       everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}
	if len(export.Sheets) != 0 {
		t.Fatalf("an unknown class produced %d sheets", len(export.Sheets))
	}

	if _, err := export.Workbook(); !errors.Is(err, timetable.ErrExportEmpty) {
		t.Fatalf("writing an empty workbook returned %v, want ErrExportEmpty", err)
	}
}

func TestExportHidesWhatTheFieldPolicyWithholds(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     timetable.ExportVisibility{Subject: true},
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := sheetNamed(t, file, "XI A")
	monday := headerColumn(t, file, sheet, "Monday")

	got := cellForPeriod(t, file, sheet, "Period 1", monday)
	if !strings.Contains(got, "Physics") {
		t.Fatalf("Monday period 1 reads %q and lost the subject it was allowed to show", got)
	}
	if strings.Contains(got, "t1-") || strings.Contains(got, "Room A") {
		t.Fatalf("Monday period 1 reads %q, naming a teacher or room the policy withholds", got)
	}
}

func TestExportRefusesAnUnknownMode(t *testing.T) {
	f := newFixture(t)

	_, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportMode("fortnight"),
		On:       f.Mon,
	})
	if !errors.Is(err, timetable.ErrExportModeUnknown) {
		t.Fatalf("an unknown mode returned %v, want ErrExportModeUnknown", err)
	}
}

func TestExportRefusesHalfAScope(t *testing.T) {
	f := newFixture(t)

	_, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportRange,
		From:     f.Mon,
		To:       f.Sat,
		Slots:    []predicate.TimetableSlot{entslot.SectionID(f.SectionXIA)},
	})
	if !errors.Is(err, timetable.ErrScopeIncomplete) {
		t.Fatalf("narrowing slots without deviations returned %v, want ErrScopeIncomplete", err)
	}
}

func TestTwoSubjectsInOnePeriodBothReachTheCell(t *testing.T) {
	f := newFixture(t)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	sheet := sheetNamed(t, file, "XI A")
	monday := headerColumn(t, file, sheet, "Monday")

	got := cellForPeriod(t, file, sheet, "Period 4", monday)
	for _, want := range []string{"Physics", "History", "t5-", "t6-", "Room A", "Room B"} {
		if !strings.Contains(got, want) {
			t.Fatalf("Monday period 4 carries two slots but reads %q, missing %q", got, want)
		}
	}
	if strings.Count(got, "—") != 1 {
		t.Fatalf("Monday period 4 reads %q; the two lessons must be divided so a reader can tell "+
			"which teacher belongs to which subject", got)
	}
}

func TestASectionUnderTwoTimetablesGetsASheetForEach(t *testing.T) {
	f := newFixture(t)

	tag := uuid.NewString()[:8]
	scheme := f.db.PeriodScheme.Create().
		SetAcademicSessionID(f.SessionID).
		SetBranchID(f.BranchID).
		SetName("Twilight " + tag).
		SetCode("TWI-" + tag).
		SaveX(f.ctx).ID
	period := f.db.Period.Create().
		SetPeriodSchemeID(scheme).
		SetName("Twilight 1").
		SetCode("TW1-" + tag).
		SetSequence(1).
		SaveX(f.ctx).ID
	second := f.db.Timetable.Create().
		SetAcademicSessionID(f.SessionID).
		SetPeriodSchemeID(scheme).
		SetName("Twilight Timetable " + tag).
		SetEffectiveFrom(date(2026, time.April, 1)).
		SetStatus(enttimetable.StatusDraft).
		SaveX(f.ctx).ID
	f.db.TimetableSlot.Create().
		SetTimetableID(second).
		SetSectionID(f.SectionXIA).
		SetPeriodID(period).
		SetDayOfWeek(1).
		SetSubjectOfferingID(f.OffPhysics).
		SetTeacherID(f.Teacher["t1"]).
		SaveX(f.ctx)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportPattern,
		On:       f.Mon,
		Statuses: []enttimetable.Status{enttimetable.StatusDraft, enttimetable.StatusPublished},
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the pattern export failed: %v", err)
	}

	file := openWorkbook(t, export)
	forXIA := make([]string, 0, 2)
	for _, name := range file.GetSheetList() {
		if strings.HasPrefix(name, "XI A") {
			forXIA = append(forXIA, name)
		}
	}
	if len(forXIA) != 2 {
		t.Fatalf("XI A sits under two timetables on two period schemes, so it needs a grid for "+
			"each; the workbook holds %v out of %v", forXIA, file.GetSheetList())
	}

	captions := map[string]bool{}
	for _, name := range forXIA {
		caption, err := file.GetCellValue(name, "A2")
		if err != nil {
			t.Fatalf("the caption of %q could not be read: %v", name, err)
		}
		captions[caption] = true
	}
	if len(captions) != 2 {
		t.Fatalf("the two XI A sheets share a caption, so a reader cannot tell which timetable "+
			"each grid belongs to: %v", captions)
	}
}

func TestRangeExportKeepsBothSchemesWhenASectionSitsUnderTwo(t *testing.T) {
	f := newFixture(t)

	tag := uuid.NewString()[:8]
	scheme := f.db.PeriodScheme.Create().
		SetAcademicSessionID(f.SessionID).
		SetBranchID(f.BranchID).
		SetName("Twilight " + tag).
		SetCode("TWI-" + tag).
		SaveX(f.ctx).ID
	period := f.db.Period.Create().
		SetPeriodSchemeID(scheme).
		SetName("Twilight 1").
		SetCode("TW1-" + tag).
		SetSequence(1).
		SaveX(f.ctx).ID
	bell := f.db.BellSchedule.Create().
		SetPeriodSchemeID(scheme).
		SetName("Twilight bell").
		SetCode("TWB-" + tag).
		SetIsDefault(true).
		SaveX(f.ctx).ID
	f.db.BellSchedulePeriod.Create().
		SetBellScheduleID(bell).
		SetPeriodID(period).
		SetStartMinute(960).
		SetEndMinute(1000).
		SaveX(f.ctx)
	second := f.db.Timetable.Create().
		SetAcademicSessionID(f.SessionID).
		SetPeriodSchemeID(scheme).
		SetName("Twilight Timetable " + tag).
		SetEffectiveFrom(date(2026, time.April, 1)).
		SetStatus(enttimetable.StatusPublished).
		SaveX(f.ctx).ID
	f.db.TimetableSlot.Create().
		SetTimetableID(second).
		SetSectionID(f.SectionXIA).
		SetPeriodID(period).
		SetDayOfWeek(1).
		SetSubjectOfferingID(f.OffPhysics).
		SetTeacherID(f.Teacher["t1"]).
		SaveX(f.ctx)
	f.db.CalendarDaySchedule.Create().
		SetCalendarDayID(f.dayOf(f.Mon)).
		SetPeriodSchemeID(scheme).
		SetBellScheduleID(bell).
		SaveX(f.ctx)

	export, err := serviceFor(f).Export(f.ctx, timetable.ExportQuery{
		BranchID: f.BranchID,
		Mode:     timetable.ExportRange,
		From:     f.Mon,
		To:       f.Mon,
		Show:     everything(),
	})
	if err != nil {
		t.Fatalf("the range export failed: %v", err)
	}

	file := openWorkbook(t, export)
	twilight := ""
	forXIA := 0
	for _, name := range file.GetSheetList() {
		if !strings.HasPrefix(name, "XI A") {
			continue
		}
		forXIA++
		rows, err := file.GetRows(name)
		if err != nil {
			t.Fatalf("sheet %q could not be read back: %v", name, err)
		}
		for _, row := range rows {
			if len(row) > 0 && strings.Contains(row[0], "Twilight 1") {
				twilight = name
			}
		}
	}
	if forXIA != 2 {
		t.Fatalf("XI A runs two period schemes on the Monday, so it needs a grid for each; "+
			"the workbook holds %d out of %v", forXIA, file.GetSheetList())
	}
	if twilight == "" {
		t.Fatal("no XI A sheet carries the twilight scheme's period, so its lessons were dropped")
	}

	monday := headerColumn(t, file, twilight, "Mon 06 Apr")
	if got := cellForPeriod(t, file, twilight, "Twilight 1", monday); !strings.Contains(got, "Physics") {
		t.Fatalf("the twilight period reads %q, want the Physics lesson published against it", got)
	}
}
