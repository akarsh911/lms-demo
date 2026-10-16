"""What the model must and must not do, checked against the real tenant.

These need a solver; the rest of the suite does not.  Each case is small enough
to prove rather than time out, and each asserts the *reason* as well as the
outcome - an infeasible verdict with the wrong explanation is a worse answer
than no explanation, because it sends someone to fix the wrong thing.
"""

import copy
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from timetable_solver import preflight, school as school_mod, verify  # noqa: E402
from timetable_solver.dto import SolveConfig  # noqa: E402

EXPORT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "school.json")

cp_model = pytest.importorskip("ortools.sat.python.cp_model")
solver_mod = pytest.importorskip("timetable_solver.solver")

pytestmark = pytest.mark.skipif(
    not os.path.exists(EXPORT),
    reason="run export.sh first; this suite checks against a real tenant",
)


@pytest.fixture(scope="module")
def doc():
    with open(EXPORT) as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def demand():
    return school_mod.demand_from_current(EXPORT)


def _school(demand, **kwargs):
    return school_mod.load(EXPORT, demand=demand, **kwargs)


def test_a_clean_week_exists_and_survives_an_independent_audit(demand):
    """The headline: solve the real school, then check it with code that has
    never seen the model."""
    school = _school(demand)
    config = SolveConfig(max_seconds=30, num_workers=8, w_teacher_gap=0)
    result = solver_mod.solve(school, config)

    assert result.status in ("OPTIMAL", "FEASIBLE"), result.core_explanation
    assert len(result.placements) == sum(demand.values())

    wire = [
        {
            "offering_id": p.offering_id, "section_id": p.section_id,
            "day_of_week": p.day_of_week, "period_id": p.period_id,
            "teacher_id": p.teacher_id, "room_id": p.room_id,
        }
        for p in result.placements
    ]
    report = verify.verify(EXPORT, wire, demand=demand)
    assert report.clean, verify.summarise(report)
    assert report.checked_pairs > 0, "an audit that compared nothing proves nothing"


def test_the_week_the_solver_returns_uses_every_cell(demand):
    """The demo tenant's demand exactly fills its grid, which is worth knowing:
    34 cells per section and 34 lessons owed, so there is not one free period
    anywhere.  If this ever stops holding the instance has got easier, not the
    model wrong."""
    school = _school(demand)
    cells = len(preflight.grid(school))
    for cohort in school.cohorts:
        owed = sum(demand.get(o, 0) for o in cohort.offering_ids)
        assert owed == cells


def test_electives_with_disjoint_rolls_may_share_a_period(demand):
    """The rule this project has got wrong three times, asserted on the model
    rather than on the audit: French and Sanskrit are one section and one
    period, and the model must permit it."""
    school = _school(demand)
    config = SolveConfig(max_seconds=30, num_workers=8, w_teacher_gap=0)
    result = solver_mod.solve(school, config)
    assert result.placements

    by_cell = {}
    for placement in result.placements:
        by_cell.setdefault(
            (placement.section_id, placement.day_of_week, placement.period_id), []
        ).append(placement.offering_id)
    shared = [v for v in by_cell.values() if len(v) > 1]
    assert shared, "no section ever ran two offerings at once; the elective " \
                   "pair has been forced apart and the model is too strict"


def test_over_demand_is_explained_not_just_refused(demand):
    """Ask for more periods than the week holds and get the arithmetic back."""
    school = _school(demand)
    stretched = dict(demand)
    for offering in school.offerings:
        if offering.subject_code == "MATH":
            stretched[offering.id] = 9
    school = _school(stretched)

    config = SolveConfig(max_seconds=10, num_workers=8)
    result = solver_mod.solve(school, config)
    assert result.verdict == "infeasible"
    assert "the week has 34" in result.core_explanation
    assert any(k.startswith("cohort_capacity:") for k in result.infeasibility_core)


def test_a_teacher_over_their_week_is_named(demand):
    school = _school(demand)
    stretched = {}
    for offering in school.offerings:
        stretched[offering.id] = {
            "MATH": 11, "ENG": 5, "HIN": 5, "SCI": 5, "SST": 5,
        }.get(offering.subject_code, 1)
    school = _school(stretched)

    result = solver_mod.solve(school, SolveConfig(max_seconds=10, num_workers=8))
    assert result.verdict == "infeasible"
    assert result.infeasibility_core == ("teacher_capacity:188d0227-cf24-4e6e-84fc-93cd6c9bf154",)
    assert result.core_explanation == (
        "This requirement cannot be met: Vihaan Reddy is required for 37 "
        "periods a week and has 34 available."
    )


def test_a_pinned_day_names_the_day(demand):
    """The sentence the brief asked for, which needs an input the schema has
    not got - see :mod:`timetable_solver.preflight`."""
    school = _school(demand)
    target = next(o for o in school.offerings
                  if o.subject_code == "SST"
                  and school.section(o.section_id).code == "2026-2027-G6-A")

    config = SolveConfig(max_seconds=10, num_workers=8, pins={target.id: {2: 7}})
    result = solver_mod.solve(school, config)
    assert result.verdict == "infeasible"
    assert "Myra Rao is required for 7 periods on Tuesday and there are 6" \
        in result.core_explanation


def test_a_conflict_beyond_arithmetic_gets_a_core(demand):
    """Preflight cannot count its way to this one, so the assumption solve and
    the deletion filter have to earn their keep: two laboratory subjects pinned
    to a Saturday that has four periods and two laboratories."""
    types = {"SCI": "laboratory", "FRE": "laboratory"}
    school = _school(demand, required_room_type=types)
    pins = {o.id: {6: 1} for o in school.offerings
            if o.subject_code in ("SCI", "FRE")}
    config = SolveConfig(max_seconds=10, num_workers=8, pins=pins,
                         required_room_type=types)

    assert not preflight.check(school, config), \
        "preflight now catches this; the test no longer exercises the core path"

    core, sentence = solver_mod.diagnose(school, config)
    assert core
    assert any(k.startswith("room_capacity:") for k in core)
    assert "Laboratory cannot hold two classes at once" in sentence
    assert solver_mod._infeasible_with(school, config, set(core)), \
        "the core is not sufficient - it does not prove what it claims"
    for key in core:
        assert not solver_mod._infeasible_with(school, config, set(core) - {key}), \
            "the core is not irreducible; %s could be dropped" % key


def test_optimal_is_not_the_same_as_shippable(demand):
    """A stated minutes obligation the grid cannot meet is a soft violation on
    an otherwise optimal week, and the verdict has to say so."""
    from dataclasses import replace

    school = _school(demand)
    school = replace(school, offerings=tuple(
        replace(o, minutes_per_week=400) if o.subject_code == "MATH" else o
        for o in school.offerings))

    config = SolveConfig(max_seconds=20, num_workers=8, w_teacher_gap=0)
    result = solver_mod.solve(school, config)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert any(v.kind == "minutes_short" for v in result.soft_violations)
    if result.status == "OPTIMAL":
        assert result.verdict == "optimal_with_violations"


def test_realised_minutes_are_below_nominal(demand):
    """The finding that makes minutes_per_week worth having as its own column:
    a weekly pattern slot does not deliver its nominal duration, because the
    calendar shuts some of its occurrences."""
    school = _school(demand)
    realised = school_mod.minute_weight(school, "realised")
    nominal = school_mod.minute_weight(school, "nominal")
    assert set(realised) == set(nominal)
    assert all(realised[k] <= nominal[k] for k in realised)
    assert sum(realised.values()) < sum(nominal.values()) * 0.97


def test_an_offering_nobody_is_enrolled_in_still_constrains_the_week(
        doc, demand, tmp_path):
    """The trap: cohorts come from enrolment, so an offering with no enrolment
    belongs to no cohort and nothing stops it landing on top of its own
    section's other lessons.  A section made for next year, before anyone is
    enrolled, is exactly that case.  ``clash.go`` falls back to the section roll
    and so must the loader."""
    import json as _json

    victim = next(o for o in doc["offerings"] if o["subject_code"] == "MATH")
    stripped = copy.deepcopy(doc)
    stripped["enrolments"] = [
        row for row in doc["enrolments"] if row[1] != victim["id"]
    ]
    stripped["cohorts"] = [
        dict(c, offering_ids=[i for i in c["offering_ids"] if i != victim["id"]])
        for c in doc["cohorts"]
    ]
    path = str(tmp_path / "stripped.json")
    with open(path, "w") as handle:
        _json.dump(stripped, handle)

    school = school_mod.load(path, demand=demand)
    fallback = [c for c in school.cohorts if c.key.startswith("section:")]
    assert len(fallback) == 1
    assert fallback[0].offering_ids == (victim["id"],)
    assert fallback[0].size > 0, "the section roll is what makes it non-empty"

    covered = {i for c in school.cohorts for i in c.offering_ids}
    assert victim["id"] in covered

    config = SolveConfig(max_seconds=20, num_workers=8, w_teacher_gap=0)
    result = solver_mod.solve(school, config)
    assert result.status in ("OPTIMAL", "FEASIBLE")

    mates = {o.id for o in school.offerings
             if o.section_id == victim["section_id"] and o.id != victim["id"]}
    by_cell = {}
    for placement in result.placements:
        by_cell.setdefault(
            (placement.day_of_week, placement.period_id), set()
        ).add(placement.offering_id)
    for cell, ids in by_cell.items():
        if victim["id"] in ids:
            assert not (ids & mates), \
                "the un-enrolled offering shares %s with its own section" % (cell,)
