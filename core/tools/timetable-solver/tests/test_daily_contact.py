import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from timetable_solver import preflight, wire  # noqa: E402
from timetable_solver.dto import (  # noqa: E402
    Cell,
    Cohort,
    DailyContactRule,
    Offering,
    Period,
    School,
    Section,
    SolveConfig,
    Teacher,
)

cp_model = pytest.importorskip("ortools.sat.python.cp_model")
solver_mod = pytest.importorskip("timetable_solver.solver")

EXPORT = os.path.join(ROOT, "school.json")

needs_export = pytest.mark.skipif(
    not os.path.exists(EXPORT),
    reason="run export.sh first; these cases check the parser against a real tenant",
)

SECTION = "sec-6a"
ART = "off-art"
HINDI = "off-hindi"
DAYS = (1, 2)


def _school(art_demand=2, hindi_demand=2):
    periods = tuple(
        Period(id="P%d" % n, code="P%d" % n, name="Period %d" % n,
               sequence=n, kind="teaching")
        for n in (1, 2, 3)
    )
    cells = (
        Cell(day_of_week=1, period_id="P1", bell_code="WK",
             start_minute=540, duration_minutes=45, occurrences=10),
        Cell(day_of_week=1, period_id="P2", bell_code="WK",
             start_minute=600, duration_minutes=45, occurrences=10),
        Cell(day_of_week=1, period_id="P3", bell_code="WK",
             start_minute=660, duration_minutes=45, occurrences=10),
        Cell(day_of_week=2, period_id="P1", bell_code="WK",
             start_minute=540, duration_minutes=45, occurrences=10),
    )
    offerings = (
        Offering(id=ART, section_id=SECTION, subject_id="s-art",
                 subject_code="ART", subject_name="Art",
                 periods_per_week=art_demand, teacher_ids=("t-art",), enrolled=20),
        Offering(id=HINDI, section_id=SECTION, subject_id="s-hin",
                 subject_code="HIN", subject_name="Hindi",
                 periods_per_week=hindi_demand, teacher_ids=("t-hin",),
                 enrolled=20, heavy=True),
    )
    return School(
        branch_id="b1", branch_name="Main", period_scheme_id="ps1",
        timetable_id="tt1", window_lo="2026-04-01", window_hi="2026-04-14", weeks=2,
        periods=periods, cells=cells,
        sections=(Section(id=SECTION, code="6A", name="A", grade_name="Class VI"),),
        rooms=(), teachers=(Teacher(id="t-art", code="TA", name="Anita Rao"),
                            Teacher(id="t-hin", code="TB", name="Bimal Sen")),
        offerings=offerings,
        cohorts=(Cohort(key="c1", size=20, offering_ids=(ART, HINDI)),),
    )


def _rule(offering_ids=(HINDI,), min_per_day=1):
    return DailyContactRule(section_id=SECTION, offering_ids=tuple(offering_ids),
                            min_per_day=min_per_day)


def _config(rules=(), **kwargs):
    kwargs.setdefault("max_seconds", 10)
    kwargs.setdefault("num_workers", 1)
    kwargs.setdefault("w_teacher_gap", 0)
    return SolveConfig(daily_contact=tuple(rules), **kwargs)


def _by_day(placements, offering_ids):
    wanted = set(offering_ids)
    out = {day: 0 for day in DAYS}
    for placement in placements:
        if placement.offering_id in wanted:
            out[placement.day_of_week] = out.get(placement.day_of_week, 0) + 1
    return out


def test_without_the_rule_the_cheapest_week_abandons_a_day():
    result = solver_mod.solve(_school(), _config())
    assert result.status == "OPTIMAL", result.core_explanation
    assert _by_day(result.placements, (HINDI,)) == {1: 2, 2: 0}


def test_the_rule_puts_a_lesson_on_every_day():
    result = solver_mod.solve(_school(), _config([_rule()]))

    assert result.status == "OPTIMAL", result.core_explanation
    assert len(result.placements) == 4
    per_day = _by_day(result.placements, (HINDI,))
    for day in DAYS:
        assert per_day[day] >= 1, \
            "day %d carries no lesson from the group; the rule did not bind" % day
    assert not [v for v in result.soft_violations if v.kind == "daily_contact"]


def test_the_rule_is_answered_by_any_member_of_the_group():
    narrow = solver_mod.solve(_school(), _config([_rule((HINDI,))]))
    wide = solver_mod.solve(_school(), _config([_rule((ART, HINDI))]))

    assert narrow.status == "OPTIMAL" and wide.status == "OPTIMAL"
    assert _by_day(narrow.placements, (HINDI,))[2] >= 1
    assert _by_day(wide.placements, (HINDI,))[2] == 0
    assert _by_day(wide.placements, (ART,))[2] == 1
    assert wide.objective < narrow.objective
    assert not [v for v in wide.soft_violations if v.kind == "daily_contact"]


def test_a_weight_of_zero_leaves_the_rule_with_no_pull():
    result = solver_mod.solve(_school(), _config([_rule()], w_daily_contact=0))
    assert result.status == "OPTIMAL", result.core_explanation
    assert _by_day(result.placements, (HINDI,)) == {1: 2, 2: 0}


def test_an_unreachable_day_still_returns_a_week_and_names_the_day():
    config = _config([_rule()], unavailable={"t-hin": frozenset([(2, "P1")])})
    result = solver_mod.solve(_school(), config)

    assert result.status == "OPTIMAL", result.core_explanation
    assert result.verdict == "optimal_with_violations"
    assert len(result.placements) == 4, "a partial answer, not no answer"

    missed = [v for v in result.soft_violations if v.kind == "daily_contact"]
    assert len(missed) == 1, [v.message for v in result.soft_violations]
    assert missed[0].key.endswith(":%s:2" % SECTION)
    assert missed[0].target == 1.0 and missed[0].actual == 0.0
    assert "6A" in missed[0].message and "Tuesday" in missed[0].message
    assert "Hindi" in missed[0].message


def test_the_violation_is_recomputed_from_the_week_not_from_the_model():
    school = _school()
    placements = solver_mod.solve(school, _config([_rule()])).placements
    monday_only = tuple(p for p in placements if p.day_of_week == 1)

    violations = solver_mod.evaluate_soft(school, monday_only, _config([_rule()]))
    missed = [v for v in violations if v.kind == "daily_contact"]
    assert len(missed) == 1
    assert missed[0].actual == 0.0


def test_a_rule_the_group_has_too_few_lessons_for_is_refused_by_name():
    school = _school(art_demand=3, hindi_demand=1)
    result = solver_mod.solve(school, _config([_rule()]))

    assert result.verdict == "infeasible"
    assert result.wall_time_s < 1.0, "this should never reach the solver"
    assert any(k.startswith("daily_contact:") for k in result.infeasibility_core), \
        result.infeasibility_core
    assert "6A" in result.core_explanation
    assert "Hindi" in result.core_explanation
    assert "2 teaching days" in result.core_explanation


def test_a_day_too_narrow_for_the_rule_is_refused_by_name():
    faults = preflight.check(_school(), _config([_rule(min_per_day=2)]))
    daily = [f for f in faults if f.kind == "daily_contact"]
    assert len(daily) == 1
    assert "Tuesday has only 1" in daily[0].message


def test_a_rule_that_is_merely_expensive_is_not_a_preflight_fault():
    assert not [f for f in preflight.check(_school(), _config([_rule()]))
                if f.kind == "daily_contact"]


@pytest.fixture(scope="module")
def document():
    with open(EXPORT) as handle:
        return json.load(handle)


def _body(document, rules):
    return {"request_id": "test", "school": document,
            "config": {"daily_contact": rules}}


@needs_export
def test_a_rule_arrives_with_min_per_day_defaulting_to_one(document):
    offering = document["offerings"][0]
    parsed = wire.parse(_body(document, [{
        "section_id": offering["section_id"],
        "offering_ids": [offering["id"]],
    }]))
    assert len(parsed.config.daily_contact) == 1
    assert parsed.config.daily_contact[0].min_per_day == 1
    assert parsed.config.daily_contact[0].offering_ids == (offering["id"],)


@needs_export
def test_an_offering_from_another_section_is_refused_not_ignored(document):
    first = document["offerings"][0]
    stranger = next(o for o in document["offerings"]
                    if o["section_id"] != first["section_id"])
    with pytest.raises(wire.BadRequest) as err:
        wire.parse(_body(document, [{
            "section_id": first["section_id"],
            "offering_ids": [first["id"], stranger["id"]],
        }]))
    assert "another section" in str(err.value)


@needs_export
@pytest.mark.parametrize("rule,expected", [
    ({"section_id": "nope", "offering_ids": ["x"]}, "does not have"),
    ({"offering_ids": ["x"]}, "section_id"),
    ({"section_id": None, "offering_ids": []}, "section_id"),
])
def test_a_rule_naming_what_this_school_lacks_is_a_refusal(document, rule, expected):
    with pytest.raises(wire.BadRequest) as err:
        wire.parse(_body(document, [rule]))
    assert expected in str(err.value)


@needs_export
def test_an_empty_offering_set_is_refused_because_it_could_never_hold(document):
    offering = document["offerings"][0]
    with pytest.raises(wire.BadRequest) as err:
        wire.parse(_body(document, [{
            "section_id": offering["section_id"], "offering_ids": [],
        }]))
    assert "at least one subject offering" in str(err.value)


@needs_export
def test_a_min_per_day_of_zero_is_refused_rather_than_taken_as_no_rule(document):
    offering = document["offerings"][0]
    with pytest.raises(wire.BadRequest) as err:
        wire.parse(_body(document, [{
            "section_id": offering["section_id"],
            "offering_ids": [offering["id"]],
            "min_per_day": 0,
        }]))
    assert "leave the rule out" in str(err.value)


@needs_export
def test_the_daily_contact_weight_reaches_the_config(document):
    parsed = wire.parse({"request_id": "test", "school": document,
                         "config": {"weights": {"daily_contact": 900}}})
    assert parsed.config.w_daily_contact == 900
