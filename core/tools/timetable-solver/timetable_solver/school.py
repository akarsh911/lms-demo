"""Turn the JSON that ``export.sql`` produces into :mod:`timetable_solver.dto`.

Standard library only.  This is the one place where the database's shape is
allowed to be visible; everything downstream sees DTOs.

Two policies live here rather than in the export, because they are decisions
rather than facts and a decision should be arguable in Python, not buried in a
CTE.

Which rooms an offering may use
-------------------------------
The schema has no "this offering needs a laboratory" column, so the candidate
set is assembled from three sources, in this order:

1. the room type the caller *requires* for the subject
   (``SolveConfig.required_room_type``), if any - and then **only** rooms of
   that type qualify, because a required lab that falls back to a classroom is
   not a requirement;
2. otherwise the section's ``home_room_id``;
3. plus whatever room the offering is currently taught in, so that keeping a
   teacher where they already are is a choice the model can make rather than
   one the loader has already made for it.

An empty candidate set is **not** an error.  ``timetable_slots.room_id`` is
nullable and ``clash.go`` skips the room rule when either side is null, so an
unroomed offering is legal; it is simply exempt from the room constraint.

How many weeks the window is
----------------------------
Needed to convert a pattern into a weekly minute figure.  Counted as whole
seven-day blocks spanned by the effective window, rounded up, which is the
same denominator the occurrence counts in ``export.sql`` were gathered over.
"""

import datetime
import json
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from .dto import (
    Cell,
    CellKey,
    Cohort,
    FixedPlacement,
    Offering,
    Period,
    Room,
    School,
    Section,
    Teacher,
)


def _date(text: str) -> datetime.date:
    return datetime.datetime.strptime(text[:10], "%Y-%m-%d").date()


def weeks_in(lo: str, hi: str) -> int:
    """Whole weeks spanned by an inclusive date window, at least one."""
    span = (_date(hi) - _date(lo)).days + 1
    return max(1, (span + 6) // 7)


def load(
    path: str,
    demand: Optional[Mapping[str, int]] = None,
    required_room_type: Optional[Mapping[str, str]] = None,
    heavy_subjects: Sequence[str] = (),
) -> School:
    """Read the export from disk and build a :class:`School`.

    ``demand`` overrides ``subject_offerings.periods_per_week`` per offering id.
    It exists because that column is nullable and is NULL for every live
    offering in the demo tenant; the alternative is for the loader to invent a
    number, which is how a generator ends up confidently scheduling a week
    nobody asked for.
    """
    with open(path) as handle:
        doc = json.load(handle)
    return load_document(doc, demand, required_room_type, heavy_subjects)


def load_document(
    doc: Mapping,
    demand: Optional[Mapping[str, int]] = None,
    required_room_type: Optional[Mapping[str, str]] = None,
    heavy_subjects: Sequence[str] = (),
) -> School:
    """Build a :class:`School` from an already-decoded export document.

    The same function :func:`load` runs, given the document rather than a path
    to it.  It exists because ``export.sql`` is not the only producer of this
    shape: the HTTP service in ``server.py`` receives it in a request body, and
    emerge-core builds it from the tenant database it already has open.  Making
    the path the special case rather than the general one keeps every caller on
    one loader, so a school assembled by Go and a school dumped by psql cannot
    drift into being read differently.
    """
    demand = dict(demand or {})
    required_room_type = dict(required_room_type or {})
    heavy = set(heavy_subjects)

    periods = tuple(
        Period(
            id=row["id"],
            code=row["code"],
            name=row["name"],
            sequence=int(row["sequence"]),
            kind=row["kind"],
        )
        for row in doc.get("periods", [])
    )

    cells = tuple(
        Cell(
            day_of_week=int(row["day_of_week"]),
            period_id=row["period_id"],
            bell_code=row.get("bell_code", ""),
            start_minute=int(row["start_minute"]),
            duration_minutes=int(row["duration_minutes"]),
            occurrences=int(row["occurrences"]),
        )
        for row in doc.get("cells", [])
        if int(row.get("occurrences", 0)) > 0
    )

    sections = tuple(
        Section(
            id=row["id"],
            code=row["code"],
            name=row["name"],
            grade_name=row.get("grade_name", ""),
            home_room_id=row.get("home_room_id"),
        )
        for row in doc.get("sections", [])
    )
    section_by_id = {s.id: s for s in sections}

    rooms = tuple(
        Room(
            id=row["id"],
            code=row["code"],
            name=row["name"],
            room_type=row.get("room_type", "classroom"),
            capacity=row.get("capacity"),
        )
        for row in doc.get("rooms", [])
    )
    rooms_by_type = {}  # type: Dict[str, List[str]]
    for room in rooms:
        rooms_by_type.setdefault(room.room_type, []).append(room.id)

    teachers = tuple(
        Teacher(id=row["id"], code=row.get("code") or "", name=row.get("name") or row["id"])
        for row in doc.get("teachers", [])
    )

    incumbent_room = {}  # type: Dict[str, str]
    incumbent_teacher = {}  # type: Dict[str, str]
    best = {}  # type: Dict[str, int]
    for row in doc.get("incumbents", []):
        offering_id = row["offering_id"]
        slots = int(row.get("slots", 0))
        if slots <= best.get(offering_id, -1):
            continue
        best[offering_id] = slots
        if row.get("room_id"):
            incumbent_room[offering_id] = row["room_id"]
        if row.get("teacher_id"):
            incumbent_teacher[offering_id] = row["teacher_id"]

    offerings = []  # type: List[Offering]
    for row in doc.get("offerings", []):
        offering_id = row["id"]
        section = section_by_id.get(row["section_id"])
        subject_code = row.get("subject_code", "")

        wanted_type = required_room_type.get(subject_code)
        if wanted_type is not None:
            room_ids = tuple(rooms_by_type.get(wanted_type, ()))
        else:
            candidates = []
            if section is not None and section.home_room_id:
                candidates.append(section.home_room_id)
            current = incumbent_room.get(offering_id)
            if current and current not in candidates:
                candidates.append(current)
            room_ids = tuple(candidates)

        offerings.append(
            Offering(
                id=offering_id,
                section_id=row["section_id"],
                subject_id=row["subject_id"],
                subject_code=subject_code,
                subject_name=row.get("subject_name", subject_code),
                periods_per_week=demand.get(offering_id, row.get("periods_per_week")),
                minutes_per_week=row.get("minutes_per_week"),
                teacher_ids=tuple(row.get("teacher_ids") or ()),
                room_ids=room_ids,
                enrolled=int(row.get("enrolled", 0)),
                is_elective=bool(row.get("is_elective", False)),
                heavy=subject_code in heavy,
            )
        )

    known = {o.id for o in offerings}
    cohorts = [
        Cohort(
            key=row["key"],
            size=int(row["size"]),
            offering_ids=tuple(i for i in row["offering_ids"] if i in known),
        )
        for row in doc.get("cohorts", [])
    ]
    cohorts.extend(_section_fallback(offerings, cohorts, doc))

    fixed = tuple(
        FixedPlacement(
            section_id=row["section_id"],
            period_id=row["period_id"],
            day_of_week=int(row["day_of_week"]),
            label=row.get("label"),
            offering_id=row.get("subject_offering_id"),
            teacher_id=row.get("teacher_id"),
            room_id=row.get("room_id"),
        )
        for row in doc.get("fixed_slots", [])
    )

    window = doc.get("window", {})
    lo = window.get("lo", "1970-01-01")
    hi = window.get("hi", "1970-01-01")
    timetable = doc.get("timetable") or {}

    return School(
        branch_id=doc["branch"]["id"],
        branch_name=doc["branch"]["name"],
        period_scheme_id=doc["period_scheme"]["id"],
        timetable_id=timetable.get("id"),
        window_lo=lo,
        window_hi=hi,
        weeks=weeks_in(lo, hi),
        periods=periods,
        cells=cells,
        sections=sections,
        rooms=rooms,
        teachers=teachers,
        offerings=tuple(offerings),
        cohorts=tuple(cohorts),
        fixed=fixed,
        incumbent_room=incumbent_room,
        incumbent_teacher=incumbent_teacher,
    )


def _section_fallback(offerings, cohorts, doc):
    """Cover offerings nobody is enrolled in yet, the way ``clash.go`` does.

    A cohort is derived from ``student_subject_enrollments``, so an offering
    with no enrolments belongs to no cohort - and then **nothing in the model
    stops it sharing a period with the rest of its own section's week.**  The
    solver would cheerfully put all six of a section's subjects in one cell and
    call it optimal.  That is not a hypothetical: a section created for next
    year, before anybody has been enrolled into its subjects, is exactly this
    case, and it is the case a timetable is most likely to be generated for.

    ``clash.go:setsFor`` already has the answer.  When a slot has no subject
    offering it falls back to the whole section's roll, and the same fallback is
    correct here for the same reason: with no enrolment to prove otherwise, the
    conservative reading is that the lesson is for everyone in the section.  So
    each such offering joins a synthetic cohort of its section, keyed
    ``section:<id>`` so it is visibly not a real basket.

    Note this deliberately does **not** merge the un-enrolled offering into the
    real cohorts of a section that has some enrolment.  The two claims - "these
    pupils take these subjects" and "we do not know who takes this" - are
    different, and collapsing them would quietly assert enrolment data that
    does not exist.

    The section roll arrives as a count per section when emerge-core built the
    document, and as (pupil, section) pairs when ``export.sql`` did.  Only the
    count is ever used - it is the cohort's ``size``, which appears in a
    sentence and in nothing the model decides - so the service sends the count
    and keeps pupil identifiers off a wire that has no business carrying them.
    """
    covered = set()
    for cohort in cohorts:
        covered.update(cohort.offering_ids)

    roll = dict(doc.get("section_roll_counts") or {})  # type: Dict[str, int]
    for _student_id, section_id in doc.get("section_roll") or ():
        roll[section_id] = roll.get(section_id, 0) + 1

    by_section = {}  # type: Dict[str, List[str]]
    for offering in offerings:
        if offering.id in covered:
            continue
        by_section.setdefault(offering.section_id, []).append(offering.id)

    return [
        Cohort(key="section:%s" % section_id,
               size=roll.get(section_id, 0),
               offering_ids=tuple(sorted(ids)))
        for section_id, ids in sorted(by_section.items())
    ]


def demand_from_current(path: str) -> Dict[str, int]:
    """Read each offering's current weekly placement count out of the export.

    A stopgap for a tenant that has never filled in ``periods_per_week``: the
    school is already running a week, so how many periods it currently gives a
    subject is the best available statement of what it wants.  It is offered as
    an explicit helper, and named for what it is, so that no caller can mistake
    it for the school having stated a requirement.
    """
    with open(path) as handle:
        doc = json.load(handle)
    return demand_from_incumbents(doc)


def demand_from_incumbents(doc: Mapping) -> Dict[str, int]:
    """:func:`demand_from_current`, given the document rather than a path."""
    out = {}  # type: Dict[str, int]
    for row in doc.get("incumbents", []):
        out[row["offering_id"]] = out.get(row["offering_id"], 0) + int(row.get("slots", 0))
    return out


def cells_by_day(school: School) -> Dict[int, Tuple[Cell, ...]]:
    """Cells grouped by ISO day of week, each in bell order."""
    grouped = {}  # type: Dict[int, List[Cell]]
    for cell in school.cells:
        grouped.setdefault(cell.day_of_week, []).append(cell)
    return {
        day: tuple(sorted(items, key=lambda c: c.start_minute))
        for day, items in grouped.items()
    }


#: integer scaling factor.  CP-SAT is an integer solver and this model has
#: exactly one genuinely fractional quantity - ``occurrences * duration /
#: weeks`` - so it is scaled here rather than rounded at the boundary.  It lives
#: in this module, not in the solver, because the reporting side needs the same
#: arithmetic and must not have to import a solver to get it.
SCALE = 100


def minute_weight(school: School, basis: str = "realised") -> Dict[CellKey, int]:
    """Scaled average weekly minutes a placement in each cell is worth.

    ``realised`` divides the window's actual occurrences by its weeks, so a
    Friday afternoon that three ``event`` days close is worth less than a
    Monday afternoon.  ``nominal`` pretends every week is a full week, which is
    what a school's own paperwork usually assumes and is therefore worth being
    able to report against too - but it overstates delivery, by about 6% on the
    demo tenant, and that gap is the whole reason the option exists.
    """
    out = {}  # type: Dict[CellKey, int]
    for cell in school.cells:
        if basis == "nominal":
            out[cell.key] = cell.duration_minutes * SCALE
        else:
            out[cell.key] = int(round(
                cell.occurrences * cell.duration_minutes * SCALE / float(school.weeks)
            ))
    return out
