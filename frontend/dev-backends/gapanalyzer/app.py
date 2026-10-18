import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Union

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing_extensions import Annotated

from gaps import Gaps, Refusal
from store import Store

HERE = Path(__file__).resolve().parent
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

Source = Literal["exam", "omr", "answer_sheet", "paper", "mindmap", "flashcards", "debate", "read"]
RefKind = Literal["exam_mark", "answer_sheet", "omr_sheet", "practice_paper", "mastery", "flashcard_report", "debate_report"]
OmrOutcome = Literal[
    "correct", "incorrect", "blank", "multiple", "out_of_range", "not_multiple_choice", "no_options", "no_key", "ambiguous_key", "alternative_offered"
]
MasteryState = Literal["read", "missed", "shaky", "known"]
FactAssessment = Literal["correct", "mostly_correct", "partially_correct", "incorrect", "unverified"]


class Dated(BaseModel):
    date: str

    @field_validator("date")
    @classmethod
    def iso_date(cls, value: str) -> str:
        if not ISO_DATE.match(value):
            raise ValueError("must be a YYYY-MM-DD date")
        date.fromisoformat(value)
        return value


class GapRef(BaseModel):
    kind: RefKind
    record_id: str
    title: str
    student_id: str
    exam_id: Optional[str] = None
    paper_id: Optional[str] = None
    question: Optional[str] = None


class GapEvidence(Dated):
    id: str
    student_id: str
    topic_id: str
    source: Source
    signal: float = Field(ge=0, le=1)
    weight: float = Field(ge=0)
    label: str
    detail: str
    ref: GapRef


class ExamMarkRecord(Dated):
    type: Literal["exam_mark"]
    mark_id: str
    student_id: str
    exam_id: str
    exam_name: str
    subject_name: str
    marks: float
    max: float
    syllabus_chapter_ids: List[str]


class MarkedQuestion(BaseModel):
    n: int
    awarded: float
    max: float
    section_path: str


class AnswerSheetRecord(Dated):
    type: Literal["answer_sheet"]
    sheet_id: str
    student_id: str
    paper_id: str
    paper_title: str
    questions: List[MarkedQuestion]


class OmrQuestion(BaseModel):
    n: int
    outcome: OmrOutcome
    section_path: str


class OmrRecord(Dated):
    type: Literal["omr"]
    sheet_id: str
    student_id: str
    paper_id: str
    paper_title: str
    questions: List[OmrQuestion]


class PracticeTopic(BaseModel):
    section_path: str
    awarded: float
    max: float


class PracticeRecord(Dated):
    type: Literal["practice"]
    attempt_id: str
    student_id: str
    paper_id: str
    paper_title: str
    topics: List[PracticeTopic]


class MasteryRecord(Dated):
    type: Literal["mastery"]
    record_id: str
    student_id: str
    item_id: str
    section_id: str
    map_title: str
    states: Dict[str, MasteryState]
    topic_of: Dict[str, str]
    label_of: Dict[str, str]


class Standing(BaseModel):
    label: str
    cards: int = Field(ge=0)
    correct: int = Field(ge=0)


class FlashcardRecord(Dated):
    type: Literal["flashcards"]
    deck_id: str
    student_id: str
    title: str
    chapter_title: str
    standings: List[Standing]


class FactCheck(BaseModel):
    claim: str
    assessment: FactAssessment
    topic: str


class DebateRecord(Dated):
    type: Literal["debate"]
    session_id: str
    student_id: str
    motion: str
    chapter_title: str
    fact_checks: List[FactCheck]


SourceRecord = Annotated[
    Union[ExamMarkRecord, AnswerSheetRecord, OmrRecord, PracticeRecord, MasteryRecord, FlashcardRecord, DebateRecord],
    Field(discriminator="type"),
]


class RecordWrite(BaseModel):
    grade: int
    subject_code: str
    record: SourceRecord


class EvidenceWrite(BaseModel):
    events: List[GapEvidence] = []
    records: List[RecordWrite] = []


def refusal_body(code: str, message: str) -> Dict[str, str]:
    return {"code": code, "message": message}


def first_problem(error: RequestValidationError) -> str:
    problems = error.errors()
    if not problems:
        return "The request is not valid."
    where = ".".join(str(part) for part in problems[0].get("loc", ()) if part != "body")
    return f"{where}: {problems[0].get('msg', 'invalid')}" if where else str(problems[0].get("msg", "invalid"))


def event_row(event: GapEvidence) -> Dict[str, Any]:
    return {**event.model_dump(exclude={"ref"}), "ref": event.ref.model_dump(exclude_none=True)}


def create_app(
    db_path: Optional[str] = None,
    seed_path: Optional[str] = None,
    today: Callable[[], date] = date.today,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> FastAPI:
    seed = json.loads(Path(seed_path or os.environ.get("GAPANALYZER_SEED", HERE / "seed" / "seed.json")).read_text(encoding="utf-8"))
    store = Store(db_path or os.environ.get("GAPANALYZER_DB", str(HERE / "gapanalyzer.db")))
    gaps = Gaps(seed, store, today, now)
    default_user = os.environ.get("GAPANALYZER_USER", "").strip() or seed["default_user"]
    demo_reset = os.environ.get("GAPANALYZER_DEMO_RESET", "").strip() == "1"
    app = FastAPI(title="gapanalyzer (dev backend)")

    @app.exception_handler(Refusal)
    async def refused(_: Request, error: Refusal) -> JSONResponse:
        return JSONResponse(refusal_body(error.code, error.message), status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(refusal_body("invalid_request", first_problem(error)), status_code=422)

    def tenant(x_school_id: Optional[str] = Header(None)) -> str:
        school_id = (x_school_id or "").strip()
        if not school_id:
            raise Refusal(400, "missing_school_id", "x-school-id header is required.")
        gaps.ensure_seeded(school_id)
        return school_id

    def caller(x_dev_user: Optional[str] = Header(None)) -> str:
        user = (x_dev_user or "").strip() or default_user
        gaps.persona(user)
        return user

    @app.get("/healthz")
    def healthz() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/scope")
    def scope(school_id: str = Depends(tenant), user: str = Depends(caller)) -> Dict[str, Any]:
        return gaps.scope(school_id, user)

    @app.get("/learners/{student_id}")
    def learner(student_id: str, school_id: str = Depends(tenant), user: str = Depends(caller)) -> Dict[str, Any]:
        return gaps.learner(school_id, user, student_id)

    @app.get("/sections/{section_id}/subjects/{code}")
    def section(section_id: str, code: str, school_id: str = Depends(tenant), user: str = Depends(caller)) -> Dict[str, Any]:
        return gaps.class_view(school_id, user, section_id, code)

    @app.get("/grades/{grade}/subjects/{code}")
    def grade(grade: int, code: str, school_id: str = Depends(tenant), user: str = Depends(caller)) -> Dict[str, Any]:
        return gaps.school(school_id, user, grade, code)

    @app.post("/evidence", status_code=201)
    def evidence(body: EvidenceWrite, school_id: str = Depends(tenant)) -> Dict[str, Any]:
        if not body.events and not body.records:
            raise Refusal(422, "empty_evidence", "Send at least one event or record.")
        events = [event_row(event) for event in body.events]
        records = [{"grade": row.grade, "subject_code": row.subject_code, "record": row.record.model_dump()} for row in body.records]
        accepted = gaps.record_events(school_id, events, records)
        return {"accepted": len(accepted), "events": accepted}

    @app.post("/demo/reset")
    def reset_demo(school_id: str = Depends(tenant)) -> Dict[str, int]:
        if not demo_reset:
            raise Refusal(404, "demo_reset_disabled", "Set GAPANALYZER_DEMO_RESET=1 to enable the demo reset.")
        return gaps.reset_demo(school_id)

    return app
