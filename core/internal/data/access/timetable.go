package access

import (
	"entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entbell "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/bellschedule"
	entcalendar "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	entperiod "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/period"
	entscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodscheme"
	entschemegrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/periodschemegradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

func NoTimetableSlot() predicate.TimetableSlot { return entslot.IDIn() }

func AnyTimetableSlot() predicate.TimetableSlot { return func(*sql.Selector) {} }

func NoTimetable() predicate.Timetable { return enttimetable.IDIn() }

func AnyTimetable() predicate.Timetable { return func(*sql.Selector) {} }

func NoTimetableDeviation() predicate.TimetableDeviation { return entdeviation.IDIn() }

func AnyTimetableDeviation() predicate.TimetableDeviation { return func(*sql.Selector) {} }

func NoPeriodScheme() predicate.PeriodScheme { return entscheme.IDIn() }

func AnyPeriodScheme() predicate.PeriodScheme { return func(*sql.Selector) {} }

func NoPeriod() predicate.Period { return entperiod.IDIn() }

func AnyPeriod() predicate.Period { return func(*sql.Selector) {} }

func NoBellSchedule() predicate.BellSchedule { return entbell.IDIn() }

func AnyBellSchedule() predicate.BellSchedule { return func(*sql.Selector) {} }

func NoCalendarDay() predicate.CalendarDay { return entcalendar.IDIn() }

func AnyCalendarDay() predicate.CalendarDay { return func(*sql.Selector) {} }

func NoRoom() predicate.Room { return entroom.IDIn() }

func AnyRoom() predicate.Room { return func(*sql.Selector) {} }

func timetablePinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func timetableDenies(d authorization.Decision, arms int, all bool) bool {
	if !timetablePinsUsable(d.Constraints) {
		return true
	}
	return !all && arms == 0
}

func timetableUnfiltered(d authorization.Decision, all bool) bool {
	return all && len(d.Constraints) == 0
}

func timetableVisible() predicate.Timetable {
	return enttimetable.StatusNEQ(enttimetable.StatusDraft)
}

func timetableSlotVisible() predicate.TimetableSlot {
	return entslot.HasTimetableWith(timetableVisible())
}

func timetableSlotsOfOfferings(ids []uuid.UUID) []predicate.TimetableSlot {
	if len(ids) == 0 {
		return nil
	}
	return []predicate.TimetableSlot{entslot.SubjectOfferingIDIn(ids...)}
}

func timetableSlotSectionWide(where predicate.StudentEnrollment) predicate.TimetableSlot {
	return entslot.And(
		entslot.SubjectOfferingIDIsNil(),
		entslot.HasSectionWith(entsection.HasEnrollmentsWith(
			where,
			entenrollment.StatusEQ(entenrollment.StatusActive),
		)),
	)
}

func timetableSlotStudiedArms(v *Viewer) []predicate.TimetableSlot {
	if len(v.StudentIDs) == 0 {
		return nil
	}
	ors := timetableSlotsOfOfferings(v.EnrolledOfferingIDs)
	return append(ors, timetableSlotSectionWide(entenrollment.StudentIDIn(v.StudentIDs...)))
}

func timetableSlotWardArms(v *Viewer) []predicate.TimetableSlot {
	if v.GuardianID == nil {
		return nil
	}
	ors := timetableSlotsOfOfferings(v.WardOfferingIDs)
	return append(ors, timetableSlotSectionWide(entenrollment.HasStudentWith(StudentsOfGuardian(v))))
}

func timetableSlotTeachingArms(v *Viewer) []predicate.TimetableSlot {
	var ors []predicate.TimetableSlot
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entslot.SubjectOfferingIDIn(v.SubjectOfferingIDs...))
	}
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entslot.SectionIDIn(v.SectionIDs...))
	}
	if v.TeacherID != nil {
		ors = append(ors, entslot.TeacherIDEQ(*v.TeacherID))
	}
	return ors
}

func timetableSlotAnyRoleArms(v *Viewer) []predicate.TimetableSlot {
	ors := timetableSlotTeachingArms(v)
	ors = append(ors, timetableSlotStudiedArms(v)...)
	return append(ors, timetableSlotWardArms(v)...)
}

func timetableSlotReadArms(v *Viewer, d authorization.Decision) ([]predicate.TimetableSlot, bool) {
	if !d.HasReach {
		return timetableSlotAnyRoleArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf:
		return timetableSlotStudiedArms(v), false
	case authorization.ReachGuardianWard:
		return timetableSlotWardArms(v), false
	case authorization.ReachTeacherAssignment:
		return timetableSlotTeachingArms(v), false
	default:
		return nil, false
	}
}

func timetableSlotWriteArms(v *Viewer, d authorization.Decision) ([]predicate.TimetableSlot, bool) {
	if !d.HasReach {
		return timetableSlotTeachingArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachTeacherAssignment:
		return timetableSlotTeachingArms(v), false
	case authorization.ReachSelf:
		return nil, false
	case authorization.ReachGuardianWard:
		return nil, false
	default:
		return nil, false
	}
}

func timetableSlotMatching(c authorization.Constraint) predicate.TimetableSlot {
	switch c.Field {
	case "section", "grade_level":
		return entslot.HasSectionWith(sectionsMatching(c))
	default:
		return NoTimetableSlot()
	}
}

func TimetableSlotsConstrainedBy(groups [][]authorization.Constraint) predicate.TimetableSlot {
	if len(groups) == 0 {
		return AnyTimetableSlot()
	}

	ors := make([]predicate.TimetableSlot, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.TimetableSlot, 0, len(group))
		for _, c := range group {
			ands = append(ands, timetableSlotMatching(c))
		}
		ors = append(ors, entslot.And(ands...))
	}
	if len(ors) == 0 {
		return NoTimetableSlot()
	}
	return entslot.Or(ors...)
}

func timetableSlotNarrowed(d authorization.Decision, arms []predicate.TimetableSlot, all bool) predicate.TimetableSlot {
	if timetableDenies(d, len(arms), all) {
		return NoTimetableSlot()
	}
	if timetableUnfiltered(d, all) {
		return AnyTimetableSlot()
	}
	if all {
		return TimetableSlotsConstrainedBy(d.Constraints)
	}
	if len(d.Constraints) == 0 {
		return entslot.Or(arms...)
	}
	return entslot.And(entslot.Or(arms...), TimetableSlotsConstrainedBy(d.Constraints))
}

func TimetableSlotsFor(v *Viewer, d authorization.Decision) predicate.TimetableSlot {
	if v == nil {
		return NoTimetableSlot()
	}
	if v.Unrestricted {
		return AnyTimetableSlot()
	}
	arms, all := timetableSlotReadArms(v, d)
	if all {
		return timetableSlotNarrowed(d, arms, all)
	}
	if timetableDenies(d, len(arms), all) {
		return NoTimetableSlot()
	}
	return entslot.And(timetableSlotNarrowed(d, arms, all), timetableSlotVisible())
}

func TimetableSlotsWritableBy(v *Viewer, d authorization.Decision) predicate.TimetableSlot {
	if v == nil {
		return NoTimetableSlot()
	}
	if v.Unrestricted {
		return AnyTimetableSlot()
	}
	arms, all := timetableSlotWriteArms(v, d)
	return timetableSlotNarrowed(d, arms, all)
}

func TimetablesConstrainedBy(groups [][]authorization.Constraint) predicate.Timetable {
	if len(groups) == 0 {
		return AnyTimetable()
	}
	if !timetablePinsUsable(groups) {
		return NoTimetable()
	}
	return enttimetable.HasSlotsWith(TimetableSlotsConstrainedBy(groups))
}

func timetableOver(d authorization.Decision, arms []predicate.TimetableSlot, all bool) predicate.Timetable {
	if timetableDenies(d, len(arms), all) {
		return NoTimetable()
	}
	if timetableUnfiltered(d, all) {
		return AnyTimetable()
	}
	return enttimetable.HasSlotsWith(timetableSlotNarrowed(d, arms, all))
}

func TimetablesFor(v *Viewer, d authorization.Decision) predicate.Timetable {
	if v == nil {
		return NoTimetable()
	}
	if v.Unrestricted {
		return AnyTimetable()
	}
	arms, all := timetableSlotReadArms(v, d)
	if all {
		return timetableOver(d, arms, all)
	}
	if timetableDenies(d, len(arms), all) {
		return NoTimetable()
	}
	return enttimetable.And(timetableOver(d, arms, all), timetableVisible())
}

func TimetablesWritableBy(v *Viewer, d authorization.Decision) predicate.Timetable {
	if v == nil {
		return NoTimetable()
	}
	if v.Unrestricted {
		return AnyTimetable()
	}
	arms, all := timetableSlotWriteArms(v, d)
	return timetableOver(d, arms, all)
}

func timetableDeviationAdded(p predicate.TimetableDeviation) predicate.TimetableDeviation {
	return entdeviation.And(entdeviation.TimetableSlotIDIsNil(), p)
}

func timetableDeviationOverSlots(arms []predicate.TimetableSlot) []predicate.TimetableDeviation {
	if len(arms) == 0 {
		return nil
	}
	return []predicate.TimetableDeviation{entdeviation.HasTimetableSlotWith(entslot.Or(arms...))}
}

func timetableDeviationStudiedArms(v *Viewer) []predicate.TimetableDeviation {
	ors := timetableDeviationOverSlots(timetableSlotStudiedArms(v))
	if len(ors) == 0 {
		return nil
	}
	if len(v.EnrolledOfferingIDs) > 0 {
		ors = append(ors, timetableDeviationAdded(
			entdeviation.SubjectOfferingIDIn(v.EnrolledOfferingIDs...),
		))
	}
	return ors
}

func timetableDeviationWardArms(v *Viewer) []predicate.TimetableDeviation {
	ors := timetableDeviationOverSlots(timetableSlotWardArms(v))
	if len(ors) == 0 {
		return nil
	}
	if len(v.WardOfferingIDs) > 0 {
		ors = append(ors, timetableDeviationAdded(
			entdeviation.SubjectOfferingIDIn(v.WardOfferingIDs...),
		))
	}
	return ors
}

func timetableDeviationTeachingArms(v *Viewer) []predicate.TimetableDeviation {
	ors := timetableDeviationOverSlots(timetableSlotTeachingArms(v))
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, timetableDeviationAdded(
			entdeviation.SubjectOfferingIDIn(v.SubjectOfferingIDs...),
		))
	}
	if len(v.SectionIDs) > 0 {
		ors = append(ors, timetableDeviationAdded(
			entdeviation.SectionIDIn(v.SectionIDs...),
		))
	}
	if v.TeacherID != nil {
		ors = append(ors, entdeviation.SubstituteTeacherIDEQ(*v.TeacherID))
	}
	return ors
}

func timetableDeviationAnyRoleArms(v *Viewer) []predicate.TimetableDeviation {
	ors := timetableDeviationTeachingArms(v)
	ors = append(ors, timetableDeviationStudiedArms(v)...)
	return append(ors, timetableDeviationWardArms(v)...)
}

func timetableDeviationReadArms(v *Viewer, d authorization.Decision) ([]predicate.TimetableDeviation, bool) {
	if !d.HasReach {
		return timetableDeviationAnyRoleArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf:
		return timetableDeviationStudiedArms(v), false
	case authorization.ReachGuardianWard:
		return timetableDeviationWardArms(v), false
	case authorization.ReachTeacherAssignment:
		return timetableDeviationTeachingArms(v), false
	default:
		return nil, false
	}
}

func timetableDeviationWriteArms(v *Viewer, d authorization.Decision) ([]predicate.TimetableDeviation, bool) {
	if !d.HasReach {
		return timetableDeviationTeachingArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachTeacherAssignment:
		return timetableDeviationTeachingArms(v), false
	case authorization.ReachSelf:
		return nil, false
	case authorization.ReachGuardianWard:
		return nil, false
	default:
		return nil, false
	}
}

func timetableDeviationMatching(c authorization.Constraint) predicate.TimetableDeviation {
	switch c.Field {
	case "section", "grade_level":
		return entdeviation.HasSectionWith(sectionsMatching(c))
	default:
		return NoTimetableDeviation()
	}
}

func TimetableDeviationsConstrainedBy(groups [][]authorization.Constraint) predicate.TimetableDeviation {
	if len(groups) == 0 {
		return AnyTimetableDeviation()
	}

	ors := make([]predicate.TimetableDeviation, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.TimetableDeviation, 0, len(group))
		for _, c := range group {
			ands = append(ands, timetableDeviationMatching(c))
		}
		ors = append(ors, entdeviation.And(ands...))
	}
	if len(ors) == 0 {
		return NoTimetableDeviation()
	}
	return entdeviation.Or(ors...)
}

func timetableDeviationNarrowed(d authorization.Decision, arms []predicate.TimetableDeviation, all bool) predicate.TimetableDeviation {
	if timetableDenies(d, len(arms), all) {
		return NoTimetableDeviation()
	}
	if timetableUnfiltered(d, all) {
		return AnyTimetableDeviation()
	}
	if all {
		return TimetableDeviationsConstrainedBy(d.Constraints)
	}
	if len(d.Constraints) == 0 {
		return entdeviation.Or(arms...)
	}
	return entdeviation.And(entdeviation.Or(arms...), TimetableDeviationsConstrainedBy(d.Constraints))
}

func TimetableDeviationsFor(v *Viewer, d authorization.Decision) predicate.TimetableDeviation {
	if v == nil {
		return NoTimetableDeviation()
	}
	if v.Unrestricted {
		return AnyTimetableDeviation()
	}
	arms, all := timetableDeviationReadArms(v, d)
	return timetableDeviationNarrowed(d, arms, all)
}

func TimetableDeviationsWritableBy(v *Viewer, d authorization.Decision) predicate.TimetableDeviation {
	if v == nil {
		return NoTimetableDeviation()
	}
	if v.Unrestricted {
		return AnyTimetableDeviation()
	}
	arms, all := timetableDeviationWriteArms(v, d)
	return timetableDeviationNarrowed(d, arms, all)
}

func timetableHoldsStudiedRole(v *Viewer) bool { return len(v.StudentIDs) > 0 }

func timetableHoldsWardRole(v *Viewer) bool { return v.GuardianID != nil }

func timetableHoldsTeachingRole(v *Viewer) bool {
	return len(v.SectionIDs) > 0 || len(v.SubjectOfferingIDs) > 0 || v.TeacherID != nil
}

func timetableDayShapeReadable(v *Viewer, d authorization.Decision) bool {
	if !d.HasReach {
		return timetableHoldsTeachingRole(v) || timetableHoldsStudiedRole(v) || timetableHoldsWardRole(v)
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return true
	case authorization.ReachSelf:
		return timetableHoldsStudiedRole(v)
	case authorization.ReachGuardianWard:
		return timetableHoldsWardRole(v)
	case authorization.ReachTeacherAssignment:
		return timetableHoldsTeachingRole(v)
	default:
		return false
	}
}

func timetableDayShapeWritable(d authorization.Decision) bool {
	return d.HasReach && d.Reach == authorization.ReachTenant
}

func timetablePeriodSchemeMatching(c authorization.Constraint) predicate.PeriodScheme {
	switch c.Field {
	case "section":
		return entscheme.HasGradeLevelsWith(entschemegrade.HasGradeLevelWith(
			entgrade.HasSectionsWith(entsection.CodeIn(c.Values...)),
		))
	case "grade_level":
		return entscheme.HasGradeLevelsWith(entschemegrade.HasGradeLevelWith(
			entgrade.CodeIn(c.Values...),
		))
	default:
		return NoPeriodScheme()
	}
}

func PeriodSchemesConstrainedBy(groups [][]authorization.Constraint) predicate.PeriodScheme {
	if len(groups) == 0 {
		return AnyPeriodScheme()
	}

	ors := make([]predicate.PeriodScheme, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.PeriodScheme, 0, len(group))
		for _, c := range group {
			ands = append(ands, timetablePeriodSchemeMatching(c))
		}
		ors = append(ors, entscheme.And(ands...))
	}
	if len(ors) == 0 {
		return NoPeriodScheme()
	}
	return entscheme.Or(ors...)
}

func PeriodSchemesFor(v *Viewer, d authorization.Decision) predicate.PeriodScheme {
	if v == nil {
		return NoPeriodScheme()
	}
	if v.Unrestricted {
		return AnyPeriodScheme()
	}
	if !timetableDayShapeReadable(v, d) {
		return NoPeriodScheme()
	}
	return PeriodSchemesConstrainedBy(d.Constraints)
}

func PeriodSchemesWritableBy(v *Viewer, d authorization.Decision) predicate.PeriodScheme {
	if v == nil {
		return NoPeriodScheme()
	}
	if v.Unrestricted {
		return AnyPeriodScheme()
	}
	if !timetableDayShapeWritable(d) {
		return NoPeriodScheme()
	}
	return PeriodSchemesConstrainedBy(d.Constraints)
}

func PeriodsConstrainedBy(groups [][]authorization.Constraint) predicate.Period {
	if len(groups) == 0 {
		return AnyPeriod()
	}
	return entperiod.HasPeriodSchemeWith(PeriodSchemesConstrainedBy(groups))
}

func PeriodsFor(v *Viewer, d authorization.Decision) predicate.Period {
	if v == nil {
		return NoPeriod()
	}
	if v.Unrestricted {
		return AnyPeriod()
	}
	if !timetableDayShapeReadable(v, d) {
		return NoPeriod()
	}
	return PeriodsConstrainedBy(d.Constraints)
}

func PeriodsWritableBy(v *Viewer, d authorization.Decision) predicate.Period {
	if v == nil {
		return NoPeriod()
	}
	if v.Unrestricted {
		return AnyPeriod()
	}
	if !timetableDayShapeWritable(d) {
		return NoPeriod()
	}
	return PeriodsConstrainedBy(d.Constraints)
}

func BellSchedulesConstrainedBy(groups [][]authorization.Constraint) predicate.BellSchedule {
	if len(groups) == 0 {
		return AnyBellSchedule()
	}
	return entbell.HasPeriodSchemeWith(PeriodSchemesConstrainedBy(groups))
}

func BellSchedulesFor(v *Viewer, d authorization.Decision) predicate.BellSchedule {
	if v == nil {
		return NoBellSchedule()
	}
	if v.Unrestricted {
		return AnyBellSchedule()
	}
	if !timetableDayShapeReadable(v, d) {
		return NoBellSchedule()
	}
	return BellSchedulesConstrainedBy(d.Constraints)
}

func BellSchedulesWritableBy(v *Viewer, d authorization.Decision) predicate.BellSchedule {
	if v == nil {
		return NoBellSchedule()
	}
	if v.Unrestricted {
		return AnyBellSchedule()
	}
	if !timetableDayShapeWritable(d) {
		return NoBellSchedule()
	}
	return BellSchedulesConstrainedBy(d.Constraints)
}

func CalendarDaysConstrainedBy(groups [][]authorization.Constraint) predicate.CalendarDay {
	if len(groups) == 0 {
		return AnyCalendarDay()
	}
	return NoCalendarDay()
}

func CalendarDaysFor(v *Viewer, d authorization.Decision) predicate.CalendarDay {
	if v == nil {
		return NoCalendarDay()
	}
	if v.Unrestricted {
		return AnyCalendarDay()
	}
	if !timetableDayShapeReadable(v, d) {
		return NoCalendarDay()
	}
	return CalendarDaysConstrainedBy(d.Constraints)
}

func CalendarDaysWritableBy(v *Viewer, d authorization.Decision) predicate.CalendarDay {
	if v == nil {
		return NoCalendarDay()
	}
	if v.Unrestricted {
		return AnyCalendarDay()
	}
	if !timetableDayShapeWritable(d) {
		return NoCalendarDay()
	}
	return CalendarDaysConstrainedBy(d.Constraints)
}

func RoomsConstrainedBy(groups [][]authorization.Constraint) predicate.Room {
	if len(groups) == 0 {
		return AnyRoom()
	}
	return NoRoom()
}

func RoomsFor(v *Viewer, d authorization.Decision) predicate.Room {
	if v == nil {
		return NoRoom()
	}
	if v.Unrestricted {
		return AnyRoom()
	}
	if !timetableDayShapeReadable(v, d) {
		return NoRoom()
	}
	return RoomsConstrainedBy(d.Constraints)
}

func RoomsWritableBy(v *Viewer, d authorization.Decision) predicate.Room {
	if v == nil {
		return NoRoom()
	}
	if v.Unrestricted {
		return AnyRoom()
	}
	if !timetableDayShapeWritable(d) {
		return NoRoom()
	}
	return RoomsConstrainedBy(d.Constraints)
}
