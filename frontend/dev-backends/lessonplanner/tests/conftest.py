import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app

ROOT = Path(__file__).resolve().parent.parent

TODAY = date(2026, 10, 6)
SCHOOL = {"x-school-id": "S_42"}
OTHER_SCHOOL = {"x-school-id": "S_99"}


@pytest.fixture(scope="session")
def seed():
    return json.loads((ROOT / "seed" / "seed.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def golden():
    return json.loads((ROOT / "tests" / "golden.json").read_text(encoding="utf-8"))


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "lessonplanner.db")


@pytest.fixture
def make_client(db_path):
    def make():
        return TestClient(create_app(db_path=db_path, today=lambda: TODAY))

    return make


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def seeded_offering(seed):
    return next(row for row in seed["offerings"] if row["offering_id"] == seed["seed_plans"][0]["offering_id"])


@pytest.fixture
def draft(client, seeded_offering, seed):
    chapter = seed["curricula"][seeded_offering["curriculum_id"]]["chapters"][3]
    response = client.post(
        "/generate",
        headers=SCHOOL,
        json={
            "offering_id": seeded_offering["offering_id"],
            "curriculum_node_id": chapter["id"],
            "topic_ids": [],
            "period_count": 3,
            "objectives": [],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()
