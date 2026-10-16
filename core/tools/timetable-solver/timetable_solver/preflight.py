"""Faults findable without a solver at all, and the sentences they render as.

Standard library only.

Why this module exists, and why it runs first
---------------------------------------------
CP-SAT returns a reduced core from ``SufficientAssumptionsForInfeasibility``
only for conflicts that depend on the assumptions it was given.  An arithmetic
impossibility - a teacher owing more periods than the week contains - makes the
model infeasible *independently of any assumption*, so CP-SAT correctly hands
back an **empty** core for it, and a caller that only looked at the core would
report "infeasible, no explanation".  That is the least useful thing a
timetable generator can say.

The checks here are all O(offerings x cells) counting arguments, they run in
milliseconds, and they produce a strictly better sentence than a core would,
because they can do the arithmetic out loud: *"Vihaan Reddy is required for 37
periods a week and the week has 34."*  A core can only ever say which
requirements are jointly impossible, not by how much.

Every check is a **valid bound**, not a heuristic: each one is a constraint the
model provably implies, so a fault here is a proof of infeasibility and never a
false alarm.  The reverse does not hold - passing preflight does not make a
model feasible, which is what :func:`timetable_solver.solver.diagnose` is for.

Why "seven periods on Tuesday" needs an input the schema does not have
---------------------------------------------------------------------
"Mrs Rao is required for 7 periods on Tuesday and there are 6" is the sentence
worth producing, and the first attempt at it here was wrong in a way worth
recording.  The tempting derivation is that work which cannot go on any other
day must go on this one:

    forced(t, d)  >=  demand(t)  -  sum over other days of available(t, d')

but ``sum over other days`` is ``total - available(t, d)``, so the test
``forced(t, d) > available(t, d)`` reduces to ``demand(t) > total`` - which is
exactly the weekly bound, restated.  The per-day check could never fire on its
own.  A day-level statement is simply not derivable from a week-level
requirement, and **nothing in the tenant schema ties an offering to a day of
the week**: there is no such column on ``subject_offerings``, no teacher
availability table, and ``timetable_deviations`` pin to a date rather than a
weekday.

So the day-level demand arrives as an input instead:
``SolveConfig.pins`` says "this offering gets exactly this many periods on this
day", which is a thing schools actually say - Games on Friday, Assembly first.
With pins present the bound is real, because the demand on that day is now
known rather than inferred, and the sentence can be produced.  Without them the
honest strongest statement remains the weekly one.
"""

from typing import Dict, List, Mapping, Sequence, Set, Tuple

from .dto import CellKey, DAY_NAMES, School, SolveConfig


class Fault(object):
    """One proven impossibility: a stable key and a sentence a human can act on."""

    __slots__ = ("key", "kind", "message")

    def __init__(self, key, kind, message):
        # type: (str, str, str) -> None
        self.key = key
        self.kind = kind
        self.message = message

    def __repr__(self):
        return "Fault(%r, %r)" % (self.key, self.message)


def grid(school: School) -> Tuple[CellKey, ...]:
    """Every placeable cell, in bell order within ISO day order."""
    ordered = sorted(school.cells, key=lambda c: (c.day_of_week, c.start_minute))
    return tuple(c.key for c in ordered)


def lessons(count: int) -> str:
    return "%d lesson%s" % (count, "" if count == 1 else "s")


def contact_names(school: School, rule) -> Tuple[str, str]:
    section = school.section(rule.section_id)
    subjects = ", ".join(sorted(
        school.offering(offering_id).subject_name
        for offering_id in rule.offering_ids
        if school.offering(offering_id) is not None
    ))
    return (section.code if section is not None else rule.section_id,
            subjects or "that group")


def cells_of_day(school: School, day: int) -> Tuple[CellKey, ...]:
    return tuple(key for key in grid(school) if key[0] == day)


def available(school: School, teacher_id: str, config: SolveConfig) -> Set[CellKey]:
    """The cells a teacher may be used in, after their unavailability."""
    blocked = config.unavailable.get(teacher_id, frozenset())
    return {key for key in grid(school) if key not in blocked}


def demand_of(school: School, config: SolveConfig) -> Dict[str, int]:
    """Periods per week per offering, with the config override applied.

    Offerings with no stated demand are absent from the mapping rather than
    defaulted to zero: "nobody said" and "the school wants none of it" are
    different answers and only one of them is safe to act on.
    """
    out = {}  # type: Dict[str, int]
    for offering in school.offerings:
        value = config.demand.get(offering.id, offering.periods_per_week)
        if value is not None:
            out[offering.id] = int(value)
    return out


def check(school: School, config: SolveConfig) -> Tuple[Fault, ...]:
    """Every proven fault, cheapest and most specific first."""
    faults = []  # type: List[Fault]
    cells = grid(school)
    week = len(cells)
    demand = demand_of(school, config)

    faults.extend(_missing_inputs(school, config, demand))
    faults.extend(_offering_bounds(school, config, demand, week))
    faults.extend(_teacher_bounds(school, config, demand))
    faults.extend(_cohort_bounds(school, demand, week))
    faults.extend(_room_bounds(school, demand, week))
    faults.extend(_daily_contact_bounds(school, config, demand))
    return tuple(faults)


def _missing_inputs(school, config, demand):
    faults = []  # type: List[Fault]
    for offering in school.offerings:
        if offering.id not in demand:
            faults.append(Fault(
                "no_demand:%s" % offering.id,
                "no_demand",
                "%s has no periods_per_week, so there is nothing to schedule "
                "for it" % school.label(offering.id),
            ))
            continue
        if demand[offering.id] <= 0:
            continue
        if not offering.teacher_ids:
            faults.append(Fault(
                "no_teacher:%s" % offering.id,
                "no_teacher",
                "%s has no teacher assigned" % school.label(offering.id),
            ))
        if offering.subject_code in config.required_room_type and not offering.room_ids:
            faults.append(Fault(
                "no_room:%s" % offering.id,
                "no_room",
                "%s must be taught in a %s and the branch has none"
                % (school.label(offering.id),
                   config.required_room_type[offering.subject_code]),
            ))
    return faults


def _offering_bounds(school, config, demand, week):
    """An offering cannot want more periods than it has cells to put them in."""
    faults = []  # type: List[Fault]
    for offering in school.offerings:
        want = demand.get(offering.id, 0)
        if want <= 0 or not offering.teacher_ids:
            continue
        reachable = set()  # type: Set[CellKey]
        for teacher_id in offering.teacher_ids:
            reachable |= available(school, teacher_id, config)
        if want > len(reachable):
            faults.append(Fault(
                "demand:%s" % offering.id,
                "demand",
                "%s is asked for %d periods a week and only %d are open to it"
                % (school.label(offering.id), want, len(reachable)),
            ))
    return faults


def _teacher_bounds(school, config, demand):
    """A teacher cannot be in two places, so their week is a hard ceiling.

    Only offerings with a *single* eligible teacher count toward that teacher's
    committed load; an offering two people could take is not proof that either
    of them must take it.
    """
    faults = []  # type: List[Fault]
    committed = {}  # type: Dict[str, int]
    for offering in school.offerings:
        want = demand.get(offering.id, 0)
        if want <= 0 or len(offering.teacher_ids) != 1:
            continue
        committed[offering.teacher_ids[0]] = committed.get(offering.teacher_ids[0], 0) + want

    on_grid = set(grid(school))
    for placement in school.fixed:
        if placement.teacher_id and (placement.day_of_week, placement.period_id) in on_grid:
            committed[placement.teacher_id] = committed.get(placement.teacher_id, 0) + 1

    for teacher_id, want in sorted(committed.items()):
        free = available(school, teacher_id, config)
        if want > len(free):
            faults.append(Fault(
                "teacher_capacity:%s" % teacher_id,
                "teacher_capacity",
                "%s is required for %d periods a week and has %d available"
                % (school.teacher_name(teacher_id), want, len(free)),
            ))
            continue

    faults.extend(_pinned_day_bounds(school, config, demand, committed))
    return faults


def _pinned_day_bounds(school, config, demand, committed):
    """What a day-level requirement makes derivable that a weekly one does not.

    Only offerings the caller has actually pinned to a day contribute, because
    only those are known to fall on it; see the module docstring for why an
    unpinned week yields no day-level statement at all.
    """
    faults = []  # type: List[Fault]
    pinned_load = {}  # type: Dict[Tuple[str, int], int]
    for offering in school.offerings:
        per_day = config.pins.get(offering.id) or {}
        if not per_day or len(offering.teacher_ids) != 1:
            continue
        for day, count in per_day.items():
            key = (offering.teacher_ids[0], int(day))
            pinned_load[key] = pinned_load.get(key, 0) + int(count)

    for (teacher_id, day), want in sorted(pinned_load.items()):
        free = available(school, teacher_id, config)
        have = len([key for key in free if key[0] == day])
        if want > have:
            faults.append(Fault(
                "teacher_day_capacity:%s:%d" % (teacher_id, day),
                "teacher_day_capacity",
                "%s is required for %d periods on %s and there are %d"
                % (school.teacher_name(teacher_id), want, DAY_NAMES[day], have),
            ))

    pinned_cohort = {}  # type: Dict[Tuple[str, int], int]
    for cohort in school.cohorts:
        for offering_id in cohort.offering_ids:
            for day, count in (config.pins.get(offering_id) or {}).items():
                key = (cohort.key, int(day))
                pinned_cohort[key] = pinned_cohort.get(key, 0) + int(count)
    cells_per_day = {}  # type: Dict[int, int]
    for day, _period in grid(school):
        cells_per_day[day] = cells_per_day.get(day, 0) + 1
    by_key = {c.key: c for c in school.cohorts}
    for (cohort_key, day), want in sorted(pinned_cohort.items()):
        have = cells_per_day.get(day, 0)
        if want > have:
            cohort = by_key[cohort_key]
            faults.append(Fault(
                "cohort_day_capacity:%s:%d" % (cohort_key, day),
                "cohort_day_capacity",
                "the %d pupils taking that combination are owed %d periods on "
                "%s and there are %d" % (cohort.size, want, DAY_NAMES[day], have),
            ))

    for offering in school.offerings:
        per_day = config.pins.get(offering.id) or {}
        if not per_day:
            continue
        total = sum(int(v) for v in per_day.values())
        want = demand.get(offering.id)
        if want is not None and total > want:
            faults.append(Fault(
                "pin:%s" % offering.id,
                "pin",
                "%s is pinned to %d periods across the week but is only asked "
                "for %d" % (school.label(offering.id), total, want),
            ))
    return faults


def _cohort_bounds(school, demand, week):
    """A pupil cannot be in two places either, so their week is a ceiling too.

    This is the constraint that is easy to state wrongly.  The ceiling is *not*
    per section: Grade XI's Physics, History and Commerce run concurrently and
    together consume one period, not three.  It is per cohort - per set of
    pupils with identical enrolment - which is what makes the sum below the
    right sum.
    """
    faults = []  # type: List[Fault]
    on_grid = set(grid(school))
    fixed_by_section = {}  # type: Dict[str, int]
    for placement in school.fixed:
        if (placement.day_of_week, placement.period_id) not in on_grid:
            continue                       # assembly is not a teaching period
        fixed_by_section[placement.section_id] = fixed_by_section.get(placement.section_id, 0) + 1

    for cohort in school.cohorts:
        want = sum(demand.get(offering_id, 0) for offering_id in cohort.offering_ids)
        sections = {
            school.offering(offering_id).section_id
            for offering_id in cohort.offering_ids
            if school.offering(offering_id) is not None
        }
        want += sum(fixed_by_section.get(section_id, 0) for section_id in sections)
        if want > week:
            label = ", ".join(sorted(
                school.section(section_id).code
                for section_id in sections
                if school.section(section_id) is not None
            )) or cohort.key
            faults.append(Fault(
                "cohort_capacity:%s" % cohort.key,
                "cohort_capacity",
                "the %d pupils of %s taking that combination of subjects are "
                "owed %d periods a week and the week has %d"
                % (cohort.size, label, want, week),
            ))
    return faults


def _daily_contact_bounds(school, config, demand):
    faults = []  # type: List[Fault]
    cells_per_day = {}  # type: Dict[int, int]
    for day, _period in grid(school):
        cells_per_day[day] = cells_per_day.get(day, 0) + 1
    days = sorted(cells_per_day)

    for index, rule in enumerate(config.daily_contact):
        label, subjects = contact_names(school, rule)

        thin = [day for day in days if cells_per_day[day] < rule.min_per_day]
        if thin:
            faults.append(Fault(
                "daily_contact_day:%d:%s" % (index, rule.section_id),
                "daily_contact",
                "%s is owed %s a day of %s and %s has only %d"
                % (label, lessons(rule.min_per_day), subjects,
                   DAY_NAMES[thin[0]], cells_per_day[thin[0]]),
            ))
            continue

        if any(offering_id not in demand for offering_id in rule.offering_ids):
            continue
        supply = sum(demand[offering_id] for offering_id in rule.offering_ids)
        need = len(days) * rule.min_per_day
        if supply < need:
            faults.append(Fault(
                "daily_contact:%d:%s" % (index, rule.section_id),
                "daily_contact",
                "%s is owed %s a day of %s across %d teaching days, which is %d a "
                "week, and those are asked for only %d"
                % (label, lessons(rule.min_per_day), subjects, len(days),
                   need, supply),
            ))
    return faults


def _room_bounds(school, demand, week):
    """A room with only one claimant per offering is a ceiling on those."""
    faults = []  # type: List[Fault]
    committed = {}  # type: Dict[str, int]
    for offering in school.offerings:
        want = demand.get(offering.id, 0)
        if want <= 0 or len(offering.room_ids) != 1:
            continue
        committed[offering.room_ids[0]] = committed.get(offering.room_ids[0], 0) + want

    for room_id, want in sorted(committed.items()):
        if want > week:
            faults.append(Fault(
                "room_capacity:%s" % room_id,
                "room_capacity",
                "%s is needed for %d periods a week and the week has %d"
                % (school.room_name(room_id), want, week),
            ))
    return faults


#: Order the faults are read in.  Structural gaps first - an offering with no
#: teacher is a data problem and no amount of rearranging fixes it - then the
#: tightest resource, then the aggregate counting arguments, which are the ones
#: that repeat per section and would otherwise bury everything else.
FAULT_ORDER = ["no_demand", "no_teacher", "no_room", "pin", "daily_contact",
               "teacher_day_capacity", "cohort_day_capacity",
               "teacher_capacity", "room_capacity", "demand", "cohort_capacity"]


def render(faults: Sequence[Fault], limit: int = 8) -> str:
    """The same sentence shape the solver's core uses, so a caller cannot tell
    which stage found the problem - only what the problem is.

    Capped, because these checks repeat per section and per cohort by design:
    twelve near-identical cohort sentences are one finding, not twelve, and a
    reader who has to get past all of them to reach the one that names a room
    has been given a worse answer than a shorter one would have been.  Every
    fault is still in the keys.
    """
    if not faults:
        return ""
    ranked = sorted(
        faults,
        key=lambda f: (FAULT_ORDER.index(f.kind) if f.kind in FAULT_ORDER
                       else len(FAULT_ORDER), f.key),
    )
    clauses = []  # type: List[str]
    for fault in ranked:
        if fault.message not in clauses:
            clauses.append(fault.message)
    if len(clauses) == 1:
        return "This requirement cannot be met: %s." % (clauses[0],)
    shown, hidden = clauses[:limit], clauses[limit:]
    tail = "" if not hidden else ", and %d more" % len(hidden)
    return "These %d requirements cannot all hold at once: %s%s." % (
        len(clauses), "; ".join(shown), tail,
    )
