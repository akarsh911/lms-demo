"""Timetable generation with CP-SAT, and the two-solve infeasibility protocol.

**This is the one module in the package that is not standard-library only.**
It imports ``ortools``.  Everything else - the DTOs, the loader, preflight, the
independent verifier, the renderer - stays pure, so a caller can load a school,
check it for arithmetic impossibilities and audit a week that came from
somewhere else with no solver installed at all.  The exemption is one named
entry in ``tests/test_purity.py`` rather than a rule that quietly erodes.

The model
=========
The decision is ``x[o, c]`` = offering *o* occupies cell *c*, where a cell is
the pair (ISO day-of-week, period) and exists only if some date in the
timetable's effective window actually runs it.  That is where three of the
brief's hard requirements go in, and they go in as **missing variables rather
than constraints**, which is faster and clearer: ASM, BRK and LUN are not
teaching periods so they are not cells; Saturday has no fifth period because
``BELL-SAT`` does not define one; Sunday is not in session because no
``calendar_days`` row exists for it.  A constraint forcing those to zero would
be a constraint that can appear in an infeasibility core, and "Sunday does not
exist" is not a finding anyone can act on.

Two further families exist only when the school actually has a choice:
``a[o, t]`` picks the teacher when more than one is eligible, ``r[o, k]`` picks
the room when more than one is allowed.  Their products with ``x`` are the
linearising literals ``w[o, c, t]`` and ``z[o, c, k]``, tied down by
``sum_t w == x`` and ``w <= a`` rather than by a multiplication constraint.
In a school where every offering has exactly one eligible teacher the ``a``
family vanishes and ``w`` collapses onto ``x``, so the general model costs
nothing in the common case.

Room is chosen **per offering, not per period**: a class does not move room
between its own lessons, the teacher does.  That is a modelling decision and
not a fact about the schema; it shrinks the model by a factor of the grid and
it is what makes "keep this class where it already is" a single penalty rather
than one per period.

Hard, in the sense that no solution may violate them
----------------------------------------------------
  exact periods_per_week per offering · one teacher per offering · one room per
  offering where rooms are constrained at all · no teacher in two cells at once
  across every section · no room double-booked · **no cohort of pupils in two
  cells at once** · teacher unavailability.

The cohort rule is the subtle one and it is the one this project has got wrong
before.  Two slots for the same section in the same period are **not**
automatically a clash: Grade XI runs Physics, History and Commerce
concurrently and a pupil attends exactly one.  The real test, which
``internal/service/timetable/clash.go`` implements, is whether the two
offerings' student sets intersect.  Restating that pairwise would be
O(offerings^2) constraints saying the same thing repeatedly, so the export
groups pupils into cohorts - maximal sets with identical enrolment - and the
model says "at most one of a cohort's offerings per cell".  That is exactly
equivalent and, on the demo tenant, is 12 groups rather than 861 pairs.  It
also permits what the pairwise rule permits: French and Sanskrit, whose
enrolments are disjoint, may share a period.

Soft, as penalised slacks so the solver returns *something* rather than nothing
------------------------------------------------------------------------------
  stacking a subject twice in one day · a heavy subject in the last period ·
  moving a class out of the room it is already in · gaps in a teacher's day ·
  falling short of ``minutes_per_week`` · a section's daily contact with a named
  group of its offerings.

Every one is a **penalty on deviation, never a reward for compliance**.  The
precedent solver documents finding a sign error of exactly this kind in its own
build plan: under maximisation a reward with a negative coefficient is driven
to zero and the constraints linearising it go slack in silence.  A penalty
cannot fail that way - if the sign is wrong the output is visibly perverse.

Integer scaling
---------------
CP-SAT is an integer solver, and this model has exactly one genuinely
fractional quantity, so it is worth naming: **a weekly pattern slot does not
deliver its nominal duration.**  Monday period 5 runs on 15 of the window's 16
weeks; Friday period 5 runs on 12, because three Fridays are ``event`` days
with the afternoon shut; Saturday periods are 40 minutes and weekday periods
are 45.  So the average weekly minutes a placement is worth is
``occurrences * duration / weeks`` - 42.19 for Monday P1, 33.75 for Friday P5 -
and comparing that against a ``minutes_per_week`` obligation needs those
fractions.  They are scaled by :data:`SCALE` and never arrive as floats.
Counting ``periods_per_week`` needs none of this, which is precisely why the
brief is right that the two are different inputs.

The two-solve infeasibility protocol
====================================
CP-SAT returns a *reduced* core from ``SufficientAssumptionsForInfeasibility``
only under narrow conditions.  With ``num_workers > 1``, or an objective
present, it **silently degrades to handing back the entire assumption list** -
which is not an explanation, it is a restatement of the question, and it looks
exactly like a real answer.  So there are three stages with different jobs:

1. :func:`timetable_solver.preflight.check` - no solver at all.  Arithmetic
   impossibilities make the model infeasible independently of any assumption,
   so CP-SAT correctly returns an *empty* core for them.  Preflight catches
   them and says the arithmetic out loud, which is strictly better than a core:
   "Vihaan Reddy is required for 37 periods a week and has 34 available".
2. **Production** (:func:`solve`) - objective present, 8 workers, fast.
3. **Diagnosis** (:func:`diagnose`) - only on INFEASIBLE, objective cleared,
   ``num_workers = 1``, every tradeable constraint group behind one enforcement
   literal and those literals passed as assumptions.  Only this configuration
   yields a core small enough to render as a sentence.

What counts as tradeable is a judgement, and it is the judgement that decides
whether a core is useful.  A school can change how many periods a subject gets,
who teaches it, which rooms exist and when a teacher is available - so those
are gated.  A school cannot change that a child is one child: the cohort rule
stays hard even in diagnosis.  Gating it would also be expensive in the way the
precedent measured for ``slot_fill`` - a relaxed "at most one" lets a cohort
hold *any* number of lessons at once and the search space that opens up turns a
fast infeasibility proof into a timeout with no core at all.

Reading the status alone is not a verdict
=========================================
A solve can return OPTIMAL while a subject is 90 minutes a week short of its
stated obligation, because that obligation is soft.  Optimal means no better
objective exists, not that everything asked for holds.
:attr:`~timetable_solver.dto.SolveResult.verdict` and ``soft_violations`` exist
so that "it said optimal" cannot be mistaken for "it is ready to publish", and
they are recomputed from the returned week by the same functions the reporting
side would use, never read back off the model's slack variables.
"""

import time
from typing import Dict, List, Optional, Sequence, Set, Tuple

from ortools.sat.python import cp_model

from . import preflight
from . import school as school_mod
from .dto import (
    CellKey,
    DAY_NAMES,
    Placement,
    School,
    SoftViolation,
    SolveConfig,
    SolveResult,
)

#: re-exported from the pure layer.  Defined there because the reporting side
#: needs the same scaling and must not have to import a solver to get it.
SCALE = school_mod.SCALE

#: Constraint groups a school could plausibly change, and therefore the only
#: ones that can meaningfully appear in an infeasibility core.
TRADEABLE_KINDS = frozenset([
    "demand", "day_demand", "teacher_capacity", "room_capacity", "unavailable",
])

#: Structural groups: what it *means* to be a timetable.  A pupil is one pupil
#: and an offering has one teacher in one room; neither is a requirement anyone
#: can trade away, so both are noise in a core.  See the module docstring for
#: the second, practical reason.
STRUCTURAL_KINDS = frozenset(["cohort", "one_teacher", "one_room"])

#: Order a core is read in.  A core is a set, but a sentence is not: the scarce
#: resource is what a reader can act on, so it goes first and the demands that
#: compete for it follow.  Putting eleven identical-looking demand clauses ahead
#: of "the Science Laboratory cannot hold two classes at once" buries the answer.
CORE_ORDER = ["room_capacity", "teacher_capacity", "unavailable", "cohort",
              "one_room", "one_teacher", "day_demand", "demand"]

#: templates for rendering an infeasibility core as a human sentence
GROUP_TEMPLATES = {
    "demand": "%(key)s must get %(value)s a week",
    "day_demand": "%(key)s must get %(value)s",
    "teacher_capacity": "%(key)s cannot be in two places at once",
    "room_capacity": "%(key)s cannot hold two classes at once",
    "unavailable": "%(key)s is unavailable for %(value)s of the week's periods",
    "cohort": "a pupil cannot be in two places at once",
    "one_teacher": "%(key)s needs exactly one teacher",
    "one_room": "%(key)s needs exactly one room",
}


def _periods(value) -> str:
    """"1 period", "7 periods", "" - a core is read aloud, so it has to agree."""
    if value is None:
        return ""
    count = int(value)
    return "%d period%s" % (count, "" if count == 1 else "s")


class _Group(object):
    """One named constraint group, and its enforcement literal in diagnosis."""

    __slots__ = ("key", "kind", "label", "value", "literal")

    def __init__(self, key, kind, label, value):
        self.key = key
        self.kind = kind
        self.label = label
        self.value = value
        self.literal = None


class _Model(object):
    """The built model and the handles a caller needs to read it back."""

    __slots__ = ("model", "x", "a", "r", "groups", "cells", "demand", "weight")

    def __init__(self):
        self.model = None
        self.x = {}        # (offering_id, cell) -> BoolVar
        self.a = {}        # (offering_id, teacher_id) -> BoolVar or 1
        self.r = {}        # (offering_id, room_id) -> BoolVar or 1
        self.groups = []   # type: List[_Group]
        self.cells = ()    # type: Tuple[CellKey, ...]
        self.demand = {}   # type: Dict[str, int]
        self.weight = {}   # type: Dict[CellKey, int]


def minute_weight(school: School, config: SolveConfig) -> Dict[CellKey, int]:
    """:func:`timetable_solver.school.minute_weight`, keyed off the config."""
    return school_mod.minute_weight(school, config.minutes_basis)


def _preferred_room(school: School, offering) -> Optional[str]:
    """Where this class already is, or failing that where its teacher already is.

    "Prefer a teacher's existing room" is the brief's wording; an offering's own
    incumbent room is the sharper reading of it and is used first, because a
    teacher who moves between three classrooms has no single existing room while
    each of those classes does.
    """
    current = school.incumbent_room.get(offering.id)
    if current and current in offering.room_ids:
        return current
    teacher_rooms = {}  # type: Dict[str, int]
    for other in school.offerings:
        room_id = school.incumbent_room.get(other.id)
        if not room_id or room_id not in offering.room_ids:
            continue
        if set(other.teacher_ids) & set(offering.teacher_ids):
            teacher_rooms[room_id] = teacher_rooms.get(room_id, 0) + 1
    if not teacher_rooms:
        return None
    return max(sorted(teacher_rooms), key=lambda k: teacher_rooms[k])


def build(school: School,
          config: SolveConfig,
          diagnosis: bool = False,
          enabled_groups: Optional[Set[str]] = None) -> _Model:
    """Build the CP-SAT model.

    ``diagnosis=True`` wraps every **tradeable** constraint group in an
    enforcement literal, registers those literals as assumptions, and adds no
    objective - the only configuration in which CP-SAT returns a reduced core.
    Structural groups stay hard; see :data:`STRUCTURAL_KINDS`.

    ``enabled_groups`` restricts which tradeable groups are added at all, which
    is what the deletion filter in :func:`_minimise_core` needs.

    The two models are otherwise **structurally identical**, including the
    variables that unavailability will pin to zero.  A diagnosis model that
    omitted them would be diagnosing a different problem from the one
    production failed on, and would be free to explain a conflict production
    never had.
    """
    built = _Model()
    model = cp_model.CpModel()
    built.model = model
    built.cells = preflight.grid(school)
    built.demand = preflight.demand_of(school, config)
    built.weight = minute_weight(school, config)

    cells_by_day = {}  # type: Dict[int, List[CellKey]]
    for key in built.cells:
        cells_by_day.setdefault(key[0], []).append(key)

    groups = built.groups

    def group_for(kind, key="", label="", value=None):
        full = kind if not key else "%s:%s" % (kind, key)
        for existing in groups:
            if existing.key == full:
                return existing
        return _Group(full, kind, label or key, value)

    def gated(group):
        if not diagnosis or group.kind not in TRADEABLE_KINDS:
            return False
        return enabled_groups is None or group.key in enabled_groups

    def skipped(group):
        return (diagnosis
                and group.kind in TRADEABLE_KINDS
                and enabled_groups is not None
                and group.key not in enabled_groups)

    off = []

    def off_literal():
        """A literal fixed to false, used to neutralise a switched-off group."""
        if not off:
            lit = model.NewBoolVar("_off")
            model.Add(lit == 0)
            off.append(lit)
        return off[0]

    def add(group, constraint):
        if group not in groups:
            groups.append(group)
        if skipped(group):
            constraint.OnlyEnforceIf(off_literal())
            return
        if gated(group):
            if group.literal is None:
                group.literal = model.NewBoolVar("g_%s" % (group.key,))
            constraint.OnlyEnforceIf(group.literal)

    scheduled = [o for o in school.offerings if built.demand.get(o.id, 0) > 0]

    for offering in scheduled:
        for key in built.cells:
            built.x[(offering.id, key)] = model.NewBoolVar(
                "x_%s_%d_%s" % (offering.id[:8], key[0], key[1][:8]))

    # -- teacher choice, and its product with placement ----------------------
    w = {}  # (offering_id, cell, teacher_id) -> literal
    for offering in scheduled:
        teachers = list(offering.teacher_ids)
        if len(teachers) == 1:
            built.a[(offering.id, teachers[0])] = 1
            for key in built.cells:
                w[(offering.id, key, teachers[0])] = built.x[(offering.id, key)]
            continue
        if not teachers:
            continue
        for teacher_id in teachers:
            built.a[(offering.id, teacher_id)] = model.NewBoolVar(
                "a_%s_%s" % (offering.id[:8], teacher_id[:8]))
        add(
            group_for("one_teacher", offering.id, school.label(offering.id)),
            model.Add(sum(built.a[(offering.id, t)] for t in teachers) == 1),
        )
        for key in built.cells:
            literals = []
            for teacher_id in teachers:
                lit = model.NewBoolVar(
                    "w_%s_%d_%s" % (offering.id[:8], key[0], teacher_id[:8]))
                model.Add(lit <= built.a[(offering.id, teacher_id)])
                model.Add(lit <= built.x[(offering.id, key)])
                w[(offering.id, key, teacher_id)] = lit
                literals.append(lit)
            model.Add(sum(literals) == built.x[(offering.id, key)])

    # -- room choice, and its product with placement -------------------------
    z = {}  # (offering_id, cell, room_id) -> literal
    for offering in scheduled:
        rooms = list(offering.room_ids)
        if not rooms:
            continue                       # unroomed is legal; see dto.Offering
        if len(rooms) == 1:
            built.r[(offering.id, rooms[0])] = 1
            for key in built.cells:
                z[(offering.id, key, rooms[0])] = built.x[(offering.id, key)]
            continue
        for room_id in rooms:
            built.r[(offering.id, room_id)] = model.NewBoolVar(
                "r_%s_%s" % (offering.id[:8], room_id[:8]))
        add(
            group_for("one_room", offering.id, school.label(offering.id)),
            model.Add(sum(built.r[(offering.id, k)] for k in rooms) == 1),
        )
        for key in built.cells:
            literals = []
            for room_id in rooms:
                lit = model.NewBoolVar(
                    "z_%s_%d_%s" % (offering.id[:8], key[0], room_id[:8]))
                model.Add(lit <= built.r[(offering.id, room_id)])
                model.Add(lit <= built.x[(offering.id, key)])
                z[(offering.id, key, room_id)] = lit
                literals.append(lit)
            model.Add(sum(literals) == built.x[(offering.id, key)])

    # -- hard: exact periods per week ----------------------------------------
    for offering in scheduled:
        want = built.demand[offering.id]
        add(
            group_for("demand", offering.id, school.label(offering.id), want),
            model.Add(sum(built.x[(offering.id, key)] for key in built.cells) == want),
        )

    # -- hard: days the caller has pinned ------------------------------------
    # The only way a day-level requirement can enter the model, because the
    # schema has no column that ties an offering to a weekday.  Gated as its
    # own tradeable group: "Games must be on Friday" is exactly the kind of
    # thing a school will trade away once it sees what it costs.
    for offering in scheduled:
        for day, count in sorted((config.pins.get(offering.id) or {}).items()):
            keys = [key for key in built.cells if key[0] == int(day)]
            if not keys:
                continue
            add(
                group_for("day_demand", "%s:%s" % (offering.id, day),
                          "%s on %s" % (school.label(offering.id), DAY_NAMES[int(day)]),
                          count),
                model.Add(sum(built.x[(offering.id, key)] for key in keys) == int(count)),
            )

    # -- hard: teacher unavailability ----------------------------------------
    for teacher_id, blocked in sorted(config.unavailable.items()):
        terms = [
            w[(offering.id, key, teacher_id)]
            for offering in scheduled
            for key in built.cells
            if key in blocked and (offering.id, key, teacher_id) in w
        ]
        if not terms:
            continue
        add(
            group_for("unavailable", teacher_id,
                      school.teacher_name(teacher_id), len(blocked)),
            model.Add(sum(terms) == 0),
        )

    # -- what the fixed slots have already taken -----------------------------
    fixed_teacher = {}   # type: Dict[Tuple[str, CellKey], int]
    fixed_room = {}      # type: Dict[Tuple[str, CellKey], int]
    fixed_section = {}   # type: Dict[Tuple[str, CellKey], int]
    for placement in school.fixed:
        key = (placement.day_of_week, placement.period_id)
        if key not in built.weight:
            continue                       # assembly sits outside the grid
        if placement.teacher_id:
            fixed_teacher[(placement.teacher_id, key)] = 1
        if placement.room_id:
            fixed_room[(placement.room_id, key)] = 1
        fixed_section[(placement.section_id, key)] = \
            fixed_section.get((placement.section_id, key), 0) + 1

    # -- hard: one teacher, one cell, across every section at once ------------
    for teacher in school.teachers:
        group = group_for("teacher_capacity", teacher.id, teacher.name)
        for key in built.cells:
            terms = [
                w[(offering.id, key, teacher.id)]
                for offering in scheduled
                if (offering.id, key, teacher.id) in w
            ]
            if len(terms) + fixed_teacher.get((teacher.id, key), 0) < 2:
                continue
            add(group, model.Add(
                sum(terms) <= 1 - fixed_teacher.get((teacher.id, key), 0)))

    # -- hard: one room, one cell --------------------------------------------
    for room in school.rooms:
        group = group_for("room_capacity", room.id, room.name)
        for key in built.cells:
            terms = [
                z[(offering.id, key, room.id)]
                for offering in scheduled
                if (offering.id, key, room.id) in z
            ]
            if len(terms) + fixed_room.get((room.id, key), 0) < 2:
                continue
            add(group, model.Add(
                sum(terms) <= 1 - fixed_room.get((room.id, key), 0)))

    # -- hard: no cohort of pupils in two cells at once -----------------------
    for cohort in school.cohorts:
        members = [o for o in scheduled if o.id in set(cohort.offering_ids)]
        if len(members) < 2:
            continue
        sections = {o.section_id for o in members}
        group = group_for("cohort", cohort.key, cohort.key, cohort.size)
        room = {
            key: max(0, 1 - sum(fixed_section.get((s, key), 0) for s in sections))
            for key in built.cells
        }
        # When a cohort's demand exactly fills the cells left to it, every one
        # of those "at most one" constraints is tight and the equality is a
        # valid deduction rather than an extra requirement.  It is worth adding
        # because it tells the solver this week has no free periods at all,
        # which on the demo tenant is the truth.
        #
        # **Never in the diagnosis model.**  The deduction is valid only while
        # the demand constraints it was derived from are enforced, and
        # diagnosis relaxes exactly those - at which point a redundant
        # constraint silently becomes a requirement nobody asked for, and the
        # core explains a conflict production never had.  Measured: with the
        # equality left in, diagnosis returned a sufficient and irreducible
        # eight-group core about French on Saturday for an instance whose
        # actual conflict was laboratory capacity.  A diagnosis model must be
        # no stricter than the production model it is explaining.
        exact = (not diagnosis
                 and sum(built.demand[o.id] for o in members) == sum(room.values()))
        for key in built.cells:
            terms = sum(built.x[(o.id, key)] for o in members)
            add(group, model.Add(terms == room[key]) if exact and room[key]
                else model.Add(terms <= room[key]))

    if diagnosis:
        literals = [g.literal for g in groups if g.literal is not None]
        if literals:
            model.AddAssumptions(literals)
        return built

    model.Minimize(sum(_penalties(school, config, built, w, cells_by_day)))
    return built


def _penalties(school, config, built, w, cells_by_day):
    """Every soft term, as a penalty on deviation.  See the module docstring for
    why none of them is expressed as a reward."""
    model = built.model
    terms = []

    horizon = len(built.cells)
    scheduled = [o for o in school.offerings if built.demand.get(o.id, 0) > 0]

    # -- soft: do not stack a subject twice in one day ------------------------
    for offering in scheduled:
        for day, keys in sorted(cells_by_day.items()):
            stack = model.NewIntVar(0, len(keys), "stack_%s_%d" % (offering.id[:8], day))
            model.Add(stack >= sum(built.x[(offering.id, k)] for k in keys) - 1)
            terms.append(config.w_stack * SCALE * stack)

    # -- soft: keep a heavy subject out of the last period of the day ---------
    for offering in scheduled:
        if not offering.heavy:
            continue
        for day, keys in sorted(cells_by_day.items()):
            terms.append(config.w_last_period * SCALE * built.x[(offering.id, keys[-1])])

    # -- soft: leave a class in the room it is already in ---------------------
    for offering in scheduled:
        if len(offering.room_ids) < 2:
            continue
        preferred = _preferred_room(school, offering)
        if preferred is None:
            continue
        moved = model.NewBoolVar("moved_%s" % offering.id[:8])
        model.Add(moved == 1 - built.r[(offering.id, preferred)])
        terms.append(config.w_room_move * SCALE * moved)

    # -- soft: no holes in a teacher's day ------------------------------------
    # A teacher's idle periods are exactly
    #     (last busy period - first busy period + 1) - (periods taught)
    # which is one integer per teacher per day.  An empty day leaves first
    # above last, the expression goes negative, and the non-negative slack
    # simply reads zero.
    #
    # **This term is what makes the model hard, and the measurement is worth
    # recording because it is not obvious.**  On the 42-offering demo tenant,
    # with every other soft term unchanged and this one removed, CP-SAT proves
    # OPTIMAL in 0.8 seconds at objective 96000.  With it, the same instance is
    # still FEASIBLE-only after 120 seconds with a best bound near 99000 and an
    # incumbent near 138000 - a 28% gap.  The first formulation tried here was
    # the obvious one, a boolean per period saying "busy either side of me and
    # idle myself"; replacing it with the span-minus-load form above improved
    # the incumbent slightly and **did not move the bound**, so the difficulty
    # is the requirement and not the encoding.  That is a real product
    # decision, not a tuning detail: contiguity is the one preference here that
    # costs proven optimality, so it is a weight a caller can set to zero.
    for teacher in school.teachers:
        for day, keys in sorted(cells_by_day.items()):
            busy = []
            for key in keys:
                present = [
                    w[(o.id, key, teacher.id)]
                    for o in scheduled
                    if (o.id, key, teacher.id) in w
                ]
                if not present:
                    busy.append(None)
                    continue
                flag = model.NewBoolVar("busy_%s_%d_%s" % (teacher.id[:8], day, key[1][:6]))
                model.Add(flag == sum(present))
                busy.append(flag)

            live = [(index, flag) for index, flag in enumerate(busy) if flag is not None]
            if len(live) < 3:
                continue
            span = len(keys)
            starts, ends = [], []
            for index, flag in live:
                first_i = model.NewIntVar(0, span, "fst_%s_%d_%d" % (teacher.id[:8], day, index))
                model.Add(first_i == index).OnlyEnforceIf(flag)
                model.Add(first_i == span).OnlyEnforceIf(flag.Not())
                starts.append(first_i)

                last_i = model.NewIntVar(-1, span, "lst_%s_%d_%d" % (teacher.id[:8], day, index))
                model.Add(last_i == index).OnlyEnforceIf(flag)
                model.Add(last_i == -1).OnlyEnforceIf(flag.Not())
                ends.append(last_i)

            first = model.NewIntVar(0, span, "first_%s_%d" % (teacher.id[:8], day))
            last = model.NewIntVar(-1, span, "last_%s_%d" % (teacher.id[:8], day))
            model.AddMinEquality(first, starts)
            model.AddMaxEquality(last, ends)

            holes = model.NewIntVar(0, span, "holes_%s_%d" % (teacher.id[:8], day))
            model.Add(holes >= last - first + 1 - sum(flag for _i, flag in live))
            terms.append(config.w_teacher_gap * SCALE * holes)

    for index, rule in enumerate(config.daily_contact):
        members = [o for o in scheduled if o.id in set(rule.offering_ids)]
        if not members:
            continue
        for day, keys in sorted(cells_by_day.items()):
            missed = model.NewIntVar(0, rule.min_per_day,
                                     "contact_%d_%d" % (index, day))
            model.Add(missed >= rule.min_per_day - sum(
                built.x[(o.id, key)] for o in members for key in keys))
            terms.append(config.w_daily_contact * SCALE * missed)

    # -- soft: meet the stated weekly minutes ---------------------------------
    for offering in scheduled:
        if not offering.minutes_per_week:
            continue
        required = int(offering.minutes_per_week) * SCALE
        delivered = sum(
            built.weight[key] * built.x[(offering.id, key)] for key in built.cells
        )
        short = model.NewIntVar(0, required, "short_%s" % offering.id[:8])
        model.Add(short >= required - delivered)
        terms.append(config.w_minutes_short * short)

    if not terms:
        terms.append(model.NewConstant(0))
    return terms


# ---------------------------------------------------------------------------
# Soft-violation evaluation - computed from the week, not from the model
# ---------------------------------------------------------------------------


def evaluate_soft(school: School,
                  placements: Sequence[Placement],
                  config: SolveConfig) -> Tuple[SoftViolation, ...]:
    """Which soft preferences the returned week actually misses.

    Deliberately recomputed from the placements rather than read back off the
    model's slack variables: if the model and the report ever disagree, this is
    the number a head of timetabling sees, and it should be the report's.
    """
    violations = []  # type: List[SoftViolation]
    weight = minute_weight(school, config)

    by_offering = {}  # type: Dict[str, List[Placement]]
    for placement in placements:
        by_offering.setdefault(placement.offering_id, []).append(placement)

    for offering in school.offerings:
        mine = by_offering.get(offering.id, [])
        if not mine:
            continue

        per_day = {}  # type: Dict[int, int]
        for placement in mine:
            per_day[placement.day_of_week] = per_day.get(placement.day_of_week, 0) + 1
        stacked = sum(max(0, n - 1) for n in per_day.values())
        if stacked:
            violations.append(SoftViolation(
                kind="stacked", key=offering.id, target=0.0, actual=float(stacked),
                amount=float(stacked),
                message="%s is doubled up on %d day(s)"
                        % (school.label(offering.id), stacked)))

        if offering.minutes_per_week:
            delivered = sum(
                weight[(p.day_of_week, p.period_id)] for p in mine) / float(SCALE)
            if delivered + 1e-9 < offering.minutes_per_week:
                violations.append(SoftViolation(
                    kind="minutes_short", key=offering.id,
                    target=float(offering.minutes_per_week), actual=delivered,
                    amount=offering.minutes_per_week - delivered,
                    message="%s delivers %.1f minutes a week against the %d it owes"
                            % (school.label(offering.id), delivered,
                               offering.minutes_per_week)))

        preferred = _preferred_room(school, offering)
        if preferred and any(p.room_id and p.room_id != preferred for p in mine):
            actual = next(p.room_id for p in mine if p.room_id)
            violations.append(SoftViolation(
                kind="room_move", key=offering.id, target=0.0, actual=1.0, amount=1.0,
                message="%s moves from %s to %s"
                        % (school.label(offering.id), school.room_name(preferred),
                           school.room_name(actual))))

    days = sorted({cell.day_of_week for cell in school.cells})
    for index, rule in enumerate(config.daily_contact):
        wanted = set(rule.offering_ids)
        held = {}  # type: Dict[int, int]
        for placement in placements:
            if placement.offering_id in wanted:
                held[placement.day_of_week] = held.get(placement.day_of_week, 0) + 1
        label, subjects = preflight.contact_names(school, rule)
        for day in days:
            have = held.get(day, 0)
            if have >= rule.min_per_day:
                continue
            violations.append(SoftViolation(
                kind="daily_contact",
                key="%d:%s:%d" % (index, rule.section_id, day),
                target=float(rule.min_per_day), actual=float(have),
                amount=float(rule.min_per_day - have),
                message="%s is owed %s from %s on %s and has %d"
                        % (label, preflight.lessons(rule.min_per_day), subjects,
                           DAY_NAMES[day], have)))

    last_of_day = {}  # type: Dict[int, str]
    for cell in school.cells:
        current = last_of_day.get(cell.day_of_week)
        if current is None or cell.start_minute > current[0]:
            last_of_day[cell.day_of_week] = (cell.start_minute, cell.period_id)
    for placement in placements:
        offering = school.offering(placement.offering_id)
        if offering is None or not offering.heavy:
            continue
        last = last_of_day.get(placement.day_of_week)
        if last and placement.period_id == last[1]:
            violations.append(SoftViolation(
                kind="last_period", key=offering.id, target=0.0, actual=1.0, amount=1.0,
                message="%s falls in the last period of %s"
                        % (school.label(offering.id), DAY_NAMES[placement.day_of_week])))

    return tuple(violations)


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------


def render_core(core_keys: Sequence[str], groups: Sequence[_Group],
                limit: int = 8) -> str:
    """Render an infeasibility core as one sentence, from pre-authored templates."""
    if not core_keys:
        return ""
    by_key = {g.key: g for g in groups}
    ranked = sorted(
        core_keys,
        key=lambda k: (CORE_ORDER.index(by_key[k].kind)
                       if k in by_key and by_key[k].kind in CORE_ORDER
                       else len(CORE_ORDER), k),
    )
    clauses = []  # type: List[str]
    for key in ranked:
        group = by_key.get(key)
        if group is None:
            clauses.append(key)
            continue
        template = GROUP_TEMPLATES.get(group.kind, "%(key)s")
        clauses.append(template % {
            "key": group.label,
            "value": _periods(group.value),
        })
    unique = []  # type: List[str]
    for clause in clauses:
        if clause not in unique:
            unique.append(clause)
    if len(unique) == 1:
        return "This requirement cannot be met: %s." % (unique[0],)
    shown, hidden = unique[:limit], unique[limit:]
    tail = "" if not hidden else ", and %d more" % len(hidden)
    return "These %d requirements cannot all hold at once: %s%s." % (
        len(unique), "; ".join(shown), tail,
    )


def _infeasible_with(school, config, enabled) -> bool:
    """Is the model infeasible with only ``enabled`` tradeable groups switched on?"""
    built = build(school, config, diagnosis=True, enabled_groups=enabled)
    built.model.ClearObjective()
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.max_time_in_seconds = max(1.0, config.max_seconds)
    return solver.Solve(built.model) == cp_model.INFEASIBLE


def _minimise_core(school, config, candidates) -> Tuple[str, ...]:
    """Deletion filter: drop groups one at a time while infeasibility survives.

    Returns an **irreducible** core - remove any member and the rest becomes
    satisfiable.  Costs one solve per candidate group.  This is the fallback for
    when the assumption solve declines to produce a usable core, which it does
    for two reasons: it can hand back the whole list, and with the model relaxed
    enough it can simply time out at UNKNOWN.  "Infeasible, no explanation" is
    the least useful thing this service can say, so there is a deterministic
    fallback rather than a shrug.
    """
    keep = set(candidates)
    for key in sorted(candidates):
        trial = keep - {key}
        if _infeasible_with(school, config, trial):
            keep = trial
    return tuple(sorted(keep))


def diagnose(school: School, config: SolveConfig,
             max_core_solves: int = 60) -> Tuple[Tuple[str, ...], str]:
    """The second solve: objective cleared, one worker, assumptions declared.

    Returns ``(core_keys, rendered_sentence)``.  Three stages in order of cost,
    and the first of them does not need a solver; see the module docstring.
    """
    faults = preflight.check(school, config)
    if faults:
        return tuple(f.key for f in faults), preflight.render(faults)

    built = build(school, config, diagnosis=True)
    built.model.ClearObjective()

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1                 # NOT negotiable, see above
    solver.parameters.max_time_in_seconds = max(1.0, config.max_seconds)
    status = solver.Solve(built.model)
    if status not in (cp_model.INFEASIBLE, cp_model.UNKNOWN):
        return (), ""

    tradeable = [g.key for g in built.groups if g.kind in TRADEABLE_KINDS]
    core = ()  # type: Tuple[str, ...]
    if status == cp_model.INFEASIBLE:
        by_index = {g.literal.Index(): g for g in built.groups if g.literal is not None}
        indices = solver.SufficientAssumptionsForInfeasibility()
        core = tuple(by_index[i].key for i in indices if i in by_index)

    if not core or len(core) == len(tradeable) > 1:
        if not tradeable:
            return (), ""
        if not _infeasible_with(school, config, set(tradeable)):
            return (), ""
        core = tuple(tradeable)

    # Always shrink, never just report.  ``SufficientAssumptionsForInfeasibility``
    # returns a *sufficient* set, not an irreducible one, and the difference
    # shows up as clauses a reader has to discard: on the laboratory instance it
    # handed back 23 groups where 13 were enough.  One extra solve per candidate
    # buys a core where removing any member makes the week possible again, which
    # is the property that lets the sentence be read as advice.
    if 1 < len(core) <= max_core_solves:
        core = _minimise_core(school, config, list(core))

    return core, render_core(core, built.groups)


# ---------------------------------------------------------------------------
# Production solve
# ---------------------------------------------------------------------------


def _verdict(status_name: str, violations: Sequence[SoftViolation]) -> str:
    if status_name == "OPTIMAL":
        return "optimal_with_violations" if violations else "optimal_clean"
    if status_name == "FEASIBLE":
        return "feasible_not_proven"
    if status_name == "INFEASIBLE":
        return "infeasible"
    return "unknown"


def solve(school: School,
          config: Optional[SolveConfig] = None,
          hint: Sequence[Placement] = (),
          diagnose_on_infeasible: bool = True) -> SolveResult:
    """Production solve: objective present, parallel, and honest about the result.

    ``hint`` is a previous week.  CP-SAT is stateless between solves, so hinting
    the last answer is the only way a re-solve benefits from it - which matters
    here more than it does for a paper, because a school that has published a
    week wants the next version to look like it.

    On INFEASIBLE this runs :func:`diagnose` and attaches the core, because an
    infeasible verdict with no explanation is the least useful thing a solver
    can tell a head of timetabling.
    """
    cfg = config or SolveConfig()
    started = time.time()

    faults = preflight.check(school, cfg)
    if faults:
        return SolveResult(
            status="INFEASIBLE",
            verdict="infeasible",
            infeasibility_core=tuple(f.key for f in faults),
            core_explanation=preflight.render(faults),
            wall_time_s=time.time() - started,
        )

    built = build(school, cfg, diagnosis=False)

    for placement in hint:
        key = (placement.offering_id, (placement.day_of_week, placement.period_id))
        if key in built.x:
            built.model.AddHint(built.x[key], 1)

    solver = cp_model.CpSolver()
    solver.parameters.num_workers = max(1, cfg.num_workers)
    solver.parameters.max_time_in_seconds = cfg.max_seconds
    status = solver.Solve(built.model)
    status_name = solver.StatusName(status)
    elapsed = time.time() - started

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placements = _read_back(school, built, solver)
        violations = evaluate_soft(school, placements, cfg)
        return SolveResult(
            status=status_name,
            verdict=_verdict(status_name, violations),
            placements=placements,
            objective=solver.ObjectiveValue(),
            soft_violations=violations,
            wall_time_s=elapsed,
            proven_optimal=(status == cp_model.OPTIMAL),
        )

    core = ()  # type: Tuple[str, ...]
    sentence = ""
    if status == cp_model.INFEASIBLE and diagnose_on_infeasible:
        core, sentence = diagnose(school, cfg)

    return SolveResult(
        status=status_name,
        verdict=_verdict(status_name, ()),
        infeasibility_core=core,
        core_explanation=sentence,
        wall_time_s=time.time() - started,
    )


def _read_back(school: School, built: _Model, solver) -> Tuple[Placement, ...]:
    """The solution, as slots.  Section comes from the offering, never guessed."""
    by_id = {o.id: o for o in school.offerings}
    order = {cell.key: (cell.day_of_week, cell.start_minute) for cell in school.cells}
    out = []  # type: List[Placement]
    for (offering_id, key), var in built.x.items():
        if not solver.Value(var):
            continue
        offering = by_id[offering_id]
        teacher_id = None
        for candidate in offering.teacher_ids:
            handle = built.a.get((offering_id, candidate))
            if handle is None:
                continue
            if isinstance(handle, int) or solver.Value(handle):
                teacher_id = candidate
                break
        room_id = None
        for candidate in offering.room_ids:
            handle = built.r.get((offering_id, candidate))
            if handle is None:
                continue
            if isinstance(handle, int) or solver.Value(handle):
                room_id = candidate
                break
        out.append(Placement(
            offering_id=offering_id,
            section_id=offering.section_id,
            day_of_week=key[0],
            period_id=key[1],
            teacher_id=teacher_id,
            room_id=room_id,
        ))
    out.sort(key=lambda p: (order.get((p.day_of_week, p.period_id), (p.day_of_week, 0)),
                            p.section_id, p.offering_id))
    return tuple(out)
