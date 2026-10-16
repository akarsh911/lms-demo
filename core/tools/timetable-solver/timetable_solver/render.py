"""Printing a week so a human can read it.  Standard library only.

Two views, because they answer different questions and a timetable that looks
right in one can be obviously wrong in the other: the section view is what a
class sees, the teacher view is what makes over-commitment visible.
"""

from typing import Dict, List, Optional, Sequence, Tuple

from .dto import DAY_NAMES, Placement, School
from .school import SCALE, minute_weight


def _short(section) -> str:
    """"2026-2027-G6-B" -> "G6-B".  The session prefix is the same on every row
    and the grade is not: a teacher view that labels three different classes "B"
    hides exactly the double-booking it exists to expose."""
    parts = section.code.split("-")
    return "-".join(parts[-2:]) if len(parts) > 1 else section.code


def _grid(school: School):
    days = sorted({cell.day_of_week for cell in school.cells})
    columns = []  # type: List[Tuple[int, str, str]]
    for day in days:
        cells = sorted(
            (c for c in school.cells if c.day_of_week == day),
            key=lambda c: c.start_minute,
        )
        for cell in cells:
            period = school.period(cell.period_id)
            columns.append((day, cell.period_id, period.code if period else "?"))
    return days, columns


def section_view(school: School, placements: Sequence[Placement], width: int = 9) -> str:
    """One block per section: rows are days, columns are periods.

    Concurrent offerings in one cell are joined with ``+``, which is the whole
    point of the student-set rule and should be visible rather than hidden -
    ``FRE+SAN`` in one cell is a correct timetable, not a defect.
    """
    days, columns = _grid(school)
    periods_of_day = {}  # type: Dict[int, List[Tuple[str, str]]]
    for day, period_id, code in columns:
        periods_of_day.setdefault(day, []).append((period_id, code))
    widest = max(len(v) for v in periods_of_day.values())

    at = {}  # type: Dict[Tuple[str, int, str], List[str]]
    for placement in placements:
        offering = school.offering(placement.offering_id)
        if offering is None:
            continue
        at.setdefault(
            (placement.section_id, placement.day_of_week, placement.period_id), []
        ).append(offering.subject_code)

    lines = []  # type: List[str]
    for section in sorted(school.sections, key=lambda s: s.code):
        if not any(o.section_id == section.id for o in school.offerings):
            continue
        lines.append("")
        lines.append("%s %s  (%s)" % (section.grade_name, section.name, section.code))
        header = "  %-10s" % ""
        for index in range(widest):
            codes = {
                code for day in days
                if index < len(periods_of_day[day])
                for code in [periods_of_day[day][index][1]]
            }
            header += "%-*s" % (width + 1, "/".join(sorted(codes)))
        lines.append(header)
        for day in days:
            row = "  %-10s" % DAY_NAMES[day]
            for index in range(widest):
                if index >= len(periods_of_day[day]):
                    row += "%-*s" % (width + 1, "-")
                    continue
                period_id = periods_of_day[day][index][0]
                subjects = sorted(at.get((section.id, day, period_id), []))
                row += "%-*s" % (width + 1, "+".join(subjects) or ".")
            lines.append(row)
    return "\n".join(lines)


def teacher_view(school: School, placements: Sequence[Placement], width: int = 9) -> str:
    """One row per teacher per day: what makes a double-booking obvious by eye."""
    days, columns = _grid(school)
    periods_of_day = {}  # type: Dict[int, List[Tuple[str, str]]]
    for day, period_id, code in columns:
        periods_of_day.setdefault(day, []).append((period_id, code))
    widest = max(len(v) for v in periods_of_day.values())

    at = {}  # type: Dict[Tuple[str, int, str], List[str]]
    load = {}  # type: Dict[str, int]
    for placement in placements:
        if not placement.teacher_id:
            continue
        offering = school.offering(placement.offering_id)
        section = school.section(placement.section_id)
        tag = "%s/%s" % (
            offering.subject_code if offering else "?",
            _short(section) if section else "?",
        )
        at.setdefault(
            (placement.teacher_id, placement.day_of_week, placement.period_id), []
        ).append(tag)
        load[placement.teacher_id] = load.get(placement.teacher_id, 0) + 1

    lines = []  # type: List[str]
    for teacher in sorted(school.teachers, key=lambda t: t.name):
        if teacher.id not in load:
            continue
        lines.append("")
        lines.append("%s  (%d periods a week)" % (teacher.name, load[teacher.id]))
        for day in days:
            row = "  %-10s" % DAY_NAMES[day]
            for index in range(widest):
                if index >= len(periods_of_day[day]):
                    row += "%-*s" % (width + 1, "-")
                    continue
                period_id = periods_of_day[day][index][0]
                tags = sorted(at.get((teacher.id, day, period_id), []))
                row += "%-*s" % (width + 1, "+".join(tags) or ".")
            lines.append(row)
    return "\n".join(lines)


def load_table(school: School, placements: Sequence[Placement]) -> str:
    """Periods and realised weekly minutes per offering, side by side.

    The two columns are the point: ``periods_per_week`` is the placement count
    and the minutes are what those placements actually deliver once the bell
    schedule and the calendar have had their say.  They do not agree, and they
    are not supposed to.
    """
    weight = minute_weight(school, "realised")
    nominal = minute_weight(school, "nominal")

    got = {}  # type: Dict[str, List[Placement]]
    for placement in placements:
        got.setdefault(placement.offering_id, []).append(placement)

    lines = ["", "%-34s %7s %10s %10s" % ("offering", "periods", "nominal", "realised")]
    for offering in sorted(school.offerings, key=lambda o: school.label(o.id)):
        mine = got.get(offering.id, [])
        if not mine:
            continue
        nom = sum(nominal[(p.day_of_week, p.period_id)] for p in mine) / float(SCALE)
        real = sum(weight[(p.day_of_week, p.period_id)] for p in mine) / float(SCALE)
        lines.append("%-34s %7d %10.1f %10.1f"
                     % (school.label(offering.id)[:34], len(mine), nom, real))
    return "\n".join(lines)
