package access

import (
	"entgo.io/ent/dialect/sql"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceday"
	entmark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
)

func NoAttendancePeriod() predicate.AttendancePeriod { return entmark.IDIn() }

func AnyAttendancePeriod() predicate.AttendancePeriod { return func(*sql.Selector) {} }

func NoAttendanceDay() predicate.AttendanceDay { return entday.IDIn() }

func AnyAttendanceDay() predicate.AttendanceDay { return func(*sql.Selector) {} }

func attendancePeriodSelfArms(v *Viewer) []predicate.AttendancePeriod {
	if len(v.StudentIDs) == 0 {
		return nil
	}
	return []predicate.AttendancePeriod{entmark.StudentIDIn(v.StudentIDs...)}
}

func attendancePeriodWardArms(v *Viewer) []predicate.AttendancePeriod {
	if v.GuardianID == nil {
		return nil
	}
	return []predicate.AttendancePeriod{entmark.HasStudentWith(StudentsOfGuardianAcademic(v))}
}

func attendancePeriodMarkableArms(v *Viewer) []predicate.AttendancePeriod {
	if len(v.SubjectOfferingIDs) == 0 {
		return nil
	}
	return []predicate.AttendancePeriod{entmark.SubjectOfferingIDIn(v.SubjectOfferingIDs...)}
}

func attendancePeriodTaughtArms(v *Viewer) []predicate.AttendancePeriod {
	ors := attendancePeriodMarkableArms(v)
	if len(v.SectionIDs) > 0 {
		ors = append(ors, entmark.HasSubjectOfferingWith(entoffering.SectionIDIn(v.SectionIDs...)))
	}
	return ors
}

func attendancePeriodAnyRoleArms(v *Viewer) []predicate.AttendancePeriod {
	ors := attendancePeriodTaughtArms(v)
	ors = append(ors, attendancePeriodSelfArms(v)...)
	return append(ors, attendancePeriodWardArms(v)...)
}

func attendancePeriodReadArms(v *Viewer, d authorization.Decision) ([]predicate.AttendancePeriod, bool) {
	if !d.HasReach {
		return attendancePeriodAnyRoleArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf:
		return attendancePeriodSelfArms(v), false
	case authorization.ReachGuardianWard:
		return attendancePeriodWardArms(v), false
	case authorization.ReachTeacherAssignment:
		return attendancePeriodTaughtArms(v), false
	default:
		return nil, false
	}
}

func attendancePeriodWriteArms(v *Viewer, d authorization.Decision) ([]predicate.AttendancePeriod, bool) {
	if !d.HasReach {
		return attendancePeriodMarkableArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachTeacherAssignment:
		return attendancePeriodMarkableArms(v), false
	default:
		return nil, false
	}
}

func attendanceDaySelfArms(v *Viewer) []predicate.AttendanceDay {
	if len(v.StudentIDs) == 0 {
		return nil
	}
	return []predicate.AttendanceDay{entday.StudentIDIn(v.StudentIDs...)}
}

func attendanceDayWardArms(v *Viewer) []predicate.AttendanceDay {
	if v.GuardianID == nil {
		return nil
	}
	return []predicate.AttendanceDay{entday.HasStudentWith(StudentsOfGuardianAcademic(v))}
}

func attendanceDayMarkableArms(v *Viewer) []predicate.AttendanceDay {
	if len(v.SectionIDs) == 0 {
		return nil
	}
	return []predicate.AttendanceDay{entday.SectionIDIn(v.SectionIDs...)}
}

func attendanceDayTaughtArms(v *Viewer) []predicate.AttendanceDay {
	ors := attendanceDayMarkableArms(v)
	if len(v.SubjectOfferingIDs) > 0 {
		ors = append(ors, entday.HasStudentWith(StudentsTaughtBy(v)))
	}
	return ors
}

func attendanceDayAnyRoleArms(v *Viewer) []predicate.AttendanceDay {
	ors := attendanceDayTaughtArms(v)
	ors = append(ors, attendanceDaySelfArms(v)...)
	return append(ors, attendanceDayWardArms(v)...)
}

func attendanceDayReadArms(v *Viewer, d authorization.Decision) ([]predicate.AttendanceDay, bool) {
	if !d.HasReach {
		return attendanceDayAnyRoleArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf:
		return attendanceDaySelfArms(v), false
	case authorization.ReachGuardianWard:
		return attendanceDayWardArms(v), false
	case authorization.ReachTeacherAssignment:
		return attendanceDayTaughtArms(v), false
	default:
		return nil, false
	}
}

func attendanceDayWriteArms(v *Viewer, d authorization.Decision) ([]predicate.AttendanceDay, bool) {
	if !d.HasReach {
		return attendanceDayMarkableArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachTeacherAssignment:
		return attendanceDayMarkableArms(v), false
	default:
		return nil, false
	}
}

func attendancePeriodMatching(c authorization.Constraint) predicate.AttendancePeriod {
	switch c.Field {
	case "section", "grade_level":
		return entmark.HasSubjectOfferingWith(entoffering.HasSectionWith(sectionsMatching(c)))
	default:
		return NoAttendancePeriod()
	}
}

func attendanceDayMatching(c authorization.Constraint) predicate.AttendanceDay {
	switch c.Field {
	case "section", "grade_level":
		return entday.HasSectionWith(sectionsMatching(c))
	default:
		return NoAttendanceDay()
	}
}

func AttendancePeriodsConstrainedBy(groups [][]authorization.Constraint) predicate.AttendancePeriod {
	if len(groups) == 0 {
		return AnyAttendancePeriod()
	}

	ors := make([]predicate.AttendancePeriod, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.AttendancePeriod, 0, len(group))
		for _, c := range group {
			ands = append(ands, attendancePeriodMatching(c))
		}
		ors = append(ors, entmark.And(ands...))
	}
	if len(ors) == 0 {
		return NoAttendancePeriod()
	}
	return entmark.Or(ors...)
}

func AttendanceDaysConstrainedBy(groups [][]authorization.Constraint) predicate.AttendanceDay {
	if len(groups) == 0 {
		return AnyAttendanceDay()
	}

	ors := make([]predicate.AttendanceDay, 0, len(groups))
	for _, group := range groups {
		if !translatable(group) {
			continue
		}
		ands := make([]predicate.AttendanceDay, 0, len(group))
		for _, c := range group {
			ands = append(ands, attendanceDayMatching(c))
		}
		ors = append(ors, entday.And(ands...))
	}
	if len(ors) == 0 {
		return NoAttendanceDay()
	}
	return entday.Or(ors...)
}

func attendancePinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if translatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func attendanceUnfiltered(d authorization.Decision, all bool) bool {
	return all && len(d.Constraints) == 0
}

func attendancePeriodDenies(d authorization.Decision, arms []predicate.AttendancePeriod, all bool) bool {
	if !attendancePinsUsable(d.Constraints) {
		return true
	}
	return !all && len(arms) == 0
}

func attendanceDayDenies(d authorization.Decision, arms []predicate.AttendanceDay, all bool) bool {
	if !attendancePinsUsable(d.Constraints) {
		return true
	}
	return !all && len(arms) == 0
}

func attendancePeriodNarrowed(d authorization.Decision, arms []predicate.AttendancePeriod, all bool) predicate.AttendancePeriod {
	if attendancePeriodDenies(d, arms, all) {
		return NoAttendancePeriod()
	}
	if attendanceUnfiltered(d, all) {
		return AnyAttendancePeriod()
	}
	if len(d.Constraints) == 0 {
		return entmark.Or(arms...)
	}
	pinned := AttendancePeriodsConstrainedBy(d.Constraints)
	if all {
		return pinned
	}
	return entmark.And(entmark.Or(arms...), pinned)
}

func attendanceDayNarrowed(d authorization.Decision, arms []predicate.AttendanceDay, all bool) predicate.AttendanceDay {
	if attendanceDayDenies(d, arms, all) {
		return NoAttendanceDay()
	}
	if attendanceUnfiltered(d, all) {
		return AnyAttendanceDay()
	}
	if len(d.Constraints) == 0 {
		return entday.Or(arms...)
	}
	pinned := AttendanceDaysConstrainedBy(d.Constraints)
	if all {
		return pinned
	}
	return entday.And(entday.Or(arms...), pinned)
}

func AttendancePeriodsFor(v *Viewer, d authorization.Decision) predicate.AttendancePeriod {
	if v == nil {
		return NoAttendancePeriod()
	}
	if v.Unrestricted {
		return AnyAttendancePeriod()
	}
	arms, all := attendancePeriodReadArms(v, d)
	return attendancePeriodNarrowed(d, arms, all)
}

func AttendancePeriodsWritableBy(v *Viewer, d authorization.Decision) predicate.AttendancePeriod {
	if v == nil {
		return NoAttendancePeriod()
	}
	if v.Unrestricted {
		return AnyAttendancePeriod()
	}
	arms, all := attendancePeriodWriteArms(v, d)
	return attendancePeriodNarrowed(d, arms, all)
}

func AttendanceDaysFor(v *Viewer, d authorization.Decision) predicate.AttendanceDay {
	if v == nil {
		return NoAttendanceDay()
	}
	if v.Unrestricted {
		return AnyAttendanceDay()
	}
	arms, all := attendanceDayReadArms(v, d)
	return attendanceDayNarrowed(d, arms, all)
}

func AttendanceDaysWritableBy(v *Viewer, d authorization.Decision) predicate.AttendanceDay {
	if v == nil {
		return NoAttendanceDay()
	}
	if v.Unrestricted {
		return AnyAttendanceDay()
	}
	arms, all := attendanceDayWriteArms(v, d)
	return attendanceDayNarrowed(d, arms, all)
}
