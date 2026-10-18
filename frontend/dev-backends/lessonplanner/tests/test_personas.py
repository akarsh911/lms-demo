import json
import sqlite3

from fastapi.testclient import TestClient

from app import create_app
from conftest import SCHOOL, TODAY


def as_user(user):
    return {**SCHOOL, "x-dev-user": user}


def titles(client, user):
    return {plan["title"] for plan in client.get("/plans", headers=as_user(user)).json()}


def create(client, user, draft, title):
    response = client.post("/plans", headers=as_user(user), json={"draft": draft, "title": title, "start_date": "2026-10-06"})
    assert response.status_code == 201, response.text
    return response.json()


def test_a_teacher_sees_only_their_own_plans_and_staff_see_all(client, draft, seed):
    seeded = {spec["title"] for spec in seed["seed_plans"]}
    teacher_seeded = {spec["title"] for spec in seed["seed_plans"] if spec["author_id"] == seed["personas"]["teacher"]["person_id"]}
    assert teacher_seeded and teacher_seeded != seeded
    by_admin = create(client, "admin", draft, "Admin plan")
    by_teacher = create(client, "teacher", draft, "Teacher plan")
    assert by_admin["author_name"] == seed["personas"]["admin"]["author_name"]
    assert by_teacher["author_name"] == seed["personas"]["teacher"]["author_name"]

    assert titles(client, "teacher") == teacher_seeded | {"Teacher plan"}
    assert titles(client, "dev") == teacher_seeded | {"Teacher plan"}
    assert titles(client, "admin") == seeded | {"Teacher plan", "Admin plan"}
    assert titles(client, "student") == set()
    assert titles(client, "parent") == set()

    assert client.get(f"/plans/{by_admin['id']}", headers=as_user("teacher")).status_code == 404
    assert client.patch(f"/plans/{by_admin['id']}", headers=as_user("teacher"), json={"title": "x"}).status_code == 404
    assert client.delete(f"/plans/{by_admin['id']}", headers=as_user("teacher")).status_code == 404
    assert client.get(f"/plans/{by_teacher['id']}", headers=as_user("student")).status_code == 404
    assert client.get(f"/plans/{by_teacher['id']}", headers=as_user("admin")).json()["title"] == "Teacher plan"
    assert client.delete(f"/plans/{by_teacher['id']}", headers=as_user("admin")).status_code == 204


def test_mine_follows_the_persona(client, seed):
    def mine(user):
        return {row["offering_id"] for row in client.get("/context", headers=as_user(user)).json()["offerings"] if row["mine"]}

    assert mine("teacher") == mine("dev") == {row["offering_id"] for row in seed["offerings"] if row["mine"]}
    assert len(mine("teacher")) == 4
    assert mine("admin") == set()


def test_the_week_shows_only_visible_plans(client, draft):
    plan = create(client, "admin", draft, "Admin week plan")
    first = plan["periods"][0]["slot"]["date"]
    params = {"from": first, "section_id": next(r["section_id"] for r in client.get("/context", headers=SCHOOL).json()["offerings"] if r["offering_id"] == plan["offering_id"])}
    seen = lambda user: {l["plan_id"] for l in client.get("/week", headers=as_user(user), params=params).json()["lessons"]}
    assert plan["id"] in seen("admin")
    assert plan["id"] not in seen("teacher")


def test_an_unknown_persona_is_refused(client):
    response = client.get("/plans", headers=as_user("headmaster"))
    assert response.status_code == 400 and response.json()["code"] == "unknown_user"


def test_the_header_wins_over_the_env_fallback(monkeypatch, db_path):
    monkeypatch.setenv("LESSONPLANNER_USER", "admin")
    client = TestClient(create_app(db_path=db_path, today=lambda: TODAY))
    assert not any(row["mine"] for row in client.get("/context", headers=SCHOOL).json()["offerings"])
    assert any(row["mine"] for row in client.get("/context", headers=as_user("teacher")).json()["offerings"])


def test_the_fallback_persona_is_the_teacher(client):
    assert any(row["mine"] for row in client.get("/context", headers=SCHOOL).json()["offerings"])


def test_plans_written_before_authors_existed_belong_to_the_seed_teacher(db_path, seed):
    legacy = {"id": "legacy-1", "offering_id": seed["offerings"][0]["offering_id"], "title": "Legacy", "periods": [], "updated_at": "2026-10-01T00:00:00.000Z"}
    db = sqlite3.connect(db_path)
    db.executescript(
        "CREATE TABLE plans (school_id TEXT NOT NULL, id TEXT NOT NULL, offering_id TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (school_id, id));"
        "CREATE TABLE seeded_schools (school_id TEXT PRIMARY KEY, seeded_at TEXT NOT NULL);"
    )
    db.execute("INSERT INTO plans VALUES (?, ?, ?, ?, ?)", ("S_42", "legacy-1", legacy["offering_id"], legacy["updated_at"], json.dumps(legacy)))
    db.execute("INSERT INTO seeded_schools VALUES ('S_42', 'x')")
    db.commit()
    db.close()
    client = TestClient(create_app(db_path=db_path, today=lambda: TODAY))
    assert titles(client, "teacher") == {"Legacy"}
    assert titles(client, "admin") == {"Legacy"}
