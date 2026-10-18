import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Union

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from planner import Planner, Refusal
from store import Store

HERE = Path(__file__).resolve().parent

BlockKind = Literal["warm_up", "explanation", "activity", "check", "homework"]


class TextbookCitation(BaseModel):
    content_item_id: str
    title: str
    page_start: int
    page_end: int


class ScheduledSlot(BaseModel):
    slot_id: str
    day_of_week: int
    period_id: str
    period_name: str
    start_minute: int
    end_minute: int
    date: str


class TaughtRecord(BaseModel):
    taught_at: str
    reflection: str


class LessonBlock(BaseModel):
    id: str
    kind: BlockKind
    title: str
    minutes: int
    summary: str
    steps: List[str]
    citations: List[TextbookCitation]
    resources: List[Dict[str, Any]]
    variant: int


class LessonPeriod(BaseModel):
    id: str
    sequence: int
    focus: str
    blocks: List[LessonBlock]
    slot: Optional[ScheduledSlot]
    taught: Optional[TaughtRecord]


class DraftPlan(BaseModel):
    offering_id: str
    section_label: str
    grade: int
    subject_name: str
    curriculum_node_id: str
    chapter_title: str
    topic_titles: List[str]
    objectives: List[str]
    period_minutes: int
    periods: List[LessonPeriod]


class GenerateRequest(BaseModel):
    offering_id: str
    curriculum_node_id: str
    topic_ids: List[str]
    period_count: int
    objectives: List[str]
    focus_topics: List[str] = []


class RegenerateBlockRequest(BaseModel):
    offering_id: str
    curriculum_node_id: str
    kind: BlockKind
    focus: str
    period_sequence: int
    period_count: int
    minutes: int
    variant: int


class LessonPlanCreate(BaseModel):
    draft: DraftPlan
    title: str
    start_date: str


class LessonPlanPatch(BaseModel):
    title: Optional[str] = None
    objectives: Optional[List[str]] = None
    periods: Optional[List[LessonPeriod]] = None


class TaughtWrite(BaseModel):
    reflection: str


class TermClosure(BaseModel):
    date: str
    label: str


class TermPlanSettings(BaseModel):
    offering_id: str
    term_id: str
    start_date: str
    first_chapter_id: Optional[str]
    order: List[str]
    weights: Dict[str, Union[int, float]]
    closures: List[TermClosure]
    exam_starts: Dict[str, str]
    revision: Dict[str, int]
    extra_periods: Dict[str, int]
    deferred: Dict[str, List[str]]
    saved_at: Optional[str]


def refusal_body(code: str, message: str) -> Dict[str, str]:
    return {"code": code, "message": message}


def first_problem(error: RequestValidationError) -> str:
    problems = error.errors()
    if not problems:
        return "The request is not valid."
    where = ".".join(str(part) for part in problems[0].get("loc", ()) if part != "body")
    return f"{where}: {problems[0].get('msg', 'invalid')}" if where else str(problems[0].get("msg", "invalid"))


def create_app(
    db_path: Optional[str] = None,
    seed_path: Optional[str] = None,
    today: Callable[[], date] = date.today,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> FastAPI:
    seed = json.loads(Path(seed_path or os.environ.get("LESSONPLANNER_SEED", HERE / "seed" / "seed.json")).read_text(encoding="utf-8"))
    store = Store(db_path or os.environ.get("LESSONPLANNER_DB", str(HERE / "lessonplanner.db")), seed["seed_author_id"])
    planner = Planner(seed, store, today, now)
    default_user = os.environ.get("LESSONPLANNER_USER", "").strip() or seed["default_user"]
    demo_reset = os.environ.get("LESSONPLANNER_DEMO_RESET", "").strip() == "1"
    app = FastAPI(title="lessonplanner (dev backend)")

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
        planner.ensure_seeded(school_id)
        return school_id

    def viewer(x_dev_user: Optional[str] = Header(None)) -> Dict[str, Any]:
        return planner.persona((x_dev_user or "").strip() or default_user)

    @app.get("/healthz")
    def healthz() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/context")
    def context(_: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Dict[str, Any]:
        return planner.context(who)

    @app.get("/curricula/{curriculum_id}/outline")
    def outline(curriculum_id: str, _: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.outline(curriculum_id)

    @app.post("/generate")
    def generate(body: GenerateRequest, _: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.generate(body.model_dump())

    @app.post("/generate/block")
    def generate_block(body: RegenerateBlockRequest, _: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.regenerate_block(body.model_dump())

    @app.get("/plans")
    def list_plans(school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> List[Dict[str, Any]]:
        return planner.list_plans(school_id, who)

    @app.post("/plans", status_code=201)
    def create_plan(body: LessonPlanCreate, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Dict[str, Any]:
        return planner.create_plan(school_id, who, body.model_dump())

    @app.get("/plans/{plan_id}")
    def get_plan(plan_id: str, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Dict[str, Any]:
        return planner.get_plan(school_id, who, plan_id)

    @app.patch("/plans/{plan_id}")
    def update_plan(plan_id: str, body: LessonPlanPatch, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Dict[str, Any]:
        return planner.update_plan(school_id, who, plan_id, body.model_dump())

    @app.delete("/plans/{plan_id}", status_code=204)
    def delete_plan(plan_id: str, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Response:
        planner.delete_plan(school_id, who, plan_id)
        return Response(status_code=204)

    @app.post("/plans/{plan_id}/periods/{period_id}/taught")
    def mark_taught(
        plan_id: str, period_id: str, body: TaughtWrite, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)
    ) -> Dict[str, Any]:
        return planner.mark_taught(school_id, who, plan_id, period_id, body.reflection)

    @app.delete("/plans/{plan_id}/periods/{period_id}/taught")
    def clear_taught(plan_id: str, period_id: str, school_id: str = Depends(tenant), who: Dict[str, Any] = Depends(viewer)) -> Dict[str, Any]:
        return planner.clear_taught(school_id, who, plan_id, period_id)

    @app.get("/week")
    def week(
        start: str = Query(..., alias="from"),
        section_id: Optional[str] = Query(None),
        school_id: str = Depends(tenant),
        who: Dict[str, Any] = Depends(viewer),
    ) -> Dict[str, Any]:
        return planner.week(school_id, who, start, section_id)

    @app.get("/offerings/{offering_id}/term-context")
    def term_context(offering_id: str, school_id: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.term_context(school_id, offering_id)

    @app.get("/offerings/{offering_id}/term-plan")
    def term_plan(offering_id: str, school_id: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.term_plan(school_id, offering_id)

    @app.put("/offerings/{offering_id}/term-plan")
    def save_term_plan(offering_id: str, body: TermPlanSettings, school_id: str = Depends(tenant)) -> Dict[str, Any]:
        return planner.save_term_plan(school_id, offering_id, body.model_dump())

    @app.post("/demo/reset")
    def reset_demo(school_id: str = Depends(tenant)) -> Dict[str, int]:
        if not demo_reset:
            raise Refusal(404, "demo_reset_disabled", "Set LESSONPLANNER_DEMO_RESET=1 to enable the demo reset.")
        return planner.reset_demo(school_id)

    return app

