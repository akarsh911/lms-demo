import io

from sheet import Layout, render
from tests.conftest import KEY, SCHOOL


def test_school_is_required(client):
    response = client.get("/api/papers/p1/key")
    assert response.status_code == 400
    assert response.json()["code"] == "missing_school"


def test_sheet_needs_a_key_first(client):
    response = client.post("/api/papers/p1/sheets", headers=SCHOOL, json={"roll_number": "01", "responses": []})
    assert response.status_code == 409
    assert response.json()["code"] == "no_answer_key"


def test_json_sheet_is_scored_persisted_and_replaced(client):
    assert client.put("/api/papers/p1/key", headers=SCHOOL, json=KEY).json()["rescored"] == 0
    body = {"roll_number": "07", "name": "Aman", "responses": [{"n": 1, "chosen": [1]}, {"n": 3, "chosen": [0]}]}
    first = client.post("/api/papers/p1/sheets", headers=SCHOOL, json=body).json()
    assert first["result"]["awarded"] == 3
    assert first["source"] == "json"
    body["responses"] = [{"n": 1, "chosen": [0]}]
    again = client.post("/api/papers/p1/sheets", headers=SCHOOL, json=body).json()
    assert again["id"] == first["id"] and again["result"]["awarded"] == 0
    listed = client.get("/api/papers/p1/sheets", headers=SCHOOL).json()["sheets"]
    assert [row["roll_number"] for row in listed] == ["07"]
    assert client.get("/api/papers/p1/sheets", headers={"x-school-id": "OTHER"}).json()["sheets"] == []


def test_changing_the_key_rescores_stored_sheets(client):
    client.put("/api/papers/p1/key", headers=SCHOOL, json=KEY)
    client.post("/api/papers/p1/sheets", headers=SCHOOL, json={"roll_number": "01", "responses": [{"n": 2, "chosen": [3]}]})
    changed = {"questions": [dict(q, answer=3) if q["n"] == 2 else q for q in KEY["questions"]]}
    assert client.put("/api/papers/p1/key", headers=SCHOOL, json=changed).json()["rescored"] == 1
    sheet = client.get("/api/papers/p1/sheets", headers=SCHOOL).json()["sheets"][0]
    assert sheet["result"]["awarded"] == 1


def test_duplicate_question_numbers_are_refused(client):
    bad = {"questions": [{"n": 1, "marks": 1, "answer": 0}, {"n": 1, "marks": 1, "answer": 1}]}
    response = client.put("/api/papers/p1/key", headers=SCHOOL, json=bad)
    assert response.status_code == 422 and response.json()["code"] == "invalid_input"


def test_image_sheet_is_read_and_scored(client):
    client.put("/api/papers/p1/key", headers=SCHOOL, json=KEY)
    template = client.get("/api/papers/p1/template.png", headers=SCHOOL)
    assert template.status_code == 200 and template.headers["content-type"] == "image/png"
    buffer = io.BytesIO()
    render(Layout(questions=4, options=4), filled={0: [1], 1: [2], 2: [3]}).save(buffer, format="PNG")
    response = client.post(
        "/api/papers/p1/sheets/image",
        headers=SCHOOL,
        files={"image": ("12.png", buffer.getvalue(), "image/png")},
        data={"roll_number": "12", "name": "Priya"},
    )
    sheet = response.json()
    assert sheet["source"] == "image"
    assert [r["chosen"] for r in sheet["responses"]] == [[1], [2], [3], []]
    assert sheet["result"]["awarded"] == 2


def test_garbage_upload_is_refused(client):
    client.put("/api/papers/p1/key", headers=SCHOOL, json=KEY)
    response = client.post(
        "/api/papers/p1/sheets/image",
        headers=SCHOOL,
        files={"image": ("x.png", b"not an image", "image/png")},
        data={"roll_number": "12"},
    )
    assert response.status_code == 422 and response.json()["code"] == "unreadable_image"
