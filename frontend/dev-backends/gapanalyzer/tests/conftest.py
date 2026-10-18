import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = json.loads((ROOT / "tests" / "golden.json").read_text(encoding="utf-8"))
SEED = json.loads((ROOT / "seed" / "seed.json").read_text(encoding="utf-8"))
TODAY = date.fromisoformat(GOLDEN["as_of"])
SCHOOL = {"x-school-id": "S_42"}
OTHER_SCHOOL = {"x-school-id": "S_99"}


def as_user(user, headers=SCHOOL):
    return {**headers, "x-dev-user": user}


@pytest.fixture(scope="session")
def golden():
    return GOLDEN


@pytest.fixture(scope="session")
def seed():
    return SEED


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "gapanalyzer.db")


@pytest.fixture
def make_client(db_path):
    def make():
        return TestClient(create_app(db_path=db_path, today=lambda: TODAY))

    return make


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture(scope="module")
def shared_client(tmp_path_factory):
    path = str(tmp_path_factory.mktemp("gap") / "gapanalyzer.db")
    return TestClient(create_app(db_path=path, today=lambda: TODAY))
