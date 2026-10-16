"""The HTTP contract: what the wire accepts, refuses, and answers with.

Split in two on purpose.  The first half is the parser and the renderers, which
are pure and run with no solver installed - that is the point of putting them in
``timetable_solver.wire`` rather than in ``server.py``.  The second half starts
the real server on a real socket and talks to it over HTTP, because "the handler
function returns the right dict" is not evidence that a caller gets the right
status code.
"""

import json
import os
import sys
import threading
import urllib.error
import urllib.request

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from timetable_solver import wire  # noqa: E402
from timetable_solver.dto import Placement, SolveConfig  # noqa: E402

EXPORT = os.path.join(ROOT, "school.json")

needs_export = pytest.mark.skipif(
    not os.path.exists(EXPORT),
    reason="run export.sh first; this suite checks against a real tenant",
)


@pytest.fixture(scope="module")
def document():
    with open(EXPORT) as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def current(document):
    out = {}
    for row in document.get("incumbents", []):
        out[row["offering_id"]] = out.get(row["offering_id"], 0) + int(row.get("slots", 0))
    return out


def body(document, **config):
    return {"request_id": "test", "school": document, "config": config}


# ---------------------------------------------------------------------------
# The parser
# ---------------------------------------------------------------------------


@needs_export
def test_a_request_becomes_a_school_the_loader_would_have_built(document, current):
    request = wire.parse(body(document, demand=current))
    assert len(request.school.offerings) == len(document["offerings"])
    assert len(request.school.cells) == len([c for c in document["cells"]
                                             if c["occurrences"] > 0])
    assert request.request_id == "test"


@needs_export
def test_max_seconds_is_clamped_to_the_services_ceiling_not_the_callers(document):
    assert wire.parse(body(document, max_seconds=10_000)).config.max_seconds == \
        wire.CEILING_SECONDS
    assert wire.parse(body(document, max_seconds=0)).config.max_seconds == \
        wire.FLOOR_SECONDS


@needs_export
def test_workers_are_capped_because_the_cpus_are_the_services(document):
    assert wire.parse(body(document, num_workers=512)).config.num_workers == wire.MAX_WORKERS


@needs_export
def test_a_demand_of_zero_is_a_statement_and_an_absent_one_is_not(document, current):
    """The distinction :mod:`timetable_solver.preflight` refuses to guess at."""
    one = next(iter(current))
    parsed = wire.parse(body(document, demand={one: 0}))
    assert parsed.school.offering(one).periods_per_week == 0

    unstated = json.loads(json.dumps(document))
    for offering in unstated["offerings"]:
        offering.pop("periods_per_week", None)
    absent = wire.parse(body(unstated, demand={}))
    assert absent.config.demand == {}
    assert absent.school.offering(one).periods_per_week is None
    faults = wire.feasibility_response(absent)
    assert any(key.startswith("no_demand:") for key in faults["infeasibility_core"]), \
        "an offering nobody stated a demand for must be reported, never defaulted"


@needs_export
def test_an_unknown_weight_is_refused_rather_than_ignored(document):
    """A caller who sets a penalty that does not exist and gets a week full of
    the thing they were penalising has been lied to."""
    with pytest.raises(wire.BadRequest) as err:
        wire.parse(body(document, weights={"teacher_gaps": 30}))
    assert "teacher_gap" in str(err.value)


@needs_export
def test_weights_that_do_exist_reach_the_config(document):
    config = wire.parse(body(document, weights={"teacher_gap": 0, "stack": 7})).config
    assert config.w_teacher_gap == 0
    assert config.w_stack == 7


@needs_export
@pytest.mark.parametrize("config", [
    {"max_seconds": "sixty"},
    {"num_workers": 1.5},
    {"demand": {"x": -1}},
    {"pins": {"x": {"9": 1}}},
    {"unavailable": {"t": [[1]]}},
    {"minutes_basis": "guessed"},
    {"heavy_subjects": "MATH"},
])
def test_a_malformed_config_is_a_refusal_with_a_reason(document, config):
    with pytest.raises(wire.BadRequest):
        wire.parse(body(document, **config))


def test_a_body_that_is_not_an_object_or_has_no_school_is_refused():
    for candidate in ([], "school", {}, {"school": []}):
        with pytest.raises(wire.BadRequest):
            wire.parse(candidate)


@needs_export
def test_pins_arrive_as_integer_days_whatever_json_made_of_the_key(document, current):
    offering = next(iter(current))
    pins = wire.parse(body(document, demand=current,
                           pins={offering: {"5": 1}})).config.pins
    assert pins[offering] == {5: 1}


@needs_export
def test_a_hint_takes_either_spelling_and_drops_what_it_cannot_place(document, current):
    rows = document.get("current_slots", [])[:5]
    assert rows, "the export carries no published week to hint with"
    renamed = [dict(row, subject_offering_id=row.pop("offering_id")) for row in
               [dict(r) for r in rows]]
    hint = wire.parse(dict(body(document, demand=current), hint=renamed)).hint
    assert len(hint) == len(rows)

    stale = wire.parse(dict(body(document, demand=current),
                            hint=[{"subject_offering_id": "gone",
                                   "day_of_week": 1, "period_id": "p"}])).hint
    assert stale == ()


# ---------------------------------------------------------------------------
# The rendered answers
# ---------------------------------------------------------------------------


@needs_export
def test_a_slot_is_named_the_way_the_go_side_names_one(document, current):
    request = wire.parse(body(document, demand=current))
    offering = request.school.offerings[0]
    slots = wire.slots_of([Placement(
        offering_id=offering.id, section_id=offering.section_id,
        day_of_week=1, period_id="p1", teacher_id="t", room_id=None)])
    assert slots == [{
        "ref": "s001", "section_id": offering.section_id, "day_of_week": 1,
        "period_id": "p1", "subject_offering_id": offering.id,
        "teacher_id": "t", "room_id": None,
    }]


@needs_export
def test_feasibility_answers_the_real_school_with_yes(document, current):
    answer = wire.feasibility_response(wire.parse(body(document, demand=current)))
    assert answer["feasible"] is True
    assert answer["core_explanation"] == ""
    assert answer["demand"] == sum(current.values())
    assert answer["cells"] > 0 and answer["cohorts"] > 0


@needs_export
def test_feasibility_answers_an_impossible_school_with_why(document, current):
    """200 with a sentence, not an error: "no, and here is why" is a successful
    answer to "can this be solved"."""
    heavy = {key: value + 4 for key, value in current.items()}
    answer = wire.feasibility_response(wire.parse(body(document, demand=heavy)))
    assert answer["feasible"] is False
    assert answer["infeasibility_core"]
    assert "cannot" in answer["core_explanation"]


# ---------------------------------------------------------------------------
# The server, over a socket
# ---------------------------------------------------------------------------

pytest.importorskip("ortools.sat.python.cp_model")
server_mod = pytest.importorskip("server")

TOKEN = "test-token"


@pytest.fixture(scope="module")
def service():
    settings = server_mod.Settings({
        "TIMETABLE_SOLVER_TOKEN": TOKEN,
        "TIMETABLE_SOLVER_BIND": "127.0.0.1",
        "TIMETABLE_SOLVER_PORT": "0",
        "TIMETABLE_SOLVER_CONCURRENCY": "1",
    })
    httpd = server_mod.build(settings)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    host, port = httpd.server_address[:2]
    yield "http://%s:%d" % (host, port)
    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=5)


def call(base, path, payload=None, token=TOKEN, method="POST", raw=None):
    data = raw if raw is not None else (
        None if payload is None else json.dumps(payload).encode("utf-8"))
    request = urllib.request.Request(base + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token is not None:
        request.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def test_healthz_needs_no_token_because_a_container_probe_holds_none(service):
    status, answer = call(service, "/healthz", token=None, method="GET")
    assert status == 200
    assert answer["status"] == "ok"
    assert answer["ortools"]


def test_the_service_refuses_an_unauthenticated_solve(service, document):
    status, _ = call(service, "/v1/solve", body(document), token=None)
    assert status == 401
    status, _ = call(service, "/v1/solve", body(document), token="wrong")
    assert status == 401


def test_an_unknown_route_is_a_404_not_a_500(service):
    assert call(service, "/v1/anything", {}, method="POST")[0] == 404
    assert call(service, "/", None, token=None, method="GET")[0] == 404


def test_a_body_that_is_not_json_is_a_400(service):
    status, answer = call(service, "/v1/feasibility", raw=b"{not json")
    assert status == 400
    assert "JSON" in answer["message"]


@needs_export
def test_a_school_that_is_not_an_export_is_a_400_naming_what_was_wrong(service):
    status, answer = call(service, "/v1/solve", {"school": {"branch": {}}})
    assert status == 400
    assert "school" in answer["message"]


@needs_export
def test_feasibility_is_a_preflight_and_answers_without_solving(service, document, current):
    status, answer = call(service, "/v1/feasibility", body(document, demand=current))
    assert status == 200
    assert answer["feasible"] is True
    assert answer["request_id"] == "test"


@needs_export
def test_solve_returns_a_week_and_every_slot_carries_a_ref(service, document, current):
    status, answer = call(service, "/v1/solve",
                          body(document, demand=current, max_seconds=30,
                               weights={"teacher_gap": 0}))
    assert status == 200, answer["core_explanation"]
    assert answer["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(answer["slots"]) == sum(current.values())
    assert len({slot["ref"] for slot in answer["slots"]}) == len(answer["slots"])
    for slot in answer["slots"]:
        assert slot["subject_offering_id"] and slot["section_id"]
        assert 1 <= slot["day_of_week"] <= 7


@needs_export
def test_an_impossible_school_is_a_422_carrying_the_same_body_shape(service, document, current):
    """Two status codes, one body: the caller asked for a week and did not get
    one, and everything needed to say why is in the success shape."""
    heavy = {key: value + 4 for key, value in current.items()}
    status, answer = call(service, "/v1/solve",
                          body(document, demand=heavy, max_seconds=10))
    assert status == 422
    assert answer["slots"] == []
    assert answer["status"] == "INFEASIBLE"
    assert answer["infeasibility_core"]
    assert answer["core_explanation"]
    assert "wall_time_s" in answer and "soft_violations" in answer


def test_the_service_will_not_start_without_a_token():
    with pytest.raises(SystemExit):
        server_mod.build(server_mod.Settings({"TIMETABLE_SOLVER_PORT": "0"}))


def test_the_diagnosis_budget_is_divided_rather_than_multiplied():
    """Sixty candidate solves at the caller's ``max_seconds`` each is an hour."""
    config = SolveConfig(max_seconds=60.0)
    share = max(1.0, config.max_seconds / float(server_mod.MAX_CORE_SOLVES + 2))
    assert share * (server_mod.MAX_CORE_SOLVES + 2) <= config.max_seconds + 1.0


@needs_export
def test_a_section_roll_may_arrive_as_a_count_instead_of_a_list_of_pupils(document, current):
    """What emerge-core sends, and why: the size of a fallback cohort appears in a
    sentence and in nothing the model decides, so the count is enough and pupil
    identifiers stay out of a service that has no business holding them."""
    counted = json.loads(json.dumps(document))
    tally = {}
    for _student_id, section_id in counted.pop("section_roll", []):
        tally[section_id] = tally.get(section_id, 0) + 1
    counted["section_roll_counts"] = tally

    from timetable_solver import school as school_mod

    by_pairs = school_mod.load_document(document, demand=current)
    by_count = school_mod.load_document(counted, demand=current)

    assert {(c.key, c.size) for c in by_pairs.cohorts} == \
        {(c.key, c.size) for c in by_count.cohorts}
