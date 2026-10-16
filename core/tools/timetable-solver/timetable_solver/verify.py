"""An independent check that a week is actually legal.

Standard library only, and **deliberately independent of everything else in
this package**.  It reads the raw export JSON again rather than a
:class:`~timetable_solver.dto.School`, it never sees the model, and it does not
know that cohorts exist.  A solver that reports its own constraints as
satisfied has proved nothing: it has restated its own model back to you.  If
the cohort derivation in ``export.sql`` were wrong, the model would be
satisfied and the week would still put a child in two rooms at once - and only
a checker that works from raw ``student_subject_enrollments`` rows would say so.

So the three rules are re-implemented here the way
``internal/service/timetable/clash.go`` implements them, pairwise, from the
roll:

* **teacher** - both sides have a teacher and it is the same teacher
  (``clash.go:judge``).  A null teacher on either side is not a clash.
* **room** - both sides have a room and it is the same room.  A null room on
  either side is not a clash; ``timetable_slots.room_id`` is nullable and that
  is legitimate.
* **student set** - the two offerings' *active student sets* intersect.  Not
  "the same section": two slots for one section in one period are only a clash
  if pupils are in both.  Where a slot has no subject offering - an assembly,
  a label-only slot - ``clash.go`` falls back to the whole section's roll, and
  so does this.

The comparison is over the weekly pattern: two placements are concurrent iff
they share (day_of_week, period_id).  That matches ``clash.go``'s pattern pass,
which compares ``day_of_week`` and ``period_id`` and only falls back to minute
overlap on the dated pass, where deviations can move a slot's times.
"""

import json
from typing import Dict, List, Optional, Sequence, Set, Tuple


class Violation(object):
    """One rule broken by one pair of placements."""

    __slots__ = ("rule", "day_of_week", "period_code", "detail", "left", "right")

    def __init__(self, rule, day_of_week, period_code, detail, left, right):
        self.rule = rule
        self.day_of_week = day_of_week
        self.period_code = period_code
        self.detail = detail
        self.left = left
        self.right = right

    def __repr__(self):
        return "Violation(%s, day %d %s, %s)" % (
            self.rule, self.day_of_week, self.period_code, self.detail)


class Report(object):
    """What an independent read of the week found."""

    __slots__ = ("violations", "demand_misses", "grid_misses", "checked_pairs",
                 "placements", "cells")

    def __init__(self):
        self.violations = []      # type: List[Violation]
        self.demand_misses = []   # type: List[str]
        self.grid_misses = []     # type: List[str]
        self.checked_pairs = 0
        self.placements = 0
        self.cells = 0

    @property
    def clean(self) -> bool:
        return not (self.violations or self.demand_misses or self.grid_misses)

    def count(self, rule: str) -> int:
        return len([v for v in self.violations if v.rule == rule])


def verify(export_path: str,
           placements: Sequence[dict],
           demand: Optional[Dict[str, int]] = None,
           include_fixed: bool = True) -> Report:
    """Check ``placements`` against the raw export.

    ``placements`` are plain dicts with ``offering_id``, ``section_id``,
    ``day_of_week``, ``period_id`` and optional ``teacher_id`` / ``room_id`` -
    the wire shape, not a DTO, so that a week pasted in from anywhere at all
    can be checked by the same code.
    """
    with open(export_path) as handle:
        doc = json.load(handle)

    students_of = {}  # type: Dict[str, Set[str]]
    for student_id, offering_id in doc.get("enrolments", []):
        students_of.setdefault(offering_id, set()).add(student_id)

    roll_of = {}  # type: Dict[str, Set[str]]
    for student_id, section_id in doc.get("section_roll", []):
        roll_of.setdefault(section_id, set()).add(student_id)

    period_code = {p["id"]: p["code"] for p in doc.get("periods", [])}
    teaching = {p["id"] for p in doc.get("periods", []) if p["kind"] == "teaching"}
    open_cells = {
        (int(c["day_of_week"]), c["period_id"])
        for c in doc.get("cells", [])
        if int(c.get("occurrences", 0)) > 0
    }
    section_of = {o["id"]: o["section_id"] for o in doc.get("offerings", [])}

    engagements = [dict(p) for p in placements]
    if include_fixed:
        for row in doc.get("fixed_slots", []):
            engagements.append({
                "offering_id": row.get("subject_offering_id"),
                "section_id": row["section_id"],
                "day_of_week": int(row["day_of_week"]),
                "period_id": row["period_id"],
                "teacher_id": row.get("teacher_id"),
                "room_id": row.get("room_id"),
                "fixed": True,
            })

    report = Report()
    report.placements = len(placements)
    report.cells = len(open_cells)

    for engagement in engagements:
        if engagement.get("fixed"):
            continue
        key = (int(engagement["day_of_week"]), engagement["period_id"])
        if engagement["period_id"] not in teaching:
            report.grid_misses.append(
                "%s is not a teaching period" % period_code.get(
                    engagement["period_id"], engagement["period_id"]))
        elif key not in open_cells:
            report.grid_misses.append(
                "day %d %s does not run" % (key[0], period_code.get(key[1], key[1])))
        if engagement.get("offering_id") and section_of.get(engagement["offering_id"]) \
                not in (None, engagement.get("section_id")):
            report.grid_misses.append(
                "placement of %s claims the wrong section" % engagement["offering_id"])

    if demand:
        placed = {}  # type: Dict[str, int]
        for engagement in placements:
            offering_id = engagement.get("offering_id")
            if offering_id:
                placed[offering_id] = placed.get(offering_id, 0) + 1
        for offering_id, want in sorted(demand.items()):
            got = placed.get(offering_id, 0)
            if got != want:
                report.demand_misses.append(
                    "%s wanted %d periods and got %d" % (offering_id, want, got))

    by_cell = {}  # type: Dict[Tuple[int, str], List[dict]]
    for engagement in engagements:
        by_cell.setdefault(
            (int(engagement["day_of_week"]), engagement["period_id"]), []
        ).append(engagement)

    for key, group in sorted(by_cell.items()):
        day, period_id = key
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                left, right = group[i], group[j]
                if left.get("fixed") and right.get("fixed"):
                    continue
                report.checked_pairs += 1

                if left.get("teacher_id") and right.get("teacher_id") \
                        and left["teacher_id"] == right["teacher_id"]:
                    report.violations.append(Violation(
                        "teacher", day, period_code.get(period_id, period_id),
                        "teacher %s" % left["teacher_id"], left, right))

                if left.get("room_id") and right.get("room_id") \
                        and left["room_id"] == right["room_id"]:
                    report.violations.append(Violation(
                        "room", day, period_code.get(period_id, period_id),
                        "room %s" % left["room_id"], left, right))

                shared = _set_for(left, students_of, roll_of) & \
                    _set_for(right, students_of, roll_of)
                if shared:
                    report.violations.append(Violation(
                        "student_set", day, period_code.get(period_id, period_id),
                        "%d pupils in both" % len(shared), left, right))

    return report


def _set_for(engagement, students_of, roll_of) -> Set[str]:
    """``clash.go:setsFor`` - the offering's roll, or the section's if there is
    no offering."""
    offering_id = engagement.get("offering_id")
    if offering_id:
        return students_of.get(offering_id, set())
    return roll_of.get(engagement.get("section_id"), set())


def summarise(report: Report) -> str:
    lines = [
        "independent check: %d placements, %d concurrent pairs examined"
        % (report.placements, report.checked_pairs),
        "  teacher clashes     : %d" % report.count("teacher"),
        "  room clashes        : %d" % report.count("room"),
        "  student-set clashes : %d" % report.count("student_set"),
        "  off-grid placements : %d" % len(report.grid_misses),
        "  demand misses       : %d" % len(report.demand_misses),
    ]
    for violation in report.violations[:10]:
        lines.append("  ! %r" % (violation,))
    for miss in report.demand_misses[:10]:
        lines.append("  ! %s" % miss)
    for miss in report.grid_misses[:10]:
        lines.append("  ! %s" % miss)
    lines.append("  VERDICT: %s" % ("clean" if report.clean else "NOT CLEAN"))
    return "\n".join(lines)
