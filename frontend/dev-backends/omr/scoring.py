from typing import Dict, List, Optional

from pydantic import BaseModel, Field

CORRECT = "correct"
INCORRECT = "incorrect"
BLANK = "blank"
MULTIPLE = "multiple"
OUT_OF_RANGE = "out_of_range"
NO_KEY = "no_key"

SCORED = (CORRECT, INCORRECT, BLANK, MULTIPLE, OUT_OF_RANGE)
OUTCOMES = SCORED + ("not_multiple_choice", "no_options", NO_KEY, "ambiguous_key", "alternative_offered")


class KeyQuestion(BaseModel):
    model_config = {"extra": "forbid"}

    n: int
    marks: float = Field(gt=0)
    options: int = Field(default=4, ge=2, le=8)
    answer: Optional[int] = None


class AnswerKey(BaseModel):
    model_config = {"extra": "forbid"}

    questions: List[KeyQuestion] = Field(min_length=1)


class Response(BaseModel):
    model_config = {"extra": "forbid"}

    n: int
    chosen: List[int] = Field(default_factory=list)


class QuestionMark(BaseModel):
    n: int
    outcome: str
    marks: float
    awarded: float
    chosen: List[int]


class MarkingResult(BaseModel):
    paper_id: str
    set_label: str = ""
    questions: List[QuestionMark]
    unknown_questions: List[int]
    awarded: float
    markable_marks: float
    paper_marks: float
    unmarkable_questions: List[int]
    unmarkable_marks: float
    complete: bool
    tally: Dict[str, int]


def merged(responses: List[Response]) -> Dict[int, List[int]]:
    out: Dict[int, List[int]] = {}
    for response in responses:
        held = out.setdefault(response.n, [])
        for index in response.chosen:
            if index not in held:
                held.append(index)
    return out


def mark_one(question: KeyQuestion, chosen: List[int]) -> QuestionMark:
    def verdict(outcome: str, awarded: float = 0.0) -> QuestionMark:
        return QuestionMark(n=question.n, outcome=outcome, marks=question.marks, awarded=awarded, chosen=list(chosen))

    if question.answer is None or not 0 <= question.answer < question.options:
        return verdict(NO_KEY)
    if not chosen:
        return verdict(BLANK)
    if len(chosen) > 1:
        return verdict(MULTIPLE)
    picked = chosen[0]
    if not 0 <= picked < question.options:
        return verdict(OUT_OF_RANGE)
    return verdict(CORRECT, question.marks) if picked == question.answer else verdict(INCORRECT)


def mark(paper_id: str, key: AnswerKey, responses: List[Response]) -> MarkingResult:
    answered = merged(responses)
    numbers = {question.n for question in key.questions}
    rows = [mark_one(question, answered.get(question.n, [])) for question in sorted(key.questions, key=lambda q: q.n)]
    scored = [row for row in rows if row.outcome in SCORED]
    unmarkable = [row for row in rows if row.outcome not in SCORED]
    tally = {outcome: 0 for outcome in OUTCOMES}
    for row in rows:
        tally[row.outcome] = tally.get(row.outcome, 0) + 1
    return MarkingResult(
        paper_id=paper_id,
        questions=rows,
        unknown_questions=sorted(n for n in answered if n not in numbers),
        awarded=sum(row.awarded for row in rows),
        markable_marks=sum(row.marks for row in scored),
        paper_marks=sum(row.marks for row in rows),
        unmarkable_questions=[row.n for row in unmarkable],
        unmarkable_marks=sum(row.marks for row in unmarkable),
        complete=not unmarkable,
        tally=tally,
    )
