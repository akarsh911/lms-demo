import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional, Set

import generator
from store import Store

MAX_PERIODS = 8
SCHEDULE_HORIZON_DAYS = 120
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Refusal(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found(what: str) -> Refusal:
    return Refusal(404, "not_found", f"{what} not found")


def parse_date(value: str, code: str, message: str) -> date:
    if not ISO_DATE.match(value):
        raise Refusal(422, code, message)
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise Refusal(422, code, message) from None


def add_days(iso: str, days: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=days)).isoformat()


def weekday_of(iso: str) -> int:
    return date.fromisoformat(iso).isoweekday()


def days_between(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def dates_between(start: str, end: str) -> List[str]:
    return [add_days(start, i) for i in range(days_between(start, end) + 1)]


def iso_instant(moment: datetime) -> str:
    utc = moment.astimezone(timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


def status_of(periods: List[Mapping[str, Any]]) -> str:
    taught = sum(1 for period in periods if period.get("taught") is not None)
    if taught == 0:
        return "scheduled"
    return "taught" if taught == len(periods) else "in_progress"


def stable_id(*parts: Any) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "/".join(str(part) for part in parts)))


def with_stable_ids(draft: Mapping[str, Any], plan_id: str) -> Dict[str, Any]:
    periods = [
        {
            **period,
            "id": stable_id(plan_id, period["sequence"]),
            "blocks": [{**block, "id": stable_id(plan_id, period["sequence"], index)} for index, block in enumerate(period["blocks"])],
        }
        for period in draft["periods"]
    ]
    return {**draft, "periods": periods}


class Planner:
    def __init__(self, seed: Mapping[str, Any], store: Store, today: Callable[[], date], now: Callable[[], datetime]) -> None:
        self.seed = seed
        self.store = store
        self.today = lambda: today().isoformat()
        self.now = lambda: iso_instant(now())
        self.offerings: List[Dict[str, Any]] = seed["offerings"]
        self.offering_index = {row["offering_id"]: row for row in self.offerings}
        self.chapter_index = {
            chapter["id"]: chapter for curriculum in seed["curricula"].values() for chapter in curriculum["chapters"]
        }

    def offering(self, offering_id: str) -> Dict[str, Any]:
        found = self.offering_index.get(offering_id)
        if found is None:
            raise not_found("subject offering")
        return found

    def chapter(self, node_id: str) -> Dict[str, Any]:
        found = self.chapter_index.get(node_id)
        if found is None:
            raise not_found("curriculum node")
        return found

    def persona(self, user: str) -> Dict[str, Any]:
        found = self.seed["personas"].get(user)
        if found is None:
            raise Refusal(400, "unknown_user", f"no dev persona named {user}")
        return found

    def offerings_for(self, viewer: Mapping[str, Any]) -> List[Dict[str, Any]]:
        mine = set(viewer["offering_ids"])
        return [{**row, "mine": row["offering_id"] in mine} for row in self.offerings]

    def visible_plans(self, school_id: str, viewer: Mapping[str, Any]) -> List[Dict[str, Any]]:
        if viewer["is_teacher"]:
            return self.store.plans(school_id, author_id=viewer["person_id"] or "")
        return self.store.plans(school_id) if viewer["is_staff"] else []

    def context(self, viewer: Mapping[str, Any]) -> Dict[str, Any]:
        return {"today": self.today(), "offerings": self.offerings_for(viewer)}

    def outline(self, curriculum_id: str) -> Dict[str, Any]:
        curriculum = self.seed["curricula"].get(curriculum_id)
        if curriculum is None:
            raise not_found("curriculum")
        return {"curriculum_id": curriculum_id, "chapters": curriculum["chapters"]}

    def sources(self, chapter: Mapping[str, Any], topic_ids: List[str]) -> Dict[str, Any]:
        return {
            "title": chapter["title"],
            "topics": [topic["title"] for topic in chapter["topics"] if topic["id"] in topic_ids],
            "citations": chapter["citations"],
            "resources": chapter["resources"],
        }

    def generate(self, request: Mapping[str, Any]) -> Dict[str, Any]:
        offering = self.offering(request["offering_id"])
        if request["period_count"] < 1 or request["period_count"] > MAX_PERIODS:
            raise Refusal(422, "invalid_period_count", f"A plan covers between 1 and {MAX_PERIODS} periods.")
        chapter = self.chapter(request["curriculum_node_id"])
        sources = self.sources(chapter, request["topic_ids"])
        chosen = sources["topics"]
        sources["topics"] = [*chosen, *(title for title in request.get("focus_topics") or [] if title not in chosen)]
        return {
            "offering_id": offering["offering_id"],
            "section_label": offering["section_label"],
            "grade": offering["grade"],
            "subject_name": offering["subject_name"],
            "curriculum_node_id": chapter["id"],
            "chapter_title": chapter["title"],
            "topic_titles": sources["topics"],
            "objectives": list(request["objectives"]) if request["objectives"] else list(chapter["objectives"]),
            "period_minutes": offering["period_minutes"],
            "periods": generator.build_periods(self.seed["guides"], sources, request["period_count"], offering["period_minutes"]),
        }

    def regenerate_block(self, request: Mapping[str, Any]) -> Dict[str, Any]:
        offering = self.offering(request["offering_id"])
        if request["period_sequence"] < 1:
            raise Refusal(422, "invalid_period", "A block belongs to a period numbered from 1.")
        sources = self.sources(self.chapter(request["curriculum_node_id"]), [])
        segment = generator.segment_by_focus(self.seed["guides"], sources, request["focus"])
        kind = request["kind"]
        return generator.build_block(
            kind,
            request["variant"] + 1,
            segment,
            sources,
            request["period_sequence"] - 1,
            max(request["period_count"], request["period_sequence"], 1),
            request["minutes"] or generator.minutes_for(kind, offering["period_minutes"]),
        )

    def reset_demo(self, school_id: str) -> Dict[str, int]:
        with self.store.lock:
            before = self.store.plan_bodies(school_id)
            term_plans = self.store.forget_school(school_id)
            self.ensure_seeded(school_id)
            after = self.store.plan_bodies(school_id)
        removed = sum(1 for plan_id in before if plan_id not in after) + term_plans
        restored = sum(1 for plan_id, body in after.items() if before.get(plan_id) != body)
        return {"removed": removed, "restored": restored}

    def ensure_seeded(self, school_id: str) -> None:
        with self.store.lock:
            if not self.store.mark_seeded(school_id, self.now()):
                return
            for spec in self.seed["seed_plans"]:
                draft = self.generate(
                    {
                        "offering_id": spec["offering_id"],
                        "curriculum_node_id": spec["curriculum_node_id"],
                        "topic_ids": [],
                        "period_count": spec["period_count"],
                        "objectives": [],
                    }
                )
                fixed = {"id": spec["id"], "at": spec["created_at"]}
                draft = with_stable_ids(draft, spec["id"])
                plan = self.store_plan(school_id, draft, spec["title"], spec["start"], spec["author_name"], spec["author_id"], fixed)
                for period, note in zip(plan["periods"], spec["reflections"]):
                    if note and period["slot"]:
                        period["taught"] = {"taught_at": f"{period['slot']['date']}T09:00:00.000Z", "reflection": note}
                plan["status"] = status_of(plan["periods"])
                self.store.put_plan(school_id, plan)

    def blocked(self, school_id: str, offering: Mapping[str, Any]) -> Dict[str, str]:
        grade = self.seed["grades"].get(str(offering["grade"]), {"days": [], "exam_windows": []})
        settings = self.store.term_plans(school_id).get(offering["offering_id"])
        blocked = {day["date"]: day["label"] or day["kind"] for day in grade["days"] if day["kind"] != "teaching"}
        for window in grade["exam_windows"]:
            start = (settings or {}).get("exam_starts", {}).get(window["id"], window["start"])
            end = add_days(start, days_between(window["start"], window["end"]))
            for day in dates_between(start, end):
                blocked[day] = window["name"]
        for closure in (settings or {}).get("closures", []):
            blocked[closure["date"]] = closure["label"]
        return blocked

    def free_slots(self, school_id: str, offering: Mapping[str, Any], start: str, needed: int) -> List[Dict[str, Any]]:
        taken: Set[str] = {
            f"{period['slot']['date']}|{period['slot']['period_id']}"
            for plan in self.store.plans(school_id, offering["offering_id"])
            for period in plan["periods"]
            if period.get("slot")
        }
        blocked = self.blocked(school_id, offering)
        found: List[Dict[str, Any]] = []
        for offset in range(SCHEDULE_HORIZON_DAYS):
            if len(found) >= needed:
                break
            day = add_days(start, offset)
            if day in blocked:
                continue
            weekday = weekday_of(day)
            for slot in offering["week"]:
                if slot["day_of_week"] == weekday and len(found) < needed and f"{day}|{slot['period_id']}" not in taken:
                    found.append({**slot, "date": day})
        return found

    def store_plan(
        self,
        school_id: str,
        draft: Mapping[str, Any],
        title: str,
        start: str,
        author_name: str,
        author_id: str,
        fixed: Optional[Mapping[str, str]] = None,
    ) -> Dict[str, Any]:
        slots = self.free_slots(school_id, self.offering(draft["offering_id"]), start, len(draft["periods"]))
        periods = [{**period, "slot": slots[i] if i < len(slots) else None} for i, period in enumerate(draft["periods"])]
        now = fixed["at"] if fixed else self.now()
        plan = {
            **draft,
            "periods": periods,
            "id": fixed["id"] if fixed else str(uuid.uuid4()),
            "title": title,
            "author_name": author_name,
            "status": status_of(periods),
            "created_at": now,
            "updated_at": now,
        }
        self.store.put_plan(school_id, plan, author_id)
        return plan

    def list_plans(self, school_id: str, viewer: Mapping[str, Any]) -> List[Dict[str, Any]]:
        return self.visible_plans(school_id, viewer)

    def get_plan(self, school_id: str, viewer: Mapping[str, Any], plan_id: str) -> Dict[str, Any]:
        plan = None
        if viewer["is_teacher"]:
            plan = self.store.plan(school_id, plan_id, author_id=viewer["person_id"] or "")
        elif viewer["is_staff"]:
            plan = self.store.plan(school_id, plan_id)
        if plan is None:
            raise not_found("lesson plan")
        return plan

    def create_plan(self, school_id: str, viewer: Mapping[str, Any], body: Mapping[str, Any]) -> Dict[str, Any]:
        title = body["title"].strip()
        if not title:
            raise Refusal(422, "invalid_title", "A lesson plan needs a title.")
        if not body["draft"]["periods"]:
            raise Refusal(422, "invalid_periods", "A lesson plan needs at least one period.")
        start = parse_date(body["start_date"], "invalid_start_date", "start_date must be a YYYY-MM-DD date.").isoformat()
        with self.store.lock:
            return self.store_plan(school_id, body["draft"], title, start, viewer["author_name"], viewer["person_id"] or "")

    def replace(self, school_id: str, viewer: Mapping[str, Any], plan_id: str, change: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
        with self.store.lock:
            current = self.get_plan(school_id, viewer, plan_id)
            following = {**current, **change(current), "updated_at": self.now()}
            following["status"] = status_of(following["periods"])
            self.store.put_plan(school_id, following)
            return following

    def update_plan(self, school_id: str, viewer: Mapping[str, Any], plan_id: str, patch: Mapping[str, Any]) -> Dict[str, Any]:
        change: Dict[str, Any] = {}
        if patch.get("title") is not None:
            change["title"] = patch["title"].strip() or "Untitled plan"
        if patch.get("objectives") is not None:
            change["objectives"] = patch["objectives"]
        if patch.get("periods") is not None:
            change["periods"] = patch["periods"]
        return self.replace(school_id, viewer, plan_id, lambda _: change)

    def delete_plan(self, school_id: str, viewer: Mapping[str, Any], plan_id: str) -> None:
        with self.store.lock:
            self.get_plan(school_id, viewer, plan_id)
            self.store.delete_plan(school_id, plan_id)

    def set_taught(
        self, school_id: str, viewer: Mapping[str, Any], plan_id: str, period_id: str, taught: Optional[Dict[str, str]]
    ) -> Dict[str, Any]:
        def change(plan: Dict[str, Any]) -> Dict[str, Any]:
            if not any(period["id"] == period_id for period in plan["periods"]):
                raise not_found("period")
            return {"periods": [{**period, "taught": taught} if period["id"] == period_id else period for period in plan["periods"]]}

        return self.replace(school_id, viewer, plan_id, change)

    def mark_taught(self, school_id: str, viewer: Mapping[str, Any], plan_id: str, period_id: str, reflection: str) -> Dict[str, Any]:
        return self.set_taught(school_id, viewer, plan_id, period_id, {"taught_at": self.now(), "reflection": reflection.strip()})

    def clear_taught(self, school_id: str, viewer: Mapping[str, Any], plan_id: str, period_id: str) -> Dict[str, Any]:
        return self.set_taught(school_id, viewer, plan_id, period_id, None)

    def scope(self, school_id: str, viewer: Mapping[str, Any], section_id: Optional[str]) -> List[Dict[str, Any]]:
        offerings = self.offerings_for(viewer)
        if section_id:
            return [row for row in offerings if row["section_id"] == section_id]
        mine = [row for row in offerings if row["mine"]]
        if mine:
            return mine
        planned = {plan["offering_id"] for plan in self.visible_plans(school_id, viewer)}
        return [row for row in offerings if row["offering_id"] in planned]

    def week(self, school_id: str, viewer: Mapping[str, Any], start: str, section_id: Optional[str]) -> Dict[str, Any]:
        parse_date(start, "invalid_date", "from must be a YYYY-MM-DD date.")
        monday = add_days(start, 1 - weekday_of(start))
        scope = self.scope(school_id, viewer, section_id)
        scheduled = {
            f"{plan['offering_id']}|{period['slot']['date']}|{period['slot']['period_id']}": (plan, period)
            for plan in self.visible_plans(school_id, viewer)
            for period in plan["periods"]
            if period.get("slot")
        }
        blocked_of = {offering["offering_id"]: self.blocked(school_id, offering) for offering in scope}
        calendar = self.seed["calendar"]

        def closed_for(offering: Mapping[str, Any], day: str) -> Optional[str]:
            return blocked_of[offering["offering_id"]].get(day)

        days = []
        for offset in range(5):
            day = add_days(monday, offset)
            reasons = [closed_for(offering, day) for offering in scope]
            is_open = bool(calendar.get(day, {}).get("open")) if not scope else any(reason is None for reason in reasons)
            name = None if is_open else next((reason for reason in reasons if reason), None) or calendar.get(day, {}).get("name")
            days.append({"date": day, "day_of_week": offset + 1, "open": is_open, "name": name})

        lessons = []
        for day in days:
            if not day["open"]:
                continue
            for offering in scope:
                if closed_for(offering, day["date"]) is not None:
                    continue
                for slot in offering["week"]:
                    if slot["day_of_week"] != day["day_of_week"]:
                        continue
                    hit = scheduled.get(f"{offering['offering_id']}|{day['date']}|{slot['period_id']}")
                    plan, period = hit if hit else (None, None)
                    lessons.append(
                        {
                            "date": day["date"],
                            "period_id": slot["period_id"],
                            "offering_id": offering["offering_id"],
                            "section_label": offering["section_label"],
                            "subject_name": offering["subject_name"],
                            "plan_id": plan["id"] if plan else None,
                            "plan_title": plan["title"] if plan else None,
                            "period_sequence": period["sequence"] if period else None,
                            "period_count": len(plan["periods"]) if plan else None,
                            "focus": period["focus"] if period else None,
                            "taught": period.get("taught") is not None if period else False,
                        }
                    )
        sections = {row["section_label"] for row in scope}
        return {
            "from": monday,
            "to": add_days(monday, 4),
            "section_label": next(iter(sections)) if len(sections) == 1 else None,
            "days": days,
            "periods": self.seed["periods"],
            "lessons": lessons,
        }

    def taught_periods(self, school_id: str, offering_id: str) -> List[Dict[str, str]]:
        return [
            {"date": period["slot"]["date"], "period_id": period["slot"]["period_id"], "chapter_id": plan["curriculum_node_id"]}
            for plan in sorted(self.store.plans(school_id, offering_id), key=lambda row: row["created_at"])
            for period in plan["periods"]
            if period.get("taught") and period.get("slot")
        ]

    def current_term(self) -> str:
        today = self.today()
        terms = self.seed["terms"]
        found = next((term for term in terms if term["start"] <= today <= term["end"]), None)
        return (found or (terms[0] if terms else {"id": ""}))["id"]

    def term_context(self, school_id: str, offering_id: str) -> Dict[str, Any]:
        offering = self.offering(offering_id)
        syllabus = self.seed["syllabi"][offering["curriculum_id"] or f"grade:{offering['grade']}"]
        return {
            "offering_id": offering["offering_id"],
            "section_label": offering["section_label"],
            "subject_name": offering["subject_name"],
            "grade": offering["grade"],
            "today": self.today(),
            "terms": self.seed["terms"],
            "current_term_id": self.current_term(),
            "days": self.seed["grades"].get(str(offering["grade"]), {"days": []})["days"],
            "exams": syllabus["exams"],
            "units": syllabus["units"],
            "chapters": syllabus["chapters"],
            "week": offering["week"],
            "taught": self.taught_periods(school_id, offering_id),
        }

    @staticmethod
    def taught_count(context: Mapping[str, Any], chapter_id: str) -> int:
        return sum(1 for row in context["taught"] if row["chapter_id"] == chapter_id)

    def default_term_plan(self, context: Mapping[str, Any]) -> Dict[str, Any]:
        terms = self.seed["terms"]
        term = next((t for t in terms if t["id"] == context["current_term_id"]), terms[0] if terms else None)
        start = term["start"] if term else context["today"]
        finished = {chapter_id for exam in context["exams"] if exam["end"] < start for chapter_id in exam["syllabus"]}
        covered = max([0] + [c["sequence"] for c in context["chapters"] if c["id"] in finished])
        ahead = [c for c in context["chapters"] if c["sequence"] > covered]
        fallback = ahead[-1] if ahead else (context["chapters"][-1] if context["chapters"] else None)
        first = next((c for c in ahead if self.taught_count(context, c["id"]) < c["weight"]), fallback)
        return {
            "offering_id": context["offering_id"],
            "term_id": term["id"] if term else "",
            "start_date": start,
            "first_chapter_id": first["id"] if first else None,
            "order": [],
            "weights": {},
            "closures": [],
            "exam_starts": {},
            "revision": {},
            "extra_periods": {},
            "deferred": {},
            "saved_at": None,
        }

    def term_plan(self, school_id: str, offering_id: str) -> Dict[str, Any]:
        saved = self.store.term_plans(school_id).get(offering_id)
        return saved if saved is not None else self.default_term_plan(self.term_context(school_id, offering_id))

    def save_term_plan(self, school_id: str, offering_id: str, settings: Mapping[str, Any]) -> Dict[str, Any]:
        self.offering(offering_id)
        if settings["offering_id"] != offering_id:
            raise Refusal(422, "offering_mismatch", "The term plan's offering_id must match the offering in the path.")
        if not any(term["id"] == settings["term_id"] for term in self.seed["terms"]):
            raise Refusal(422, "invalid_term", "Choose a term of this academic year.")
        if any(not ISO_DATE.match(c["date"]) or not c["label"].strip() for c in settings["closures"]):
            raise Refusal(422, "invalid_closure", "Every added day needs a date and a reason.")
        saved = {**settings, "saved_at": self.now()}
        self.store.put_term_plan(school_id, saved)
        return saved
