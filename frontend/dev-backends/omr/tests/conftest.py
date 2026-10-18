import pytest
from fastapi.testclient import TestClient

from app import create_app

SCHOOL = {"x-school-id": "S_42"}

KEY = {
    "questions": [
        {"n": 1, "marks": 1, "options": 4, "answer": 1},
        {"n": 2, "marks": 1, "options": 4, "answer": 2},
        {"n": 3, "marks": 2, "options": 4, "answer": 0},
        {"n": 4, "marks": 1, "options": 4, "answer": None},
    ]
}


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(str(tmp_path / "omr.db")))
