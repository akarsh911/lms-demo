import pytest

import normalise
from conftest import GOLDEN, SEED, as_user


def case_id(case):
    return f"{case['user']} {case['path']}"


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=case_id)
def test_endpoint_matches_the_typescript_fixture(shared_client, case):
    response = shared_client.get(case["path"], headers=as_user(case["user"]))
    expected = case["response"]
    assert response.status_code == expected["status"], response.text
    if expected["status"] == 200:
        assert response.json() == expected["body"]
    else:
        assert response.json()["code"] == expected["body"]["code"]


@pytest.mark.parametrize("entry", GOLDEN["normalised"], ids=lambda entry: record_key(entry["record"]))
def test_normaliser_matches_the_typescript_one(entry):
    subject = SEED["catalogs"][f"{entry['grade']}|{entry['subject_code']}"]
    assert normalise.normalise(entry["record"], subject) == entry["events"]


EMPTY_ON_PURPOSE = {"mark-y", "deck-y"}


def record_key(record):
    return record.get("mark_id") or record.get("deck_id") or record["type"]


def test_normalisers_cover_every_record_type():
    types = {entry["record"]["type"] for entry in GOLDEN["normalised"]}
    assert types == {"exam_mark", "answer_sheet", "omr", "practice", "mastery", "flashcards", "debate"}
    for entry in GOLDEN["normalised"]:
        assert bool(entry["events"]) == (record_key(entry["record"]) not in EMPTY_ON_PURPOSE)
