"""Frozen data-transfer objects for the timetable model.

No behaviour lives here - these are immutable records that the pure functions
in the sibling modules consume and produce.  **Units are documented on every
numeric field**, because the most expensive class of bug in this layer is a
periods/minutes/occurrences mix-up that type-checks perfectly.

Three vocabulary decisions are worth stating once, here, because everything
else follows from them.

A *cell* is not a period
-----------------------
``periods`` in the schema carry no times; times live on
``bell_schedule_periods`` and **differ by bell schedule** (45 minutes on a
weekday, 40 on a Saturday, verified in the demo tenant).  A cell is therefore
the pair (ISO day-of-week, period), and it carries its own duration.  A count
of periods is not a quantity of teaching time and this module never pretends
otherwise.

A cell also carries ``occurrences``: how many dates in the timetable's
effective window actually run it.  A date is in session iff a ``calendar_days``
row exists for (branch, date) and the relevant half is open; absence means not
in session.  That is why Friday P5 occurs 12 times in the demo tenant while
Monday P5 occurs 15 - three Fridays are ``event`` days with the afternoon shut.
**A cell with zero occurrences is not in the grid at all**, which is how
"Saturday has no fifth period" enters the model: as a missing variable, not as
a constraint.

The student unit is the *cohort*, not the section
-------------------------------------------------
Grade XI runs Physics, History and Commerce concurrently and a pupil attends
exactly one, so two slots for the same section in the same period are **not**
automatically a clash.  ``internal/service/timetable/clash.go`` gets this right
by intersecting the two offerings' student sets.  Restating that pairwise here
would be O(offerings^2) constraints saying the same thing many times, so
instead the export groups pupils by their *basket* of active subject offerings.
A cohort is one maximal set of pupils with identical enrolment; "at most one of
a cohort's offerings per cell" is exactly equivalent to the pairwise rule and,
in the demo tenant, is 12 groups rather than 103 pupils or 861 pairs.

Demand is an input, never an inference
--------------------------------------
``subject_offerings.periods_per_week`` is nullable and is in fact NULL for all
42 live offerings in the demo tenant.  :class:`Offering` keeps it ``Optional``
and :mod:`timetable_solver.preflight` refuses to solve without it rather than
inventing a number.
"""

from dataclasses import dataclass, field
from typing import FrozenSet, Mapping, Optional, Tuple

DayOfWeek = int
PeriodId = str
CellKey = Tuple[DayOfWeek, PeriodId]


# ---------------------------------------------------------------------------
# The grid
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Period:
    """One period of the scheme.  Carries no times - see the module docstring.

    id          opaque identifier (``periods.id``)
    code        school-facing code, e.g. "P1", "ASM"
    name        human label
    sequence    order within the day, 1-based, gapless across all kinds
    kind        "teaching" | "break" | "assembly" | "other".  Only "teaching"
                cells are placeable; ASM/BRK/LUN never are.
    """

    id: PeriodId
    code: str
    name: str
    sequence: int
    kind: str


@dataclass(frozen=True)
class Cell:
    """One placeable (day-of-week, period) pair, with what it is actually worth.

    day_of_week       ISO day of week, 1 = Monday .. 7 = Sunday
    period_id         Period.id
    bell_code         which bell schedule supplies the times on this day
    start_minute      minutes from midnight, from ``bell_schedule_periods``
    duration_minutes  end_minute - start_minute, **per bell schedule**
    occurrences       how many dates in the window actually run this cell
    """

    day_of_week: DayOfWeek
    period_id: PeriodId
    bell_code: str
    start_minute: int
    duration_minutes: int
    occurrences: int

    @property
    def key(self) -> CellKey:
        return (self.day_of_week, self.period_id)


# ---------------------------------------------------------------------------
# What gets placed, and who and what it needs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Section:
    id: str
    code: str
    name: str
    grade_name: str
    home_room_id: Optional[str] = None


@dataclass(frozen=True)
class Room:
    id: str
    code: str
    name: str
    room_type: str
    capacity: Optional[int] = None


@dataclass(frozen=True)
class Teacher:
    id: str
    code: str
    name: str


@dataclass(frozen=True)
class Offering:
    """One ``subject_offerings`` row: this subject, for this section.

    periods_per_week  the placement count.  ``None`` means the school has not
                      stated one; preflight refuses rather than guessing.
    minutes_per_week  the stated weekly obligation in **minutes**, to report
                      against.  ``None`` means no obligation was stated.  It is
                      never a substitute for periods_per_week: the two answer
                      different questions, and a 45-minute Monday period and a
                      40-minute Saturday period both count as one period.
    teacher_ids       every teacher eligible to take it, from
                      ``teacher_assignments``.  Empty means nobody is assigned.
    room_ids          every room it may use.  **Empty is legal** - a slot's
                      room may be null, so an unroomed offering is simply
                      exempt from the room constraint.
    heavy             whether this subject should avoid the last period of the
                      day.  A soft preference, never a hard exclusion.
    """

    id: str
    section_id: str
    subject_id: str
    subject_code: str
    subject_name: str
    periods_per_week: Optional[int] = None
    minutes_per_week: Optional[int] = None
    teacher_ids: Tuple[str, ...] = ()
    room_ids: Tuple[str, ...] = ()
    enrolled: int = 0
    is_elective: bool = False
    heavy: bool = False


@dataclass(frozen=True)
class Cohort:
    """A maximal set of pupils with identical active subject enrolment.

    key           stable identifier for the basket
    size          how many pupils are in it
    offering_ids  the basket itself; at most one of these may occupy a cell
    """

    key: str
    size: int
    offering_ids: Tuple[str, ...]


@dataclass(frozen=True)
class FixedPlacement:
    """A slot the solver may not move, but must schedule around.

    Assembly and other label-only slots arrive this way.  ``offering_id`` is
    ``None`` for them, and ``clash.go`` falls back to the whole section's roll
    in that case - so ``section_id`` is what consumes the pupils' time.
    """

    section_id: str
    period_id: PeriodId
    day_of_week: DayOfWeek
    label: Optional[str] = None
    offering_id: Optional[str] = None
    teacher_id: Optional[str] = None
    room_id: Optional[str] = None


@dataclass(frozen=True)
class School:
    """Everything the model needs, and nothing that only the database needs."""

    branch_id: str
    branch_name: str
    period_scheme_id: str
    timetable_id: Optional[str]
    window_lo: str
    window_hi: str
    weeks: int
    periods: Tuple[Period, ...]
    cells: Tuple[Cell, ...]
    sections: Tuple[Section, ...]
    rooms: Tuple[Room, ...]
    teachers: Tuple[Teacher, ...]
    offerings: Tuple[Offering, ...]
    cohorts: Tuple[Cohort, ...]
    fixed: Tuple[FixedPlacement, ...] = ()
    incumbent_room: Mapping[str, str] = field(default_factory=dict)
    incumbent_teacher: Mapping[str, str] = field(default_factory=dict)

    def period(self, period_id):
        for p in self.periods:
            if p.id == period_id:
                return p
        return None

    def section(self, section_id):
        for s in self.sections:
            if s.id == section_id:
                return s
        return None

    def offering(self, offering_id):
        for o in self.offerings:
            if o.id == offering_id:
                return o
        return None

    def label(self, offering_id: str) -> str:
        """Render an offering as "Class 8 B Mathematics" - what a core reads like."""
        off = self.offering(offering_id)
        if off is None:
            return offering_id
        sec = self.section(off.section_id)
        if sec is None:
            return off.subject_name
        return "%s %s %s" % (sec.grade_name, sec.name, off.subject_name)

    def teacher_name(self, teacher_id: str) -> str:
        for t in self.teachers:
            if t.id == teacher_id:
                return t.name
        return teacher_id

    def room_name(self, room_id: str) -> str:
        for r in self.rooms:
            if r.id == room_id:
                return r.name
        return room_id

    def cell_name(self, key: CellKey) -> str:
        day, period_id = key
        period = self.period(period_id)
        return "%s %s" % (DAY_NAMES[day], period.code if period else period_id)


#: ISO day-of-week -> English name.  Index 0 is unused; ISO days are 1..7.
DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
             "Saturday", "Sunday"]


# ---------------------------------------------------------------------------
# Configuration and results
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DailyContactRule:
    section_id: str
    offering_ids: Tuple[str, ...] = ()
    min_per_day: int = 1


@dataclass(frozen=True)
class SolveConfig:
    """Everything the caller may tune.

    Every weight is a **penalty, never a reward**.  A reward with the wrong
    sign is driven to zero and the constraints it was linearising go slack in
    silence - the precedent solver found exactly that error in its own build
    plan.  A penalty with the wrong sign shows up immediately in the output.

    demand              offering id -> periods per week, overriding the column
    pins                offering id -> {ISO day -> exactly this many periods on
                        that day}.  Schools do say "Games is on Friday", and
                        nothing in the schema can: there is no column anywhere
                        that ties an offering to a day of the week.  Without
                        this input the tightest true statement a diagnosis can
                        make about a teacher is a weekly one, because the
                        per-day bound collapses into the weekly bound - see
                        :mod:`timetable_solver.preflight`.
    unavailable         teacher id -> cells that teacher may not be used in
    required_room_type  subject code -> room_type the offering must occupy
    heavy_subjects      subject codes that should avoid the last period
    minutes_basis       how a placement is priced in minutes.  Defaults to
                        **"nominal"** - the bell-schedule length of the period,
                        which is what ``docs/DESIGN-NOTES.md`` says emerge-core
                        reports "placed" minutes as.  A solver that optimised
                        against a different figure from the one the product
                        shows would be quietly right and visibly wrong.
                        "realised" is the sharper number and divides the
                        window's actual occurrences by its weeks, so a Friday
                        afternoon that three event days close is worth less; it
                        comes out about 6% lower on the demo tenant.
    """

    max_seconds: float = 60.0
    num_workers: int = 8
    demand: Mapping[str, int] = field(default_factory=dict)
    pins: Mapping[str, Mapping[int, int]] = field(default_factory=dict)
    unavailable: Mapping[str, FrozenSet[CellKey]] = field(default_factory=dict)
    required_room_type: Mapping[str, str] = field(default_factory=dict)
    heavy_subjects: FrozenSet[str] = frozenset()
    minutes_basis: str = "nominal"
    daily_contact: Tuple[DailyContactRule, ...] = ()

    w_stack: int = 40
    w_last_period: int = 25
    w_teacher_gap: int = 30
    w_room_move: int = 60
    w_minutes_short: int = 8
    w_daily_contact: int = 200


@dataclass(frozen=True)
class Placement:
    """One decided slot, in the shape ``timetable_slots`` wants."""

    offering_id: str
    section_id: str
    day_of_week: DayOfWeek
    period_id: PeriodId
    teacher_id: Optional[str] = None
    room_id: Optional[str] = None


@dataclass(frozen=True)
class SoftViolation:
    kind: str
    key: str
    target: float
    actual: float
    amount: float
    message: str


@dataclass(frozen=True)
class SolveResult:
    """Honest about the difference between "optimal" and "shippable".

    A solve can return OPTIMAL while a subject is 90 minutes a week short of
    its stated obligation, because that obligation is soft.  ``verdict`` and
    ``soft_violations`` exist so "it said optimal" cannot be mistaken for "it
    is ready to publish".
    """

    status: str
    verdict: str
    placements: Tuple[Placement, ...] = ()
    objective: Optional[float] = None
    soft_violations: Tuple[SoftViolation, ...] = ()
    infeasibility_core: Tuple[str, ...] = ()
    core_explanation: str = ""
    wall_time_s: float = 0.0
    proven_optimal: bool = False
