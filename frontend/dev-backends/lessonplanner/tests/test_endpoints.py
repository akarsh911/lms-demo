from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import create_app
from conftest import OTHER_SCHOOL, SCHOOL, TODAY
from planner import Planner

ENDPOINTS = [
    ("get", "/context", None),
    ("get", "/curricula/any/outline", None),
    ("post", "/generate", {}),
    ("post", "/generate/block", {}),
    ("get", "/plans", None),
    ("post", "/plans", {}),
    ("get", "/plans/any", None),
    ("patch", "/plans/any", {}),
    ("delete", "/plans/any", None),
    ("post", "/plans/any/periods/any/taught", {"reflection": ""}),
    ("delete", "/plans/any/periods/any/taught", None),
    ("get", "/week?from=2026-10-06", None),
    ("get", "/offerings/any/term-context", None),
    ("get", "/offerings/any/term-plan", None),
    ("put", "/offerings/any/term-plan", {}),
    ("post", "/demo/reset", None),
]


def strip_ids(value):
    if isinstance(value, list):
        return [strip_ids(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_ids(inner) for key, inner in value.items() if key != "id"}
    return value


def refused(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["code"] == code
    assert response.json()["message"]


def create(client, draft, title="Plan", start="2026-10-06", headers=SCHOOL):
    response = client.post("/plans", headers=headers, json={"draft": draft, "title": title, "start_date": start})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_every_endpoint_refuses_a_request_without_a_tenant(client, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    refused(client.request(method.upper(), path, **kwargs), 400, "missing_school_id")
    refused(client.request(method.upper(), path, headers={"x-school-id": "  "}, **kwargs), 400, "missing_school_id")


def test_context_lists_the_seeded_offerings(client, seed):
    body = client.get("/context", headers=SCHOOL).json()
    assert body["today"] == "2026-10-06"
    assert len(body["offerings"]) == len(seed["offerings"])
    assert any(row["mine"] for row in body["offerings"])


def test_outline_and_unknown_curriculum(client, seeded_offering):
    body = client.get(f"/curricula/{seeded_offering['curriculum_id']}/outline", headers=SCHOOL).json()
    assert body["curriculum_id"] == seeded_offering["curriculum_id"]
    sequences = [chapter["sequence"] for chapter in body["chapters"]]
    assert sequences == sorted(sequences)
    refused(client.get("/curricula/nope/outline", headers=SCHOOL), 404, "not_found")


def test_generate_matches_the_typescript_generator(client, golden):
    for case in golden["generate"]:
        response = client.post("/generate", headers=SCHOOL, json=case["request"])
        assert response.status_code == 200, response.text
        assert strip_ids(response.json()) == case["response"], case["request"]


def test_generate_block_matches_the_typescript_generator(client, golden):
    for case in golden["blocks"]:
        response = client.post("/generate/block", headers=SCHOOL, json=case["request"])
        assert response.status_code == 200, response.text
        assert strip_ids(response.json()) == case["response"], case["request"]


def test_a_topic_focus_replaces_the_authored_guide_with_one_period_per_topic(client, seed):
    offering = next(row for row in seed["offerings"] if row["mine"] and row["subject_code"] == "MATH" and row["grade"] == 10)
    chapter = next(c for c in seed["curricula"][offering["curriculum_id"]]["chapters"] if c["title"] == "Polynomials")
    assert chapter["title"] in seed["guides"] and len(chapter["topics"]) >= 2
    request = {"offering_id": offering["offering_id"], "curriculum_node_id": chapter["id"], "period_count": 4, "objectives": []}
    focused = client.post("/generate", headers=SCHOOL, json={**request, "topic_ids": [t["id"] for t in reversed(chapter["topics"])]}).json()
    titles = [t["title"] for t in chapter["topics"]]
    foci = [period["focus"] for period in focused["periods"]]
    assert foci[: len(titles)] == titles
    assert all(focus.endswith(f": {chapter['title']}") for focus in foci[len(titles):])
    authored = [segment["focus"] for segment in seed["guides"][chapter["title"]]["segments"]]
    unfocused = client.post("/generate", headers=SCHOOL, json={**request, "topic_ids": []}).json()
    assert [period["focus"] for period in unfocused["periods"]][: len(authored)] == authored[:4]


def test_focus_topics_plan_a_reteach_on_titles_outside_the_outline(client, seed):
    offering = next(row for row in seed["offerings"] if row["grade"] == 10 and row["subject_code"] == "SCI" and row["curriculum_id"])
    chapters = {c["title"]: c for c in seed["curricula"][offering["curriculum_id"]]["chapters"]}
    life, acids = chapters["Life Processes"], chapters["Acids, Bases and Salts"]
    base = {"offering_id": offering["offering_id"], "topic_ids": [], "period_count": 3, "objectives": []}

    reteach = client.post("/generate", headers=SCHOOL, json={**base, "curriculum_node_id": life["id"], "focus_topics": ["Respiration"]}).json()
    assert reteach["topic_titles"] == ["Respiration"]
    assert [p["focus"] for p in reteach["periods"]] == ["Respiration", "Practice and consolidation: Life Processes", "Review and assessment: Life Processes"]

    omitted = client.post("/generate", headers=SCHOOL, json={**base, "curriculum_node_id": life["id"]}).json()
    empty = client.post("/generate", headers=SCHOOL, json={**base, "curriculum_node_id": life["id"], "focus_topics": []}).json()
    assert strip_ids(omitted) == strip_ids(empty)
    assert omitted["topic_titles"] == [] and omitted["periods"][0]["focus"] == seed["guides"]["Life Processes"]["segments"][0]["focus"]

    chosen = acids["topics"][1]
    mixed = client.post("/generate", headers=SCHOOL, json={**base, "curriculum_node_id": acids["id"], "topic_ids": [chosen["id"]], "focus_topics": [chosen["title"], "Neutralisation"]}).json()
    assert mixed["topic_titles"] == [chosen["title"], "Neutralisation"]


def test_generate_refusals(client, golden):
    request = golden["generate"][0]["request"]
    for count in (0, 9):
        refused(client.post("/generate", headers=SCHOOL, json={**request, "period_count": count}), 422, "invalid_period_count")
    refused(client.post("/generate", headers=SCHOOL, json={**request, "offering_id": "nope"}), 404, "not_found")
    refused(client.post("/generate", headers=SCHOOL, json={**request, "curriculum_node_id": "nope"}), 404, "not_found")
    refused(client.post("/generate", headers=SCHOOL, json={"offering_id": request["offering_id"]}), 422, "invalid_request")


def test_generate_block_refusals(client, golden):
    request = golden["blocks"][0]["request"]
    refused(client.post("/generate/block", headers=SCHOOL, json={**request, "period_sequence": 0}), 422, "invalid_period")
    refused(client.post("/generate/block", headers=SCHOOL, json={**request, "kind": "lecture"}), 422, "invalid_request")
    refused(client.post("/generate/block", headers=SCHOOL, json={**request, "offering_id": "nope"}), 404, "not_found")


def test_seeded_plans_match_the_fixture_schedule(client, seed):
    plans = {plan["id"]: plan for plan in client.get("/plans", headers={**SCHOOL, "x-dev-user": "admin"}).json()}
    assert set(plans) == {spec["id"] for spec in seed["seed_plans"]}
    for spec in seed["seed_plans"]:
        plan = plans[spec["id"]]
        assert (plan["title"], plan["author_name"], plan["created_at"], plan["updated_at"]) == (spec["title"], spec["author_name"], spec["created_at"], spec["created_at"])
        assert [f"{p['slot']['date']}|{p['slot']['period_id']}" if p["slot"] else None for p in plan["periods"]] == spec["slots"]
        assert [p["taught"]["reflection"] if p["taught"] else None for p in plan["periods"]] == spec["reflections"]
        assert all(p["taught"]["taught_at"] == f"{p['slot']['date']}T09:00:00.000Z" for p in plan["periods"] if p["taught"])
        taught = sum(1 for note in spec["reflections"] if note)
        expected = "scheduled" if taught == 0 else "taught" if taught == spec["period_count"] else "in_progress"
        assert plan["status"] == expected
    statuses = {plan["title"]: plan["status"] for plan in plans.values()}
    assert statuses["Linear pairs: graphs to elimination"] == "in_progress"
    assert statuses["How organisms reproduce"] == "in_progress"


def test_the_seed_does_not_depend_on_today(seed):
    assert all(spec["start"] < "2026-10-06" for spec in seed["seed_plans"])
    assert all("start_offset_days" not in spec for spec in seed["seed_plans"])


def test_create_get_patch_delete(client, draft):
    plan = create(client, draft, title="  Triangles week  ")
    assert plan["title"] == "Triangles week"
    assert plan["status"] == "scheduled"
    assert plan["author_name"]
    slots = [period["slot"] for period in plan["periods"]]
    assert all(slot and slot["date"] >= "2026-10-06" for slot in slots)
    others = [
        period["slot"]
        for other in client.get("/plans", headers=SCHOOL).json()
        if other["id"] != plan["id"]
        for period in other["periods"]
        if period["slot"]
    ]
    assert not {(s["date"], s["period_id"]) for s in slots} & {(s["date"], s["period_id"]) for s in others}

    assert client.get(f"/plans/{plan['id']}", headers=SCHOOL).json() == plan

    patched = client.patch(f"/plans/{plan['id']}", headers=SCHOOL, json={"title": "   ", "objectives": ["One"]}).json()
    assert patched["title"] == "Untitled plan"
    assert patched["objectives"] == ["One"]
    assert patched["periods"] == plan["periods"]

    shortened = client.patch(f"/plans/{plan['id']}", headers=SCHOOL, json={"periods": plan["periods"][:1]}).json()
    assert len(shortened["periods"]) == 1

    assert client.delete(f"/plans/{plan['id']}", headers=SCHOOL).status_code == 204
    refused(client.get(f"/plans/{plan['id']}", headers=SCHOOL), 404, "not_found")


def test_unknown_plan_is_refused_everywhere(client):
    refused(client.get("/plans/nope", headers=SCHOOL), 404, "not_found")
    refused(client.patch("/plans/nope", headers=SCHOOL, json={"title": "x"}), 404, "not_found")
    refused(client.delete("/plans/nope", headers=SCHOOL), 404, "not_found")
    refused(client.post("/plans/nope/periods/x/taught", headers=SCHOOL, json={"reflection": ""}), 404, "not_found")
    refused(client.delete("/plans/nope/periods/x/taught", headers=SCHOOL), 404, "not_found")


def test_create_refusals(client, draft):
    body = {"draft": draft, "title": "x", "start_date": "2026-10-06"}
    refused(client.post("/plans", headers=SCHOOL, json={**body, "title": " "}), 422, "invalid_title")
    refused(client.post("/plans", headers=SCHOOL, json={**body, "draft": {**draft, "periods": []}}), 422, "invalid_periods")
    refused(client.post("/plans", headers=SCHOOL, json={**body, "start_date": "6 Oct"}), 422, "invalid_start_date")
    refused(client.post("/plans", headers=SCHOOL, json={**body, "draft": {**draft, "offering_id": "nope"}}), 404, "not_found")
    refused(client.patch("/plans/any", headers=SCHOOL, json={"periods": [{"id": "p"}]}), 422, "invalid_request")


def test_mark_and_clear_taught(client, draft):
    plan = create(client, draft)
    period = plan["periods"][0]["id"]
    taught = f"/plans/{plan['id']}/periods/{period}/taught"
    marked = client.post(taught, headers=SCHOOL, json={"reflection": "  went well  "}).json()
    assert marked["periods"][0]["taught"]["reflection"] == "went well"
    assert marked["periods"][0]["taught"]["taught_at"].endswith("Z")
    assert marked["status"] == "in_progress"
    cleared = client.delete(taught, headers=SCHOOL).json()
    assert cleared["periods"][0]["taught"] is None
    assert cleared["status"] == "scheduled"
    refused(client.post(f"/plans/{plan['id']}/periods/nope/taught", headers=SCHOOL, json={"reflection": ""}), 404, "not_found")
    refused(client.delete(f"/plans/{plan['id']}/periods/nope/taught", headers=SCHOOL), 404, "not_found")
    refused(client.post(taught, headers=SCHOOL, json={}), 422, "invalid_request")


def test_plans_are_scoped_to_their_school(client, draft):
    plan = create(client, draft, title="Mine")
    refused(client.get(f"/plans/{plan['id']}", headers=OTHER_SCHOOL), 404, "not_found")
    refused(client.delete(f"/plans/{plan['id']}", headers=OTHER_SCHOOL), 404, "not_found")
    other = client.get("/plans", headers=OTHER_SCHOOL).json()
    assert "Mine" not in {p["title"] for p in other}
    assert len(other) == 2


def test_plans_persist_across_restarts_and_seed_once(make_client, draft):
    plan = create(make_client(), draft, title="Kept")
    restarted = make_client()
    titles = [p["title"] for p in restarted.get("/plans", headers=SCHOOL).json()]
    assert titles.count("Kept") == 1
    assert len(titles) == 3
    assert restarted.get(f"/plans/{plan['id']}", headers=SCHOOL).json() == plan


def test_week_shows_scheduled_lessons(client, draft, seeded_offering):
    plan = create(client, draft, title="Week plan")
    first = plan["periods"][0]["slot"]
    week = client.get("/week", headers=SCHOOL, params={"from": first["date"]}).json()
    assert date.fromisoformat(week["from"]).isoweekday() == 1
    assert len(week["days"]) == 5
    assert week["periods"]
    hit = [lesson for lesson in week["lessons"] if lesson["plan_id"] == plan["id"]]
    assert hit and hit[0]["date"] == first["date"] and hit[0]["period_sequence"] == 1 and hit[0]["period_count"] == 3
    section = client.get("/week", headers=SCHOOL, params={"from": first["date"], "section_id": seeded_offering["section_id"]}).json()
    assert section["section_label"] == plan["section_label"]
    refused(client.get("/week", headers=SCHOOL, params={"from": "yesterday"}), 422, "invalid_date")
    refused(client.get("/week", headers=SCHOOL), 422, "invalid_request")


def test_term_context(client, seeded_offering):
    body = client.get(f"/offerings/{seeded_offering['offering_id']}/term-context", headers=SCHOOL).json()
    assert body["offering_id"] == seeded_offering["offering_id"]
    assert body["current_term_id"] == body["terms"][1]["id"]
    assert body["chapters"] and body["exams"] and body["days"]
    assert len(body["taught"]) == 3
    refused(client.get("/offerings/nope/term-context", headers=SCHOOL), 404, "not_found")


def test_term_plan_defaults_saves_and_refuses(client, seeded_offering):
    path = f"/offerings/{seeded_offering['offering_id']}/term-plan"
    default = client.get(path, headers=SCHOOL).json()
    assert default["saved_at"] is None
    assert default["first_chapter_id"]

    closure = {"date": "2026-10-07", "label": "Sports day"}
    saved = client.put(path, headers=SCHOOL, json={**default, "closures": [closure], "weights": {"x": 4}}).json()
    assert saved["saved_at"].endswith("Z")
    assert saved["weights"] == {"x": 4}
    assert client.get(path, headers=SCHOOL).json() == saved
    assert client.get(path, headers=OTHER_SCHOOL).json()["saved_at"] is None

    refused(client.put(path, headers=SCHOOL, json={**default, "term_id": "nope"}), 422, "invalid_term")
    refused(client.put(path, headers=SCHOOL, json={**default, "closures": [{"date": "soon", "label": "x"}]}), 422, "invalid_closure")
    refused(client.put(path, headers=SCHOOL, json={**default, "closures": [{"date": "2026-10-07", "label": " "}]}), 422, "invalid_closure")
    refused(client.put("/offerings/nope/term-plan", headers=SCHOOL, json=default), 404, "not_found")
    other = client.get("/context", headers=SCHOOL).json()["offerings"][0]["offering_id"]
    refused(client.put(f"/offerings/{other}/term-plan", headers=SCHOOL, json=default), 422, "offering_mismatch")
    refused(client.get("/offerings/nope/term-plan", headers=SCHOOL), 404, "not_found")


def test_term_plan_defaults_match_the_typescript_planner(client, golden):
    assert golden["term_plans"]
    for case in golden["term_plans"]:
        assert client.get(f"/offerings/{case['offering_id']}/term-plan", headers=SCHOOL).json() == case["response"]


def test_resume_at_skips_chapters_taught_to_their_weight(client, seed):
    science = next(spec for spec in seed["seed_plans"] if spec["title"] == "Control and Coordination")
    offering = science["offering_id"]
    context = client.get(f"/offerings/{offering}/term-context", headers=SCHOOL).json()
    first = client.get(f"/offerings/{offering}/term-plan", headers=SCHOOL).json()["first_chapter_id"]
    taught = {chapter["id"]: sum(1 for row in context["taught"] if row["chapter_id"] == chapter["id"]) for chapter in context["chapters"]}
    chosen = next(chapter for chapter in context["chapters"] if chapter["id"] == first)
    skipped = [chapter for chapter in context["chapters"] if chapter["sequence"] < chosen["sequence"] and taught[chapter["id"]] >= chapter["weight"]]
    assert taught[first] < chosen["weight"]
    assert science["curriculum_node_id"] in {chapter["id"] for chapter in skipped}


def test_resume_at_falls_back_to_the_last_chapter_when_everything_is_taught(client, seed, seeded_offering):
    context = client.get(f"/offerings/{seeded_offering['offering_id']}/term-context", headers=SCHOOL).json()
    every_period = [{"date": "2026-08-03", "period_id": "p", "chapter_id": c["id"]} for c in context["chapters"] for _ in range(c["weight"])]
    planner = Planner(seed, None, lambda: TODAY, lambda: None)
    assert planner.default_term_plan({**context, "taught": every_period})["first_chapter_id"] == context["chapters"][-1]["id"]
    assert planner.default_term_plan({**context, "taught": every_period, "chapters": []})["first_chapter_id"] is None


def test_a_saved_closure_blocks_scheduling_and_closes_the_week(client, seeded_offering, draft):
    path = f"/offerings/{seeded_offering['offering_id']}/term-plan"
    probe = create(client, draft, title="Probe", start="2026-10-12")
    first_day = probe["periods"][0]["slot"]["date"]
    client.delete(f"/plans/{probe['id']}", headers=SCHOOL)

    default = client.get(path, headers=SCHOOL).json()
    client.put(path, headers=SCHOOL, json={**default, "closures": [{"date": first_day, "label": "Sports day"}]})
    plan = create(client, draft, title="After", start="2026-10-12")
    assert first_day not in {period["slot"]["date"] for period in plan["periods"]}

    params = {"from": first_day, "section_id": seeded_offering["section_id"]}
    week = client.get("/week", headers=SCHOOL, params=params).json()
    assert not any(l["date"] == first_day and l["offering_id"] == seeded_offering["offering_id"] for l in week["lessons"])


def test_term_context_includes_taught_periods_from_before_the_term(client, seed):
    offering = next(spec["offering_id"] for spec in seed["seed_plans"] if spec["title"] == "Control and Coordination")
    science = [spec for spec in seed["seed_plans"] if spec["offering_id"] == offering]
    taught = client.get(f"/offerings/{offering}/term-context", headers=SCHOOL).json()["taught"]
    expected = sorted(slot for spec in science for slot, note in zip(spec["slots"], spec["reflections"]) if note)
    assert sorted(f"{row['date']}|{row['period_id']}" for row in taught) == expected
    assert {"2026-08", "2026-09"} <= {row["date"][:7] for row in taught}
    assert {row["chapter_id"] for row in taught} == {spec["curriculum_node_id"] for spec in science if any(spec["reflections"])}


ADMIN = {**SCHOOL, "x-dev-user": "admin"}


def school_state(client, seed):
    plans = sorted(client.get("/plans", headers=ADMIN).json(), key=lambda plan: plan["id"])
    terms = {spec["offering_id"]: client.get(f"/offerings/{spec['offering_id']}/term-plan", headers=SCHOOL).json() for spec in seed["seed_plans"]}
    return plans, terms


def test_seeded_plans_get_the_same_period_and_block_ids_every_time(make_client, seed, tmp_path):
    first = make_client().get("/plans", headers=ADMIN).json()
    other = TestClient(create_app(db_path=str(tmp_path / "other.db"), today=lambda: TODAY)).get("/plans", headers=ADMIN).json()
    assert sorted(first, key=lambda plan: plan["id"]) == sorted(other, key=lambda plan: plan["id"])


def test_demo_reset_restores_the_seed_exactly_and_only_for_its_school(monkeypatch, make_client, draft, seed):
    monkeypatch.setenv("LESSONPLANNER_DEMO_RESET", "1")
    client = make_client()
    before = school_state(client, seed)
    gone, edited = seed["seed_plans"][0], seed["seed_plans"][2]
    create(client, draft, title="Rehearsal")
    create(client, draft, title="Elsewhere", headers=OTHER_SCHOOL)
    default = client.get(f"/offerings/{edited['offering_id']}/term-plan", headers=SCHOOL).json()
    client.put(f"/offerings/{edited['offering_id']}/term-plan", headers=SCHOOL, json={**default, "closures": [{"date": "2026-10-07", "label": "Sports day"}]})
    assert client.delete(f"/plans/{gone['id']}", headers=ADMIN).status_code == 204
    period = client.get(f"/plans/{edited['id']}", headers=ADMIN).json()["periods"][0]["id"]
    client.delete(f"/plans/{edited['id']}/periods/{period}/taught", headers=ADMIN)
    assert school_state(client, seed) != before

    reset = client.post("/demo/reset", headers=SCHOOL)
    assert reset.status_code == 200, reset.text
    assert reset.json() == {"removed": 2, "restored": 2}
    assert school_state(client, seed) == before
    assert client.post("/demo/reset", headers=SCHOOL).json() == {"removed": 0, "restored": 0}
    assert "Elsewhere" in {plan["title"] for plan in client.get("/plans", headers={**OTHER_SCHOOL, "x-dev-user": "admin"}).json()}


@pytest.mark.parametrize("flag", [None, "0", "yes"])
def test_demo_reset_is_refused_unless_enabled(monkeypatch, make_client, draft, flag):
    if flag is None:
        monkeypatch.delenv("LESSONPLANNER_DEMO_RESET", raising=False)
    else:
        monkeypatch.setenv("LESSONPLANNER_DEMO_RESET", flag)
    client = make_client()
    create(client, draft, title="Kept")
    refused(client.post("/demo/reset", headers=SCHOOL), 404, "demo_reset_disabled")
    assert "Kept" in {plan["title"] for plan in client.get("/plans", headers=ADMIN).json()}
