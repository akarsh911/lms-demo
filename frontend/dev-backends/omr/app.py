import io
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, File, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response as RawResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from scoring import AnswerKey, MarkingResult, Response, mark
from sheet import MAX_QUESTIONS, Layout, read, render
from store import Store

HERE = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 15 * 1024 * 1024


class Refusal(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class SheetIn(BaseModel):
    model_config = {"extra": "forbid"}

    roll_number: str = Field(min_length=1, max_length=32)
    name: str = Field(default="", max_length=120)
    responses: List[Response]


class SheetResult(BaseModel):
    id: int
    paper_id: str
    roll_number: str
    name: str
    source: Literal["json", "image"]
    responses: List[Response]
    result: MarkingResult
    scored_at: str


class KeySaved(BaseModel):
    key: AnswerKey
    rescored: int


class SheetList(BaseModel):
    sheets: List[SheetResult]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def school(x_school_id: Optional[str] = Header(default=None)) -> str:
    value = (x_school_id or "").strip()
    if not value:
        raise Refusal(400, "missing_school", "x-school-id is required: every key and sheet belongs to one school")
    return value


def _layout(key: AnswerKey) -> Layout:
    return Layout(questions=len(key.questions), options=max(q.options for q in key.questions))


def create_app(db_path: Optional[str] = None) -> FastAPI:
    store = Store(db_path or os.environ.get("OMR_DB", str(HERE / "omr.db")))
    app = FastAPI(title="OMR dev backend", version="0.1.0")

    @app.exception_handler(Refusal)
    async def refused(_: Request, exc: Refusal) -> JSONResponse:
        return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        return JSONResponse({"code": "invalid_input", "message": f"{where}: {first.get('msg', 'invalid')}"}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"code": "not_found" if exc.status_code == 404 else "request_failed", "message": str(exc.detail)}, status_code=exc.status_code)

    def held_key(school_id: str, paper_id: str) -> AnswerKey:
        body = store.key(school_id, paper_id)
        if body is None:
            raise Refusal(409, "no_answer_key", f"paper {paper_id} has no answer key yet; PUT one first")
        return AnswerKey.model_validate(body)

    def score(school_id: str, paper_id: str, key: AnswerKey, roll: str, name: str, source: str, responses: List[Response]) -> dict:
        result = mark(paper_id, key, responses)
        return store.save_sheet(
            school_id,
            paper_id,
            {
                "roll_number": roll.strip(),
                "name": name.strip(),
                "source": source,
                "responses": [r.model_dump() for r in responses],
                "result": result.model_dump(),
                "scored_at": _now(),
            },
        )

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "max_questions": MAX_QUESTIONS}

    @app.get("/api/papers/{paper_id}/key", response_model=AnswerKey)
    def get_key(paper_id: str, school_id: str = Depends(school)) -> AnswerKey:
        return held_key(school_id, paper_id)

    @app.put("/api/papers/{paper_id}/key", response_model=KeySaved)
    def put_key(paper_id: str, key: AnswerKey, school_id: str = Depends(school)) -> KeySaved:
        numbers = [q.n for q in key.questions]
        if len(set(numbers)) != len(numbers):
            raise Refusal(422, "invalid_input", "questions: each question number may appear once")
        if len(numbers) > MAX_QUESTIONS:
            raise Refusal(422, "invalid_input", f"questions: a bubble sheet holds at most {MAX_QUESTIONS}")
        store.put_key(school_id, paper_id, key.model_dump(), _now())
        rescored = 0
        for sheet in store.sheets(school_id, paper_id):
            responses = [Response.model_validate(r) for r in sheet["responses"]]
            score(school_id, paper_id, key, sheet["roll_number"], sheet["name"], sheet["source"], responses)
            rescored += 1
        return KeySaved(key=key, rescored=rescored)

    @app.post("/api/papers/{paper_id}/sheets", response_model=SheetResult)
    def post_sheet(paper_id: str, sheet: SheetIn, school_id: str = Depends(school)) -> dict:
        key = held_key(school_id, paper_id)
        return score(school_id, paper_id, key, sheet.roll_number, sheet.name, "json", sheet.responses)

    @app.post("/api/papers/{paper_id}/sheets/image", response_model=SheetResult)
    async def post_image(
        paper_id: str,
        image: UploadFile = File(...),
        roll_number: str = Form(..., min_length=1, max_length=32),
        name: str = Form(default=""),
        school_id: str = Depends(school),
    ) -> dict:
        key = held_key(school_id, paper_id)
        raw = await image.read()
        if len(raw) > MAX_IMAGE_BYTES:
            raise Refusal(413, "too_large", "a sheet image may be at most 15 MB")
        try:
            picture = Image.open(io.BytesIO(raw))
            picture.load()
        except (UnidentifiedImageError, OSError) as exc:
            raise Refusal(422, "unreadable_image", "the upload is not an image this reader can open") from exc
        ordered = sorted(key.questions, key=lambda q: q.n)
        chosen = read(picture, _layout(key))
        responses = [Response(n=q.n, chosen=picks) for q, picks in zip(ordered, chosen)]
        return score(school_id, paper_id, key, roll_number, name, "image", responses)

    @app.get("/api/papers/{paper_id}/sheets", response_model=SheetList)
    def list_sheets(paper_id: str, school_id: str = Depends(school)) -> dict:
        return {"sheets": store.sheets(school_id, paper_id)}

    @app.delete("/api/papers/{paper_id}/sheets")
    def clear_sheets(paper_id: str, school_id: str = Depends(school)) -> dict:
        return {"deleted": store.clear_sheets(school_id, paper_id)}

    @app.get("/api/papers/{paper_id}/template.png")
    def template(paper_id: str, school_id: str = Depends(school)) -> RawResponse:
        key = held_key(school_id, paper_id)
        buffer = io.BytesIO()
        render(_layout(key), title=f"Answer sheet · {paper_id}").save(buffer, format="PNG")
        return RawResponse(buffer.getvalue(), media_type="image/png")

    return app
