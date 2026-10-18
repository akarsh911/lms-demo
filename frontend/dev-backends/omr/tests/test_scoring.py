from scoring import AnswerKey, Response, mark

KEY = AnswerKey.model_validate(
    {
        "questions": [
            {"n": 1, "marks": 1, "answer": 1},
            {"n": 2, "marks": 1, "answer": 2},
            {"n": 3, "marks": 2, "answer": 0},
            {"n": 4, "marks": 1, "answer": None},
            {"n": 5, "marks": 1, "options": 4, "answer": 3},
        ]
    }
)


def test_every_outcome_is_priced_once():
    result = mark(
        "p1",
        KEY,
        [
            Response(n=1, chosen=[1]),
            Response(n=2, chosen=[0]),
            Response(n=3, chosen=[0, 2]),
            Response(n=4, chosen=[1]),
            Response(n=5, chosen=[7]),
            Response(n=9, chosen=[0]),
        ],
    )
    outcomes = {row.n: row.outcome for row in result.questions}
    assert outcomes == {1: "correct", 2: "incorrect", 3: "multiple", 4: "no_key", 5: "out_of_range"}
    assert result.awarded == 1
    assert result.paper_marks == 6
    assert result.markable_marks == 5
    assert result.unmarkable_questions == [4]
    assert result.unknown_questions == [9]
    assert result.complete is False
    assert result.tally["correct"] == 1 and result.tally["no_key"] == 1


def test_unanswered_is_blank_and_duplicates_merge():
    result = mark("p1", KEY, [Response(n=1, chosen=[1]), Response(n=1, chosen=[1])])
    rows = {row.n: row for row in result.questions}
    assert rows[1].outcome == "correct" and rows[1].chosen == [1]
    assert rows[2].outcome == "blank" and rows[2].awarded == 0
