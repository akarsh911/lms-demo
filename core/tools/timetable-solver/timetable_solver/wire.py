"""The HTTP request and response shapes, and nothing that needs a solver.

Standard library only, and deliberately so.  Parsing a request, validating it,
and rendering a refusal are all things that must work on a box with no ortools
on it - which is what lets the contract be tested without a solve, and what
keeps ``tests/test_purity.py`` able to say that exactly one module imports a
solver.  :mod:`timetable_solver.solver` is called *between* :func:`parse_solve`
and :func:`solve_response`; this module never imports it.

The contract itself is in ``docs/DESIGN-NOTES.md`` under *Automatic timetable
generation*.  Three decisions in it are enforced here rather than by the server,
because they are properties of the request and not of the transport.

The ceiling is the service's, not the caller's
----------------------------------------------
``max_seconds`` is a caller input so that a six-section school can be told to
take fifteen seconds and a sixty-section school ninety.  It is clamped to
:data:`CEILING_SECONDS` here, so a caller cannot ask for an unbounded solve by
sending a large number, and cannot ask for a zero-second one by sending a small
one.  Clamping rather than refusing is the right shape: the caller asked for a
week within a budget, and the service's answer to "may I have twenty minutes"
is a week in two, not an error.

A missing number and a zero are different answers
-------------------------------------------------
Every optional field is absent-means-default; a present field is taken at its
word and validated.  ``demand`` of 0 for an offering means the school wants none
of it this week, and is not the same as omitting the offering, which means the
school has not said.  :mod:`timetable_solver.preflight` relies on that
distinction and refuses to guess, so the parser must not collapse them.

The wire speaks emerge-core's vocabulary, not the model's
---------------------------------------------------------
A returned slot is ``subject_offering_id``, never ``offering_id``, because the
week is going into ``timetable_slots`` and ``timetable.Proposal`` on the Go side
already has those field names.  ``ref`` is that struct's ``Ref``: it is what
lets a clash emerge-core's own checker finds name the slot it came from.  The
hint accepts either spelling, because ``export.sql`` writes ``current_slots``
with the model's name and emerge-core sends the product's.
"""

from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from . import preflight, school as school_mod
from .dto import DailyContactRule, Placement, School, SolveConfig

#: The longest solve the service will run, whatever the caller asks for.
CEILING_SECONDS = 120.0

#: The shortest.  A solve given no time at all returns UNKNOWN and looks like a
#: service fault rather than the caller's own budget.
FLOOR_SECONDS = 1.0

#: CP-SAT parallelism.  Capped because the workers are the service's CPUs, not
#: the caller's, and one caller asking for 64 would starve every other.
MAX_WORKERS = 16

MINUTES_BASES = ("nominal", "realised")

#: ``SolveConfig`` field per wire weight name.  Named here so an unknown weight
#: is a refusal rather than a silently ignored request: a caller who sets
#: "teacher_gaps" and gets a week full of gaps has been lied to.
WEIGHT_FIELDS = {
    "stack": "w_stack",
    "last_period": "w_last_period",
    "teacher_gap": "w_teacher_gap",
    "room_move": "w_room_move",
    "minutes_short": "w_minutes_short",
    "daily_contact": "w_daily_contact",
}


class BadRequest(Exception):
    """A request this service will not try to answer.  Renders as 400."""


class Request(object):
    """One parsed ``/v1/solve`` or ``/v1/feasibility`` body."""

    __slots__ = ("request_id", "school", "config", "hint")

    def __init__(self, request_id, school, config, hint):
        # type: (str, School, SolveConfig, Tuple[Placement, ...]) -> None
        self.request_id = request_id
        self.school = school
        self.config = config
        self.hint = hint


def parse(body: Any) -> Request:
    """Validate a request body and build the school, config and hint from it."""
    if not isinstance(body, dict):
        raise BadRequest("the request body must be a JSON object")

    request_id = _text(body.get("request_id"), "request_id")

    document = body.get("school")
    if not isinstance(document, dict):
        raise BadRequest("school must be the export document as a JSON object")

    raw = body.get("config") or {}
    if not isinstance(raw, dict):
        raise BadRequest("config must be a JSON object")

    demand = _demand(raw.get("demand"))
    required_room_type = _strings(raw.get("required_room_type"), "config.required_room_type")
    heavy = _codes(raw.get("heavy_subjects"))

    try:
        school = school_mod.load_document(
            document,
            demand=demand,
            required_room_type=required_room_type,
            heavy_subjects=heavy,
        )
    except BadRequest:
        raise
    except (KeyError, TypeError, ValueError) as err:
        raise BadRequest("school is not a usable export document: %s" % (err,))

    config = SolveConfig(
        max_seconds=_seconds(raw.get("max_seconds")),
        num_workers=_workers(raw.get("num_workers")),
        demand=demand,
        pins=_pins(raw.get("pins")),
        unavailable=_unavailable(raw.get("unavailable")),
        required_room_type=required_room_type,
        heavy_subjects=frozenset(heavy),
        minutes_basis=_basis(raw.get("minutes_basis")),
        daily_contact=_daily_contact(raw.get("daily_contact"), school),
        **_weights(raw.get("weights"))
    )

    return Request(request_id, school, config, _hint(body.get("hint"), school))


def solve_response(request: Request, result) -> Dict[str, Any]:
    """The success body.  The same shape carries an infeasible answer, with the
    slots empty and the core populated - see the contract for why 200 and 422
    share it."""
    return {
        "request_id": request.request_id,
        "status": result.status,
        "verdict": result.verdict,
        "proven_optimal": bool(result.proven_optimal),
        "objective": result.objective,
        "wall_time_s": round(result.wall_time_s, 3),
        "slots": slots_of(result.placements),
        "soft_violations": [
            {
                "kind": v.kind,
                "key": v.key,
                "target": v.target,
                "actual": v.actual,
                "amount": v.amount,
                "message": v.message,
            }
            for v in result.soft_violations
        ],
        "infeasibility_core": list(result.infeasibility_core),
        "core_explanation": result.core_explanation,
    }


def feasibility_response(request: Request) -> Dict[str, Any]:
    """The preflight answer.  200 even when the school cannot be solved, because
    "no, and here is why" is a successful answer to "can this be solved"."""
    faults = preflight.check(request.school, request.config)
    wanted = preflight.demand_of(request.school, request.config)
    return {
        "request_id": request.request_id,
        "feasible": not faults,
        "cells": len(request.school.cells),
        "offerings": len(request.school.offerings),
        "cohorts": len(request.school.cohorts),
        "demand": sum(wanted.values()),
        "infeasibility_core": [f.key for f in faults],
        "core_explanation": preflight.render(faults),
    }


def slots_of(placements: Sequence[Placement]) -> List[Dict[str, Any]]:
    """Placements as slots, each with the ``ref`` the Go side proposes them by.

    The refs are positional over an order the solver has already fixed, so the
    same week always refs the same way and a clash report can be read against a
    second run of the same request.
    """
    return [
        {
            "ref": "s%03d" % (index + 1,),
            "section_id": placement.section_id,
            "day_of_week": placement.day_of_week,
            "period_id": placement.period_id,
            "subject_offering_id": placement.offering_id,
            "teacher_id": placement.teacher_id,
            "room_id": placement.room_id,
        }
        for index, placement in enumerate(placements)
    ]


def _text(value: Any, name: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise BadRequest("%s must be a string" % (name,))
    return value[:200]


def _seconds(value: Any) -> float:
    if value is None:
        return min(SolveConfig.max_seconds, CEILING_SECONDS)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BadRequest("config.max_seconds must be a number of seconds")
    return max(FLOOR_SECONDS, min(float(value), CEILING_SECONDS))


def _workers(value: Any) -> int:
    if value is None:
        return SolveConfig.num_workers
    if isinstance(value, bool) or not isinstance(value, int):
        raise BadRequest("config.num_workers must be a whole number")
    return max(1, min(value, MAX_WORKERS))


def _count(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise BadRequest("%s must be a whole number of periods" % (name,))
    if value < 0:
        raise BadRequest("%s cannot be negative" % (name,))
    return value


def _demand(value: Any) -> Dict[str, int]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BadRequest("config.demand must map a subject offering id to a count")
    return {
        _key(k, "config.demand"): _count(v, "config.demand[%s]" % (k,))
        for k, v in value.items()
    }


def _pins(value: Any) -> Dict[str, Dict[int, int]]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BadRequest("config.pins must map a subject offering id to a day and a count")
    out = {}  # type: Dict[str, Dict[int, int]]
    for offering_id, per_day in value.items():
        if not isinstance(per_day, dict):
            raise BadRequest("config.pins[%s] must map an ISO day of week to a count"
                             % (offering_id,))
        days = {}  # type: Dict[int, int]
        for day, count in per_day.items():
            days[_day(day, "config.pins[%s]" % (offering_id,))] = _count(
                count, "config.pins[%s][%s]" % (offering_id, day))
        out[_key(offering_id, "config.pins")] = days
    return out


def _unavailable(value: Any) -> Dict[str, frozenset]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BadRequest("config.unavailable must map a teacher id to the cells they are blocked in")
    out = {}  # type: Dict[str, frozenset]
    for teacher_id, cells in value.items():
        if not isinstance(cells, list):
            raise BadRequest("config.unavailable[%s] must be a list of [day, period_id] pairs"
                             % (teacher_id,))
        blocked = []
        for cell in cells:
            if not isinstance(cell, (list, tuple)) or len(cell) != 2:
                raise BadRequest("config.unavailable[%s] takes [day, period_id] pairs"
                                 % (teacher_id,))
            blocked.append((_day(cell[0], "config.unavailable[%s]" % (teacher_id,)),
                            _key(cell[1], "config.unavailable[%s]" % (teacher_id,))))
        out[_key(teacher_id, "config.unavailable")] = frozenset(blocked)
    return out


def _daily_contact(value: Any, school: School) -> Tuple[DailyContactRule, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise BadRequest("config.daily_contact must be a list of rules")
    sections = {s.id for s in school.sections}
    out = []  # type: List[DailyContactRule]
    for index, item in enumerate(value):
        where = "config.daily_contact[%d]" % (index,)
        if not isinstance(item, dict):
            raise BadRequest("%s must be an object naming a section and its offerings"
                             % (where,))
        section_id = _key(item.get("section_id"), "%s.section_id" % (where,))
        if section_id not in sections:
            raise BadRequest("%s names section %s, which this school does not have"
                             % (where, section_id))
        raw_ids = item.get("offering_ids")
        if not isinstance(raw_ids, list) or not raw_ids:
            raise BadRequest("%s.offering_ids must name at least one subject offering"
                             % (where,))
        offering_ids = []  # type: List[str]
        for candidate in raw_ids:
            offering_id = _key(candidate, "%s.offering_ids" % (where,))
            offering = school.offering(offering_id)
            if offering is None:
                raise BadRequest("%s names subject offering %s, which this school does "
                                 "not have" % (where, offering_id))
            if offering.section_id != section_id:
                raise BadRequest("%s names %s, which belongs to another section, so no "
                                 "week could ever satisfy the rule"
                                 % (where, school.label(offering_id)))
            if offering_id not in offering_ids:
                offering_ids.append(offering_id)
        minimum = item.get("min_per_day")
        minimum = 1 if minimum is None else _count(minimum, "%s.min_per_day" % (where,))
        if minimum < 1:
            raise BadRequest("%s.min_per_day is a floor of at least one lesson a day; "
                             "leave the rule out to ask for nothing" % (where,))
        out.append(DailyContactRule(
            section_id=section_id,
            offering_ids=tuple(offering_ids),
            min_per_day=minimum,
        ))
    return tuple(out)


def _strings(value: Any, name: str) -> Dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BadRequest("%s must be an object of strings" % (name,))
    out = {}  # type: Dict[str, str]
    for key, item in value.items():
        if not isinstance(item, str):
            raise BadRequest("%s[%s] must be a string" % (name, key))
        out[_key(key, name)] = item
    return out


def _codes(value: Any) -> Tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise BadRequest("config.heavy_subjects must be a list of subject codes")
    return tuple(_key(code, "config.heavy_subjects") for code in value)


def _basis(value: Any) -> str:
    if value is None:
        return SolveConfig.minutes_basis
    if value not in MINUTES_BASES:
        raise BadRequest("config.minutes_basis must be one of %s" % (", ".join(MINUTES_BASES),))
    return value


def _weights(value: Any) -> Dict[str, int]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BadRequest("config.weights must map a penalty name to a whole number")
    out = {}  # type: Dict[str, int]
    for name, weight in value.items():
        field = WEIGHT_FIELDS.get(name)
        if field is None:
            raise BadRequest("config.weights has no %r; the penalties are %s"
                             % (name, ", ".join(sorted(WEIGHT_FIELDS))))
        out[field] = _count(weight, "config.weights[%s]" % (name,))
    return out


def _hint(value: Any, school: School) -> Tuple[Placement, ...]:
    """A previous week to seed the search with.

    Rows naming an offering this school does not have are dropped rather than
    refused: a hint is advice, the published week it comes from may predate a
    subject being retired, and a stale row is not a reason to decline to solve.
    """
    if value is None:
        return ()
    if not isinstance(value, list):
        raise BadRequest("hint must be a list of slots")
    known = {offering.id: offering for offering in school.offerings}
    out = []  # type: List[Placement]
    for row in value:
        if not isinstance(row, dict):
            raise BadRequest("hint takes slot objects")
        offering_id = row.get("subject_offering_id") or row.get("offering_id")
        if not offering_id or offering_id not in known:
            continue
        out.append(Placement(
            offering_id=offering_id,
            section_id=row.get("section_id") or known[offering_id].section_id,
            day_of_week=_day(row.get("day_of_week"), "hint"),
            period_id=_key(row.get("period_id"), "hint"),
            teacher_id=row.get("teacher_id"),
            room_id=row.get("room_id"),
        ))
    return tuple(out)


def _day(value: Any, name: str) -> int:
    day = value
    if isinstance(day, str):
        try:
            day = int(day)
        except ValueError:
            raise BadRequest("%s needs an ISO day of week, 1 to 7" % (name,))
    if isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7:
        raise BadRequest("%s needs an ISO day of week, 1 to 7" % (name,))
    return day


def _key(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise BadRequest("%s needs a non-empty string identifier" % (name,))
    return value


def summary(request: Request) -> Mapping[str, Optional[int]]:
    """What a log line should carry about a request, without carrying the request."""
    return {
        "sections": len(request.school.sections),
        "offerings": len(request.school.offerings),
        "teachers": len(request.school.teachers),
        "rooms": len(request.school.rooms),
        "cohorts": len(request.school.cohorts),
        "cells": len(request.school.cells),
        "hint": len(request.hint),
    }
