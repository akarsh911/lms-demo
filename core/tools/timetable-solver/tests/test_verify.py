"""The verifier has to fail for the reason it was meant to fail for.

A checker that returns "clean" on everything also returns "clean" on the real
answer, so agreeing with the school's own published week proves nothing on its
own.  Each test here injects one known fault and asserts that exactly the
rule it violates fires - and one test injects a *legal* arrangement that looks
like a fault and asserts nothing fires, which is the one this project has got
wrong three times.

Run with ``python -m pytest tests -q`` from ``tools/timetable-solver``.
No solver needed.
"""

import copy
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from timetable_solver import school as school_mod, verify  # noqa: E402

EXPORT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "school.json")

pytestmark = pytest.mark.skipif(
    not os.path.exists(EXPORT),
    reason="run export.sh first; this suite checks against a real tenant",
)


@pytest.fixture(scope="module")
def doc():
    with open(EXPORT) as handle:
        return json.load(handle)


@pytest.fixture
def week(doc):
    return copy.deepcopy(doc["current_slots"])


def test_published_week_is_clean(week):
    """Calibration: the school's own week passes.  Necessary, not sufficient."""
    report = verify.verify(EXPORT, week)
    assert report.clean, verify.summarise(report)


def test_demand_is_checked(week):
    demand = school_mod.demand_from_current(EXPORT)
    first = sorted(demand)[0]
    demand[first] += 1
    report = verify.verify(EXPORT, week, demand=demand)
    assert report.demand_misses
    assert not report.clean


def test_teacher_clash_is_found(doc, week):
    """Move one of a teacher's lessons on top of another of their lessons."""
    by_teacher = {}
    for slot in week:
        by_teacher.setdefault(slot["teacher_id"], []).append(slot)
    victim = next(v for v in by_teacher.values() if len(v) > 1)
    moved = copy.deepcopy(victim[1])
    moved["day_of_week"] = victim[0]["day_of_week"]
    moved["period_id"] = victim[0]["period_id"]
    week = [s for s in week if s is not victim[1]] + [moved]

    report = verify.verify(EXPORT, week)
    assert report.count("teacher") >= 1
    assert not report.clean


def test_room_clash_is_found(doc, week):
    by_room = {}
    for slot in week:
        by_room.setdefault(slot["room_id"], []).append(slot)
    victim = next(v for v in by_room.values() if len(v) > 1)
    moved = copy.deepcopy(victim[1])
    moved["day_of_week"] = victim[0]["day_of_week"]
    moved["period_id"] = victim[0]["period_id"]
    moved["teacher_id"] = None                     # isolate the room rule
    week = [s for s in week if s is not victim[1]] + [moved]

    report = verify.verify(EXPORT, week)
    assert report.count("room") >= 1


def test_student_set_clash_is_found(doc, week):
    """Two lessons the same pupils attend, in one period, is a clash."""
    students_of = {}
    for student_id, offering_id in doc["enrolments"]:
        students_of.setdefault(offering_id, set()).add(student_id)

    left = next(s for s in week
                if len(students_of.get(s["offering_id"], ())) > 10)
    right = next(s for s in week
                 if s["offering_id"] != left["offering_id"]
                 and students_of.get(s["offering_id"], set())
                 & students_of[left["offering_id"]])

    moved = copy.deepcopy(right)
    moved["day_of_week"] = left["day_of_week"]
    moved["period_id"] = left["period_id"]
    moved["teacher_id"] = None                     # isolate the student rule
    moved["room_id"] = None
    week = [s for s in week if s is not right] + [moved]

    report = verify.verify(EXPORT, week)
    assert report.count("student_set") >= 1
    assert report.count("teacher") == 0
    assert report.count("room") == 0


def test_disjoint_electives_may_share_a_period(doc, week):
    """The negative control, and the whole point of the rule.

    French and Sanskrit belong to one section and run in one period, and that
    is correct: their enrolments are disjoint, so no pupil is in two places.
    A checker that treated "same section, same period" as a clash would fire
    here, and it would be wrong.
    """
    students_of = {}
    for student_id, offering_id in doc["enrolments"]:
        students_of.setdefault(offering_id, set()).add(student_id)
    subject_of = {o["id"]: o["subject_code"] for o in doc["offerings"]}
    section_of = {o["id"]: o["section_id"] for o in doc["offerings"]}

    pairs = [
        (a, b) for a in week for b in week
        if a["offering_id"] < b["offering_id"]
        and section_of[a["offering_id"]] == section_of[b["offering_id"]]
        and not students_of[a["offering_id"]] & students_of[b["offering_id"]]
    ]
    assert pairs, "the fixture no longer contains a disjoint elective pair"

    left, right = pairs[0]
    assert {subject_of[left["offering_id"]], subject_of[right["offering_id"]]} \
        == {"FRE", "SAN"}
    assert left["day_of_week"] == right["day_of_week"]
    assert left["period_id"] == right["period_id"]

    report = verify.verify(EXPORT, week)
    assert report.count("student_set") == 0, verify.summarise(report)


def test_off_grid_placement_is_found(doc, week):
    """Saturday has no fifth period, because BELL-SAT does not define one."""
    open_cells = {(int(c["day_of_week"]), c["period_id"]) for c in doc["cells"]}
    saturday = {c["period_id"] for c in doc["cells"] if c["day_of_week"] == 6}
    absent = next(p["id"] for p in doc["periods"]
                  if p["kind"] == "teaching" and p["id"] not in saturday)
    assert (6, absent) not in open_cells

    moved = copy.deepcopy(week[0])
    moved["day_of_week"] = 6
    moved["period_id"] = absent
    week = week[1:] + [moved]

    report = verify.verify(EXPORT, week)
    assert report.grid_misses


def test_break_period_is_found(doc, week):
    """ASM, BRK and LUN are not teaching periods and nothing may be placed there."""
    assembly = next(p["id"] for p in doc["periods"] if p["kind"] != "teaching")
    moved = copy.deepcopy(week[0])
    moved["period_id"] = assembly
    week = week[1:] + [moved]

    report = verify.verify(EXPORT, week)
    assert report.grid_misses


def test_assembly_consumes_the_section(doc):
    """A label-only slot has no offering, so ``clash.go`` falls back to the
    section roll - and so must this.  Put a lesson in the assembly period for a
    section that has assembly there and the pupils are in two places."""
    fixed = doc["fixed_slots"][0]
    offering = next(o for o in doc["offerings"]
                    if o["section_id"] == fixed["section_id"])
    week = [{
        "offering_id": offering["id"],
        "section_id": offering["section_id"],
        "day_of_week": fixed["day_of_week"],
        "period_id": fixed["period_id"],
        "teacher_id": None,
        "room_id": None,
    }]
    report = verify.verify(EXPORT, week)
    assert report.count("student_set") >= 1
