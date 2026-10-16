package timetable

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entbellperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellscheduleperiod"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

const MaxExportRangeDays = 62

type ExportMode string

const (
	ExportPattern ExportMode = "pattern"
	ExportRange   ExportMode = "range"
)

func (m ExportMode) Known() bool {
	switch m {
	case ExportPattern, ExportRange:
		return true
	}
	return false
}

var (
	ErrExportModeUnknown  = errors.New("timetable: export mode must be pattern or range")
	ErrExportRangeTooWide = fmt.Errorf(
		"timetable: an export date range may not exceed %d days", MaxExportRangeDays)
	ErrExportEmpty = errors.New(
		"timetable: no class here is both covered by a timetable and readable by this viewer")
)

type ExportVisibility struct {
	Subject bool
	Teacher bool
	Room    bool
}

type ExportQuery struct {
	BranchID   uuid.UUID
	Mode       ExportMode
	On         time.Time
	From       time.Time
	To         time.Time
	Statuses   []enttimetable.Status
	SectionIDs []uuid.UUID
	Slots      []predicate.TimetableSlot
	Deviations []predicate.TimetableDeviation
	Show       ExportVisibility
}

type ExportCell struct {
	Subject string
	Teacher string
	Room    string
	Note    string
	Also    []ExportCell
}

func (c ExportCell) Empty() bool {
	return c.Subject == "" && c.Teacher == "" && c.Room == "" && c.Note == "" && len(c.Also) == 0
}

func (c ExportCell) Lines() []string {
	out := make([]string, 0, 4+4*len(c.Also))
	for _, line := range []string{c.Subject, c.Teacher, c.Room, c.Note} {
		if line != "" {
			out = append(out, line)
		}
	}
	for _, more := range c.Also {
		out = append(out, stackDivider)
		out = append(out, more.Lines()...)
	}
	return out
}

const stackDivider = "—"

type ExportColumn struct {
	Key   string
	Title string
	Note  string
}

type ExportRow struct {
	PeriodID   uuid.UUID
	PeriodName string
	PeriodCode string
	Kind       string
	Time       string
	Cells      map[string]ExportCell
}

func (r ExportRow) Teaching() bool { return r.Kind == string(entperiod.KindTeaching) }

type ExportSheet struct {
	SectionID   uuid.UUID
	SectionName string
	SectionCode string
	GradeName   string
	Subtitle    string
	Columns     []ExportColumn
	Rows        []ExportRow
}

type Export struct {
	BranchID uuid.UUID
	Mode     ExportMode
	Title    string
	Subtitle string
	Sheets   []ExportSheet
}

func (s *Service) Export(ctx context.Context, q ExportQuery) (Export, error) {
	if err := s.ready(); err != nil {
		return Export{}, err
	}
	if q.BranchID == uuid.Nil {
		return Export{}, ErrBranchRequired
	}
	if !q.Mode.Known() {
		return Export{}, ErrExportModeUnknown
	}
	if (len(q.Slots) == 0) != (len(q.Deviations) == 0) {
		return Export{}, ErrScopeIncomplete
	}
	if q.Mode == ExportRange {
		return s.exportRange(ctx, q)
	}
	return s.exportPattern(ctx, q)
}

type exportNames struct {
	subjects map[uuid.UUID]string
	teachers map[uuid.UUID]string
	rooms    map[uuid.UUID]string
	sections map[uuid.UUID]*tenantent.Section
	grades   map[uuid.UUID]string
}

func (n exportNames) subject(id *uuid.UUID, fallback *string) string {
	if id != nil {
		if name, ok := n.subjects[*id]; ok {
			return name
		}
	}
	if fallback != nil {
		return *fallback
	}
	return ""
}

func (n exportNames) teacher(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return n.teachers[*id]
}

func (n exportNames) room(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return n.rooms[*id]
}

type sheetKey struct {
	GroupID   uuid.UUID
	SectionID uuid.UUID
}

type exportRefs struct {
	offerings []uuid.UUID
	teachers  []uuid.UUID
	rooms     []uuid.UUID
	sections  []uuid.UUID
}

func (s *Service) resolveNames(ctx context.Context, refs exportRefs, show ExportVisibility) (
	exportNames, error) {

	names := exportNames{
		subjects: map[uuid.UUID]string{},
		teachers: map[uuid.UUID]string{},
		rooms:    map[uuid.UUID]string{},
		sections: map[uuid.UUID]*tenantent.Section{},
		grades:   map[uuid.UUID]string{},
	}

	if ids := uniqueIDs(refs.offerings); show.Subject && len(ids) > 0 {
		rows, err := s.client.SubjectOffering.Query().
			Where(entoffering.IDIn(ids...)).
			WithSubject().
			All(ctx)
		if err != nil {
			return exportNames{}, err
		}
		for _, row := range rows {
			subject := row.Edges.Subject
			if subject == nil {
				continue
			}
			if subject.ShortName != nil && *subject.ShortName != "" {
				names.subjects[row.ID] = *subject.ShortName
				continue
			}
			names.subjects[row.ID] = subject.Name
		}
	}

	if ids := uniqueIDs(refs.teachers); show.Teacher && len(ids) > 0 {
		rows, err := s.client.Teacher.Query().
			Where(entteacher.IDIn(ids...)).
			WithStaff(func(sq *tenantent.StaffQuery) { sq.WithPerson() }).
			All(ctx)
		if err != nil {
			return exportNames{}, err
		}
		for _, row := range rows {
			staff := row.Edges.Staff
			if staff == nil || staff.Edges.Person == nil {
				continue
			}
			names.teachers[row.ID] = staff.Edges.Person.DisplayName
		}
	}

	if ids := uniqueIDs(refs.rooms); show.Room && len(ids) > 0 {
		rows, err := s.client.Room.Query().Where(entroom.IDIn(ids...)).All(ctx)
		if err != nil {
			return exportNames{}, err
		}
		for _, row := range rows {
			names.rooms[row.ID] = row.Name
		}
	}

	if ids := uniqueIDs(refs.sections); len(ids) > 0 {
		rows, err := s.client.Section.Query().
			Where(entsection.IDIn(ids...)).
			WithGradeLevel().
			All(ctx)
		if err != nil {
			return exportNames{}, err
		}
		for _, row := range rows {
			names.sections[row.ID] = row
			if row.Edges.GradeLevel != nil {
				names.grades[row.ID] = row.Edges.GradeLevel.Name
			}
		}
	}

	return names, nil
}

type schemeShape struct {
	periods  []*tenantent.Period
	spans    map[uuid.UUID]minuteSpan
	bellName string
}

func (s *Service) schemeShapes(ctx context.Context, schemeIDs []uuid.UUID) (
	map[uuid.UUID]*schemeShape, error) {

	shapes := map[uuid.UUID]*schemeShape{}
	ids := uniqueIDs(schemeIDs)
	if len(ids) == 0 {
		return shapes, nil
	}

	periods, err := s.client.Period.Query().
		Where(entperiod.PeriodSchemeIDIn(ids...)).
		Order(tenantent.Asc(entperiod.FieldSequence), tenantent.Asc(entperiod.FieldCode)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, period := range periods {
		shape, seen := shapes[period.PeriodSchemeID]
		if !seen {
			shape = &schemeShape{spans: map[uuid.UUID]minuteSpan{}}
			shapes[period.PeriodSchemeID] = shape
		}
		shape.periods = append(shape.periods, period)
	}

	bells, err := s.client.BellSchedule.Query().
		Where(entbell.PeriodSchemeIDIn(ids...), entbell.IsDefault(true)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	bellScheme := map[uuid.UUID]uuid.UUID{}
	bellIDs := make([]uuid.UUID, 0, len(bells))
	for _, bell := range bells {
		shape, seen := shapes[bell.PeriodSchemeID]
		if !seen {
			shape = &schemeShape{spans: map[uuid.UUID]minuteSpan{}}
			shapes[bell.PeriodSchemeID] = shape
		}
		shape.bellName = bell.Name
		bellScheme[bell.ID] = bell.PeriodSchemeID
		bellIDs = append(bellIDs, bell.ID)
	}

	if len(bellIDs) == 0 {
		return shapes, nil
	}
	spans, err := s.client.BellSchedulePeriod.Query().
		Where(entbellperiod.BellScheduleIDIn(bellIDs...)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, span := range spans {
		scheme, known := bellScheme[span.BellScheduleID]
		if !known {
			continue
		}
		shapes[scheme].spans[span.PeriodID] = minuteSpan{
			Start: span.StartMinute,
			End:   span.EndMinute,
			Runs:  span.Runs,
		}
	}
	return shapes, nil
}

func (sh *schemeShape) rowsFor(used map[uuid.UUID]bool) []ExportRow {
	if sh == nil {
		return nil
	}
	out := make([]ExportRow, 0, len(sh.periods))
	for _, period := range sh.periods {
		span, timed := sh.spans[period.ID]
		if timed && !span.Runs && !used[period.ID] {
			continue
		}
		if period.Status != entperiod.StatusActive && !used[period.ID] {
			continue
		}
		row := ExportRow{
			PeriodID:   period.ID,
			PeriodName: period.Name,
			PeriodCode: period.Code,
			Kind:       string(period.Kind),
			Cells:      map[string]ExportCell{},
		}
		if timed {
			row.Time = ClockSpan(span.Start, span.End)
		}
		out = append(out, row)
	}
	return out
}

func ClockSpan(start, end int) string {
	if start == 0 && end == 0 {
		return ""
	}
	return Clock(start) + "–" + Clock(end)
}

func Clock(minute int) string {
	minute = ((minute % minutesPerDay) + minutesPerDay) % minutesPerDay
	return fmt.Sprintf("%02d:%02d", minute/60, minute%60)
}

const minutesPerDay = 1440

var weekdayNames = [...]string{"", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
	"Saturday", "Sunday"}

func WeekdayName(dow int) string {
	if dow < 1 || dow > 7 {
		return ""
	}
	return weekdayNames[dow]
}

func periodKindLabel(kind string) string {
	switch kind {
	case string(entperiod.KindBreak):
		return "Break"
	case string(entperiod.KindAssembly):
		return "Assembly"
	case string(entperiod.KindOther):
		return "Non-teaching"
	}
	return ""
}

func fillNonTeaching(rows []ExportRow, columns []ExportColumn) {
	for _, row := range rows {
		if row.Teaching() {
			continue
		}
		label := periodKindLabel(row.Kind)
		if label == "" {
			continue
		}
		for _, column := range columns {
			if _, taken := row.Cells[column.Key]; taken {
				continue
			}
			row.Cells[column.Key] = ExportCell{Note: label}
		}
	}
}

func (s *Service) exportPattern(ctx context.Context, q ExportQuery) (Export, error) {
	on := Day(q.On)
	if q.On.IsZero() {
		on = Day(time.Now().UTC())
	}

	statuses := q.Statuses
	if len(statuses) == 0 {
		statuses = []enttimetable.Status{enttimetable.StatusPublished}
	}

	export := Export{
		BranchID: q.BranchID,
		Mode:     ExportPattern,
		Title:    "Weekly timetable",
		Subtitle: "As published and in force on " + on.Format(dateLayout),
		Sheets:   []ExportSheet{},
	}

	schemes, err := s.client.PeriodScheme.Query().
		Where(entscheme.BranchID(q.BranchID)).
		All(ctx)
	if err != nil {
		return Export{}, err
	}
	if len(schemes) == 0 {
		return export, nil
	}

	schemeIDs := make([]uuid.UUID, 0, len(schemes))
	for _, scheme := range schemes {
		schemeIDs = append(schemeIDs, scheme.ID)
	}

	versions, err := s.client.Timetable.Query().
		Where(
			enttimetable.PeriodSchemeIDIn(schemeIDs...),
			enttimetable.StatusIn(statuses...),
			enttimetable.EffectiveFromLTE(on),
			enttimetable.Or(
				enttimetable.EffectiveToIsNil(),
				enttimetable.EffectiveToGTE(on),
			),
		).
		All(ctx)
	if err != nil {
		return Export{}, err
	}

	byScheme := map[uuid.UUID][]*tenantent.Timetable{}
	for _, version := range versions {
		byScheme[version.PeriodSchemeID] = append(byScheme[version.PeriodSchemeID], version)
	}

	inForce := map[uuid.UUID]*tenantent.Timetable{}
	timetableIDs := make([]uuid.UUID, 0, len(byScheme))
	for _, list := range byScheme {
		sortTimetablesNewestFirst(list)
		chosen := pickTimetable(list, on)
		if chosen == nil {
			continue
		}
		inForce[chosen.ID] = chosen
		timetableIDs = append(timetableIDs, chosen.ID)
	}
	sort.Slice(timetableIDs, func(i, j int) bool {
		return timetableIDs[i].String() < timetableIDs[j].String()
	})
	if len(timetableIDs) == 0 {
		return export, nil
	}

	allowed := map[sheetKey]bool{}
	for _, id := range timetableIDs {
		cover, err := s.CoveredSections(ctx, id)
		if err != nil {
			return Export{}, err
		}
		for _, section := range cover {
			allowed[sheetKey{GroupID: id, SectionID: section}] = true
		}
	}

	preds := []predicate.TimetableSlot{entslot.TimetableIDIn(timetableIDs...)}
	preds = append(preds, q.Slots...)
	if wanted := uniqueIDs(q.SectionIDs); len(wanted) > 0 {
		preds = append(preds, entslot.SectionIDIn(wanted...))
	}
	slots, err := s.client.TimetableSlot.Query().Where(preds...).All(ctx)
	if err != nil {
		return Export{}, err
	}

	byCover := map[sheetKey][]*tenantent.TimetableSlot{}
	var refs exportRefs
	days := map[int]bool{}
	for _, slot := range slots {
		key := sheetKey{GroupID: slot.TimetableID, SectionID: slot.SectionID}
		if !allowed[key] {
			continue
		}
		byCover[key] = append(byCover[key], slot)
		days[slot.DayOfWeek] = true
		refs.offerings = append(refs.offerings, derefID(slot.SubjectOfferingID)...)
		refs.teachers = append(refs.teachers, derefID(slot.TeacherID)...)
		refs.rooms = append(refs.rooms, derefID(slot.RoomID)...)
	}
	if len(byCover) == 0 {
		return export, nil
	}
	covers := make([]sheetKey, 0, len(byCover))
	for key := range byCover {
		covers = append(covers, key)
		refs.sections = append(refs.sections, key.SectionID)
	}
	sort.Slice(covers, func(i, j int) bool {
		if covers[i].SectionID != covers[j].SectionID {
			return covers[i].SectionID.String() < covers[j].SectionID.String()
		}
		return covers[i].GroupID.String() < covers[j].GroupID.String()
	})

	names, err := s.resolveNames(ctx, refs, q.Show)
	if err != nil {
		return Export{}, err
	}

	columns := make([]ExportColumn, 0, 7)
	for dow := 1; dow <= 7; dow++ {
		if !days[dow] {
			continue
		}
		columns = append(columns, ExportColumn{
			Key:   fmt.Sprintf("d%d", dow),
			Title: WeekdayName(dow),
		})
	}

	shapes, err := s.schemeShapes(ctx, schemeIDs)
	if err != nil {
		return Export{}, err
	}

	for _, cover := range covers {
		list := byCover[cover]
		version := inForce[cover.GroupID]
		if version == nil {
			continue
		}
		shape := shapes[version.PeriodSchemeID]

		used := map[uuid.UUID]bool{}
		for _, slot := range list {
			used[slot.PeriodID] = true
		}
		rows := shape.rowsFor(used)
		rowAt := map[uuid.UUID]ExportRow{}
		for _, row := range rows {
			rowAt[row.PeriodID] = row
		}

		for _, slot := range list {
			row, known := rowAt[slot.PeriodID]
			if !known {
				continue
			}
			key := fmt.Sprintf("d%d", slot.DayOfWeek)
			row.Cells[key] = mergeCell(row.Cells[key], ExportCell{
				Subject: names.subject(slot.SubjectOfferingID, slot.Label),
				Teacher: names.teacher(slot.TeacherID),
				Room:    names.room(slot.RoomID),
			})
		}
		fillNonTeaching(rows, columns)

		export.Sheets = append(export.Sheets,
			s.sheetFor(cover.SectionID, names, columns, rows, version.Name+" · version "+
				fmt.Sprint(version.Version)))
	}

	sortSheets(export.Sheets, names)
	return export, nil
}

func (s *Service) exportRange(ctx context.Context, q ExportQuery) (Export, error) {
	lo, hi := Day(q.From), Day(q.To)
	if hi.Before(lo) {
		return Export{}, ErrRangeInverted
	}
	if int(hi.Sub(lo).Hours()/24)+1 > MaxExportRangeDays {
		return Export{}, ErrExportRangeTooWide
	}

	export := Export{
		BranchID: q.BranchID,
		Mode:     ExportRange,
		Title:    "Timetable as it falls",
		Subtitle: "Resolved against the calendar from " + lo.Format(dateLayout) +
			" to " + hi.Format(dateLayout),
		Sheets: []ExportSheet{},
	}

	calendar, err := s.Calendar(ctx, q.BranchID, lo, hi, HalfAny)
	if err != nil {
		return Export{}, err
	}
	if len(calendar) == 0 {
		return export, nil
	}

	slots := q.Slots
	deviations := q.Deviations
	if wanted := uniqueIDs(q.SectionIDs); len(wanted) > 0 {
		slots = append(append([]predicate.TimetableSlot{}, slots...), entslot.SectionIDIn(wanted...))
		deviations = append(append([]predicate.TimetableDeviation{}, deviations...),
			entdeviation.SectionIDIn(wanted...))
	}

	resolved, err := s.ResolveCoverage(ctx, ResolveQuery{
		BranchID:   q.BranchID,
		From:       lo,
		To:         hi,
		Half:       HalfAny,
		Slots:      slots,
		Deviations: deviations,
	})
	if err != nil {
		return Export{}, err
	}
	if len(resolved.Occurrences) == 0 {
		return export, nil
	}
	schemeNames, err := s.schemeNames(ctx, resolved.Occurrences)
	if err != nil {
		return Export{}, err
	}

	byCover := map[sheetKey][]Occurrence{}
	var refs exportRefs
	var schemeIDs []uuid.UUID
	for _, occ := range resolved.Occurrences {
		key := sheetKey{GroupID: occ.PeriodSchemeID, SectionID: occ.SectionID}
		byCover[key] = append(byCover[key], occ)
		schemeIDs = append(schemeIDs, occ.PeriodSchemeID)
		refs.offerings = append(refs.offerings, derefID(occ.SubjectOfferingID)...)
		refs.teachers = append(refs.teachers, derefID(occ.TeacherID)...)
		refs.rooms = append(refs.rooms, derefID(occ.RoomID)...)
	}
	covers := make([]sheetKey, 0, len(byCover))
	for key := range byCover {
		covers = append(covers, key)
		refs.sections = append(refs.sections, key.SectionID)
	}
	sort.Slice(covers, func(i, j int) bool {
		if covers[i].SectionID != covers[j].SectionID {
			return covers[i].SectionID.String() < covers[j].SectionID.String()
		}
		return covers[i].GroupID.String() < covers[j].GroupID.String()
	})

	names, err := s.resolveNames(ctx, refs, q.Show)
	if err != nil {
		return Export{}, err
	}
	shapes, err := s.schemeShapes(ctx, schemeIDs)
	if err != nil {
		return Export{}, err
	}

	substitutedFor := map[uuid.UUID]map[string]int{}
	for _, occ := range resolved.Occurrences {
		if !occ.DaySubstituted() {
			continue
		}
		perSection, seen := substitutedFor[occ.SectionID]
		if !seen {
			perSection = map[string]int{}
			substitutedFor[occ.SectionID] = perSection
		}
		perSection[dayKey(occ.Date)] = occ.DayOfWeek
	}

	for _, cover := range covers {
		list := byCover[cover]
		columns := make([]ExportColumn, 0, len(calendar))
		for _, day := range calendar {
			column := ExportColumn{
				Key:   dayKey(day.Date),
				Title: day.Date.Format("Mon 02 Jan"),
			}
			switch {
			case !day.Open(HalfAny):
				column.Note = closedDayNote(day)
			default:
				if dow, ok := substitutedFor[cover.SectionID][dayKey(day.Date)]; ok {
					column.Note = "runs as " + WeekdayName(dow)
				}
			}
			columns = append(columns, column)
		}

		used := map[uuid.UUID]bool{}
		for _, occ := range list {
			used[occ.PeriodID] = true
		}
		rows := shapes[cover.GroupID].rowsFor(used)
		rowAt := map[uuid.UUID]ExportRow{}
		for _, row := range rows {
			rowAt[row.PeriodID] = row
		}

		for _, occ := range list {
			row, known := rowAt[occ.PeriodID]
			if !known {
				continue
			}
			key := dayKey(occ.Date)
			row.Cells[key] = mergeCell(row.Cells[key], ExportCell{
				Subject: names.subject(occ.SubjectOfferingID, occ.Label),
				Teacher: names.teacher(occ.TeacherID),
				Room:    names.room(occ.RoomID),
				Note:    occurrenceNote(occ, row.Time),
			})
		}

		for _, day := range calendar {
			if day.Open(HalfAny) {
				continue
			}
			for _, row := range rows {
				row.Cells[dayKey(day.Date)] = ExportCell{Note: closedDayNote(day)}
			}
		}
		fillNonTeaching(rows, columns)

		export.Sheets = append(export.Sheets,
			s.sheetFor(cover.SectionID, names, columns, rows, schemeNames[cover.GroupID]))
	}

	sortSheets(export.Sheets, names)
	return export, nil
}

func (s *Service) schemeNames(ctx context.Context, occurrences []Occurrence) (
	map[uuid.UUID]string, error) {

	ids := make([]uuid.UUID, 0, len(occurrences))
	for _, occ := range occurrences {
		ids = append(ids, occ.PeriodSchemeID)
	}
	ids = uniqueIDs(ids)

	out := map[uuid.UUID]string{}
	if len(ids) < 2 {
		return out, nil
	}
	rows, err := s.client.PeriodScheme.Query().Where(entscheme.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ID] = row.Name
	}
	return out, nil
}

func (s *Service) sheetFor(section uuid.UUID, names exportNames, columns []ExportColumn,
	rows []ExportRow, subtitle string) ExportSheet {

	sheet := ExportSheet{
		SectionID: section,
		Columns:   columns,
		Rows:      rows,
		Subtitle:  subtitle,
		GradeName: names.grades[section],
	}
	if row := names.sections[section]; row != nil {
		sheet.SectionName = row.Name
		sheet.SectionCode = row.Code
	}
	if sheet.SectionName == "" {
		sheet.SectionName = section.String()
	}
	return sheet
}

func sortSheets(sheets []ExportSheet, names exportNames) {
	sequence := func(id uuid.UUID) int {
		row := names.sections[id]
		if row == nil {
			return 1 << 30
		}
		return gradeSequence(row)
	}
	sort.SliceStable(sheets, func(i, j int) bool {
		a, b := sheets[i], sheets[j]
		if sa, sb := sequence(a.SectionID), sequence(b.SectionID); sa != sb {
			return sa < sb
		}
		if a.GradeName != b.GradeName {
			return a.GradeName < b.GradeName
		}
		if a.SectionName != b.SectionName {
			return a.SectionName < b.SectionName
		}
		return a.SectionCode < b.SectionCode
	})
}

func gradeSequence(row *tenantent.Section) int {
	if row.Edges.GradeLevel == nil {
		return 1 << 30
	}
	return row.Edges.GradeLevel.Sequence
}

func mergeCell(into, add ExportCell) ExportCell {
	if into.Empty() {
		return add
	}
	if add.Empty() {
		return into
	}
	into.Also = append(into.Also, add)
	return into
}

func occurrenceNote(occ Occurrence, rowTime string) string {
	var parts []string
	switch occ.State {
	case StateCancelled:
		parts = append(parts, "Cancelled")
	case StateSubstituted:
		parts = append(parts, "Substitute")
	case StateRelocated:
		parts = append(parts, "Room changed")
	case StateRescheduled:
		parts = append(parts, "Time changed")
	case StateAdded:
		parts = append(parts, "Extra class")
	}
	if occ.TimesResolved {
		if at := ClockSpan(occ.StartMinute, occ.EndMinute); at != "" && at != rowTime {
			parts = append(parts, at)
		}
	}
	return strings.Join(parts, " · ")
}

func closedDayNote(day SessionDay) string {
	label := "Closed"
	if day.DayType != "" {
		label = strings.ToUpper(day.DayType[:1]) + day.DayType[1:]
	}
	if day.Name != nil && *day.Name != "" {
		return label + " – " + *day.Name
	}
	return label
}

func derefID(id *uuid.UUID) []uuid.UUID {
	if id == nil {
		return nil
	}
	return []uuid.UUID{*id}
}
