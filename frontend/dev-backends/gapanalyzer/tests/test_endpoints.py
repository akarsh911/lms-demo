import pytest
from fastapi.testclient import TestClient

import normalise
from app import create_app
from conftest import GOLDEN, OTHER_SCHOOL, SCHOOL, SEED, TODAY, as_user

ENDPOINTS = [
    ("get", "/scope", None),
    ("get", "/learners/any", None),
    ("get", "/sections/any/subjects/SCI", None),
    ("get", "/grades/10/subjects/SCI", None),
    ("post", "/evidence", {"events": []}),
    ("post", "/demo/reset", None),
]

NORMALISED = {entry["record"]["type"]: entry for entry in GOLDEN["normalised"]}


def refused(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["code"] == code
    assert response.json()["message"]


def demo_student():
    return SEED["personas"]["student"]["student_ids"][0]


def topic_of(analysis, topic_id):
    return next(t for s in analysis["subjects"] for c in s["chapters"] for t in c["topics"] if t["topic_id"] == topic_id)


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_every_endpoint_refuses_a_request_without_a_tenant(client, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    refused(client.request(method.upper(), path, **kwargs), 400, "missing_school_id")
    refused(client.request(method.upper(), path, headers={"x-school-id": " "}, **kwargs), 400, "missing_school_id")


def test_the_default_persona_is_the_seeded_teacher(client):
    body = client.get("/scope", headers=SCHOOL).json()
    assert body["sections"] and body["school"] is None and body["self"] is None


def test_an_unknown_persona_is_refused(client):
    refused(client.get("/scope", headers=as_user("headmaster")), 400, "unknown_user")


def test_reach_refusals(client):
    refused(client.get("/grades/10/subjects/SCI", headers=as_user("teacher")), 403, "forbidden")
    refused(client.get("/learners/nobody", headers=as_user("admin")), 403, "forbidden")
    refused(client.get("/sections/nowhere/subjects/SCI", headers=as_user("admin")), 403, "forbidden")
    refused(client.get("/grades/7/subjects/SCI", headers=as_user("admin")), 404, "not_found")
    refused(client.get("/grades/ten/subjects/SCI", headers=as_user("admin")), 422, "invalid_request")


def test_a_drill_posted_as_a_record_changes_the_analysis(client):
    before = client.get(f"/learners/{demo_student()}", headers=as_user("admin")).json()
    drill = {**NORMALISED["mastery"]["record"], "student_id": demo_student(), "record_id": "drill-new", "date": "2026-10-05"}
    drill["states"] = {node: "known" for node in drill["states"]}
    posted = client.post("/evidence", headers=SCHOOL, json={"records": [{"grade": 10, "subject_code": "SCI", "record": drill}]})
    assert posted.status_code == 201, posted.text
    events = posted.json()["events"]
    assert posted.json()["accepted"] == len(events) > 0
    assert all(event["source"] == "mindmap" and event["signal"] == 1 for event in events)

    after = client.get(f"/learners/{demo_student()}", headers=as_user("admin")).json()
    touched = events[0]["topic_id"]
    assert topic_of(after, touched)["score"] > topic_of(before, touched)["score"]
    assert any(row["id"] == events[0]["id"] for row in topic_of(after, touched)["evidence"])


def test_an_omr_result_posted_as_a_record_reaches_the_class_view(client):
    scope = client.get("/scope", headers=as_user("teacher")).json()
    section = next(row for row in scope["sections"] if row["grade"] == 10)
    pupil = next(row for row in SEED["pupils"] if row["section_id"] == section["section_id"])
    omr = {**NORMALISED["omr"]["record"], "student_id": pupil["student_id"], "sheet_id": "omr-new", "date": "2026-10-05"}
    omr["questions"] = [{**q, "outcome": "incorrect"} for q in omr["questions"]]
    assert client.post("/evidence", headers=SCHOOL, json={"records": [{"grade": 10, "subject_code": "SCI", "record": omr}]}).status_code == 201
    view = client.get(f"/sections/{section['section_id']}/subjects/SCI", headers=as_user("teacher")).json()
    cells = [cell for cell in view["cells"] if cell["student_id"] == pupil["student_id"]]
    learner = client.get(f"/learners/{pupil['student_id']}", headers=as_user("teacher")).json()
    sheet_topics = {t["topic_id"] for s in learner["subjects"] for c in s["chapters"] for t in c["topics"] if any(e["ref"]["record_id"] == "omr-new" for e in t["evidence"])}
    assert sheet_topics
    assert all(cell["topic_specific"] for cell in cells if cell["topic_id"] in sheet_topics)


def test_a_raw_event_is_stored_and_replaced_by_id(client):
    template = NORMALISED["answer_sheet"]["events"][0]
    event = {**template, "id": "manual:1", "student_id": demo_student(), "signal": 0.0, "date": "2026-10-05"}
    assert client.post("/evidence", headers=SCHOOL, json={"events": [event]}).status_code == 201
    assert client.post("/evidence", headers=SCHOOL, json={"events": [{**event, "signal": 1.0}]}).status_code == 201
    stored = [e for e in topic_of(client.get(f"/learners/{demo_student()}", headers=as_user("admin")).json(), event["topic_id"])["evidence"] if e["id"] == "manual:1"]
    assert len(stored) == 1 and stored[0]["signal"] == 1.0
    assert "exam_id" not in stored[0]["ref"]


def test_evidence_refusals(client):
    template = NORMALISED["answer_sheet"]["events"][0]
    record = NORMALISED["omr"]["record"]
    post = lambda body: client.post("/evidence", headers=SCHOOL, json=body)
    refused(post({}), 422, "empty_evidence")
    refused(post({"events": [{**template, "student_id": "nobody"}]}), 404, "not_found")
    refused(post({"events": [{**template, "topic_id": "nothing"}]}), 422, "unknown_topic")
    refused(post({"events": [{**template, "signal": 1.5}]}), 422, "invalid_request")
    refused(post({"events": [{**template, "source": "rumour"}]}), 422, "invalid_request")
    refused(post({"events": [{**template, "date": "yesterday"}]}), 422, "invalid_request")
    refused(post({"records": [{"grade": 7, "subject_code": "SCI", "record": record}]}), 422, "unknown_subject")
    refused(post({"records": [{"grade": 10, "subject_code": "SCI", "record": {**record, "type": "gossip"}}]}), 422, "invalid_request")
    refused(post({"records": [{"grade": 10, "subject_code": "SCI", "record": {**record, "student_id": "nobody"}}]}), 404, "not_found")


def test_evidence_is_scoped_to_its_school(client):
    template = NORMALISED["answer_sheet"]["events"][0]
    event = {**template, "id": "manual:school", "student_id": demo_student(), "date": "2026-10-05"}
    client.post("/evidence", headers=SCHOOL, json={"events": [event]})
    other = client.get(f"/learners/{demo_student()}", headers=as_user("admin", OTHER_SCHOOL)).json()
    assert all(e["id"] != "manual:school" for e in topic_of(other, event["topic_id"])["evidence"])


def test_evidence_persists_across_restarts_and_seeds_once(make_client):
    template = NORMALISED["answer_sheet"]["events"][0]
    event = {**template, "id": "manual:kept", "student_id": demo_student(), "date": "2026-10-05"}
    first = make_client()
    first.post("/evidence", headers=SCHOOL, json={"events": [event]})
    restarted = make_client()
    evidence = topic_of(restarted.get(f"/learners/{demo_student()}", headers=as_user("admin")).json(), event["topic_id"])["evidence"]
    assert [e["id"] for e in evidence].count("manual:kept") == 1
    assert len({e["id"] for e in evidence}) == len(evidence)


def test_the_header_wins_over_the_env_fallback(monkeypatch, db_path):
    monkeypatch.setenv("GAPANALYZER_USER", "admin")
    client = TestClient(create_app(db_path=db_path, today=lambda: TODAY))
    assert client.get("/scope", headers=SCHOOL).json()["school"] is not None
    teacher = client.get("/scope", headers=as_user("teacher")).json()
    assert teacher["school"] is None and teacher["sections"]


def test_record_refs_match_what_the_normaliser_emits():
    for entry in GOLDEN["normalised"]:
        student, kind, ref_field, value = normalise.record_key(entry["record"])
        assert all((row["student_id"], row["ref"]["kind"], row["ref"][ref_field]) == (student, kind, value) for row in entry["events"])


def test_reposting_a_record_replaces_all_of_its_earlier_events(client):
    drill = {**NORMALISED["mastery"]["record"], "student_id": demo_student(), "record_id": "drill-again", "date": "2026-10-05"}
    post = lambda record: client.post("/evidence", headers=SCHOOL, json={"records": [{"grade": 10, "subject_code": "SCI", "record": record}]}).json()
    first = post(drill)
    topics = sorted({event["topic_id"] for event in first["events"]})
    assert len(topics) >= 2
    kept = {node: state for node, state in drill["states"].items() if drill["topic_of"][node] == topics[0]}
    second = post({**drill, "states": kept})
    assert {event["topic_id"] for event in second["events"]} == {topics[0]}
    learner = client.get(f"/learners/{demo_student()}", headers=as_user("admin")).json()
    left = [e for s in learner["subjects"] for c in s["chapters"] for t in c["topics"] for e in t["evidence"] if e["ref"]["record_id"] == "drill-again"]
    assert {e["id"] for e in left} == {e["id"] for e in second["events"]}


SCIENCE = SEED["catalogs"]["10|SCI"]
CHAPTER_OF = {topic["id"]: chapter for chapter in SCIENCE["chapters"] for topic in chapter["topics"]}
SEEDED_OMR = "demo-acids"
SEEDED_SHEETS = "demo-light"


def seeded(ref_kind, field, value):
    rows = [e for e in SEED["evidence"] if e["ref"]["kind"] == ref_kind and e["ref"].get(field) == value and e["topic_id"] in CHAPTER_OF]
    student = rows[0]["student_id"]
    return student, {e["topic_id"] for e in rows if e["student_id"] == student}


def path_of(topic_id):
    chapter = CHAPTER_OF[topic_id]
    return f"{chapter['title']} > {next(t['title'] for t in chapter['topics'] if t['id'] == topic_id)}"


def rescore_record(kind, student, topics, value):
    if kind == "omr":
        questions = [{"n": i + 1, "outcome": "incorrect", "section_path": path_of(t)} for i, t in enumerate(sorted(topics))]
        return {"type": "omr", "sheet_id": f"omr-rescore-{student}", "student_id": student, "paper_id": value, "paper_title": "OMR rescore", "date": "2026-10-05", "questions": questions}
    if kind == "answer_sheet":
        questions = [{"n": i + 1, "awarded": 0, "max": 4, "section_path": path_of(t)} for i, t in enumerate(sorted(topics))]
        return {"type": "answer_sheet", "sheet_id": f"sheet-rescore-{student}", "student_id": student, "paper_id": value, "paper_title": "Sheet rescore", "date": "2026-10-05", "questions": questions}
    chapters = sorted({CHAPTER_OF[t]["id"] for t in topics})
    return {"type": "exam_mark", "mark_id": f"mark-rescore-{student}", "student_id": student, "exam_id": value, "exam_name": "Rescore", "subject_name": "Science", "marks": 0, "max": 80, "date": "2026-10-05", "syllabus_chapter_ids": chapters}


RESCORE = [
    ("omr", "omr_sheet", SEEDED_OMR, "paper_id"),
    ("answer_sheet", "answer_sheet", SEEDED_SHEETS, "paper_id"),
    ("exam_mark", "exam_mark", next(e["ref"]["exam_id"] for e in SEED["evidence"] if e["ref"]["kind"] == "exam_mark" and e["topic_id"] in CHAPTER_OF), "exam_id"),
]


@pytest.mark.parametrize("kind,ref_kind,value,field", RESCORE, ids=[row[0] for row in RESCORE])
def test_rescoring_a_seeded_paper_replaces_its_evidence(client, kind, ref_kind, value, field):
    student, topics = seeded(ref_kind, field, value)
    before = client.get(f"/learners/{student}", headers=as_user("admin")).json()
    record = rescore_record(kind, student, topics, value)
    posted = client.post("/evidence", headers=SCHOOL, json={"records": [{"grade": 10, "subject_code": "SCI", "record": record}]})
    assert posted.status_code == 201, posted.text
    assert {e["topic_id"] for e in posted.json()["events"]} == topics
    after = client.get(f"/learners/{student}", headers=as_user("admin")).json()
    for topic_id in topics:
        old, new = topic_of(before, topic_id), topic_of(after, topic_id)
        assert len(new["evidence"]) == len(old["evidence"])
        mine = [e for e in new["evidence"] if e["ref"]["kind"] == ref_kind and e["ref"].get(field) == value]
        assert len(mine) == 1 and mine[0]["signal"] == 0
        old_signal = next(e["signal"] for e in old["evidence"] if e["ref"]["kind"] == ref_kind and e["ref"].get(field) == value)
        if old_signal > 0:
            assert new["score"] < old["score"]


def test_a_record_that_matches_no_topic_is_refused_and_leaves_evidence_untouched(client):
    student, topics = seeded("omr_sheet", "paper_id", SEEDED_OMR)
    before = client.get(f"/learners/{student}", headers=as_user("admin")).json()
    stray = {**rescore_record("omr", student, topics, SEEDED_OMR), "questions": [{"n": 1, "outcome": "incorrect", "section_path": "Nowhere > Nothing"}]}
    good = rescore_record("answer_sheet", student, topics, SEEDED_SHEETS)
    body = {"records": [{"grade": 10, "subject_code": "SCI", "record": good}, {"grade": 10, "subject_code": "SCI", "record": stray}]}
    refused(client.post("/evidence", headers=SCHOOL, json=body), 422, "no_topics_matched")
    refused(client.post("/evidence", headers=SCHOOL, json={"records": [{"grade": 10, "subject_code": "SCI", "record": {**NORMALISED["flashcards"]["record"], "student_id": student, "chapter_title": "Life Processes", "standings": [{"label": "Life Processes", "cards": 3, "correct": 1}]}}]}), 422, "no_topics_matched")
    after = client.get(f"/learners/{student}", headers=as_user("admin")).json()
    assert after == before


def test_demo_reset_restores_the_seed_exactly_and_only_for_its_school(monkeypatch, make_client):
    monkeypatch.setenv("GAPANALYZER_DEMO_RESET", "1")
    client = make_client()
    student, topics = seeded("answer_sheet", "paper_id", SEEDED_SHEETS)
    section_id = next(p["section_id"] for p in SEED["pupils"] if p["student_id"] == student)
    class_view = lambda: client.get(f"/sections/{section_id}/subjects/SCI", headers=as_user("admin")).json()
    before, class_before = client.get(f"/learners/{student}", headers=as_user("admin")).json(), class_view()
    rescored = rescore_record("answer_sheet", student, topics, SEEDED_SHEETS)
    fresh = rescore_record("answer_sheet", student, topics, "mock-paper-1")
    manual = {**NORMALISED["answer_sheet"]["events"][0], "id": "manual:rehearsal", "student_id": student, "date": "2026-10-05"}
    body = {"events": [manual], "records": [{"grade": 10, "subject_code": "SCI", "record": record} for record in (rescored, fresh)]}
    posted = client.post("/evidence", headers=SCHOOL, json=body)
    assert posted.status_code == 201, posted.text
    client.post("/evidence", headers=OTHER_SCHOOL, json={"events": [manual]})
    assert client.get(f"/learners/{student}", headers=as_user("admin")).json() != before
    assert class_view() != class_before

    replaced = sum(1 for e in SEED["evidence"] if e["student_id"] == student and e["ref"]["kind"] == "answer_sheet" and e["ref"].get("paper_id") == SEEDED_SHEETS)
    reset = client.post("/demo/reset", headers=SCHOOL)
    assert reset.status_code == 200, reset.text
    added = {e["id"] for e in posted.json()["events"]} - {e["id"] for e in SEED["evidence"]}
    assert reset.json() == {"removed": len(added), "restored": replaced}
    assert client.get(f"/learners/{student}", headers=as_user("admin")).json() == before
    assert class_view() == class_before
    assert client.post("/demo/reset", headers=SCHOOL).json() == {"removed": 0, "restored": 0}

    other = client.get(f"/learners/{student}", headers=as_user("admin", OTHER_SCHOOL)).json()
    assert any(e["id"] == "manual:rehearsal" for e in topic_of(other, manual["topic_id"])["evidence"])


@pytest.mark.parametrize("flag", [None, "0", "yes"])
def test_demo_reset_is_refused_unless_enabled(monkeypatch, make_client, flag):
    if flag is None:
        monkeypatch.delenv("GAPANALYZER_DEMO_RESET", raising=False)
    else:
        monkeypatch.setenv("GAPANALYZER_DEMO_RESET", flag)
    client = make_client()
    manual = {**NORMALISED["answer_sheet"]["events"][0], "id": "manual:kept-through-refusal", "student_id": demo_student(), "date": "2026-10-05"}
    client.post("/evidence", headers=SCHOOL, json={"events": [manual]})
    refused(client.post("/demo/reset", headers=SCHOOL), 404, "demo_reset_disabled")
    learner = client.get(f"/learners/{demo_student()}", headers=as_user("admin")).json()
    assert any(e["id"] == manual["id"] for e in topic_of(learner, manual["topic_id"])["evidence"])
