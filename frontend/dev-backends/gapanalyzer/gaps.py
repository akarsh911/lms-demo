from datetime import date, datetime
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Set

import engine
from normalise import normalise, record_key
from store import Store

Row = Dict[str, Any]


class Refusal(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class Gaps:
    def __init__(self, seed: Mapping[str, Any], store: Store, today: Callable[[], date], now: Callable[[], datetime]) -> None:
        self.seed = seed
        self.store = store
        self.today = lambda: today().isoformat()
        self.now = lambda: now().isoformat()
        self.pupils: List[Row] = seed["pupils"]
        self.pupil_index: Dict[str, Row] = {}
        for pupil in self.pupils:
            self.pupil_index.setdefault(pupil["student_id"], pupil)
        self.section_index = {section["id"]: section for section in seed["sections"]}
        self.topic_subject: Dict[str, str] = {
            topic["id"]: key for key, subject in seed["catalogs"].items() for chapter in subject["chapters"] for topic in chapter["topics"]
        }
        self.cache: Dict[tuple, List[Row]] = {}

    def ensure_seeded(self, school_id: str) -> None:
        with self.store.lock:
            if self.store.seed_school(school_id, self.now(), self.seed["evidence"]):
                self.forget(school_id)

    def reset_demo(self, school_id: str) -> Dict[str, int]:
        with self.store.lock:
            counts = self.store.reset_school(school_id, self.seed["evidence"])
            self.forget(school_id)
            return counts

    def forget(self, school_id: str) -> None:
        for key in [key for key in self.cache if key[0] == school_id]:
            del self.cache[key]

    def persona(self, user: str) -> Row:
        found = self.seed["personas"].get(user)
        if found is None:
            raise Refusal(400, "unknown_user", f"no dev persona named {user}")
        return found

    def reach(self, user: str) -> Set[str]:
        return set(self.persona(user)["reach"])

    def catalog_for(self, grade: int, code: str) -> Optional[Row]:
        return self.seed["catalogs"].get(f"{grade}|{code}")

    def subject_codes_for(self, grade: int) -> List[str]:
        return self.seed["subject_codes"].get(str(grade), [])

    def pupils_of(self, section_id: str) -> List[Row]:
        return [pupil for pupil in self.pupils if pupil["section_id"] == section_id]

    def section_label(self, pupil: Row) -> str:
        name = self.section_index[pupil["section_id"]]["name"] or ""
        return f"Class {pupil['grade']} {name}".strip()

    def learner_ref(self, pupil: Row) -> Row:
        return {
            "student_id": pupil["student_id"],
            "name": pupil["name"],
            "section_id": pupil["section_id"],
            "section_label": self.section_label(pupil),
            "grade": pupil["grade"],
            "roll_number": pupil["roll"],
        }

    def evidence_for(self, school_id: str, pupils: Sequence[Row]) -> Dict[str, List[Row]]:
        return self.store.evidence_of(school_id, [pupil["student_id"] for pupil in pupils])

    def has_evidence(self, pupil: Row, code: str, stored: Sequence[Row]) -> bool:
        if pupil["grade"] == self.seed["evidence_grade"] and code in self.seed["evidence_subjects"]:
            return True
        key = f"{pupil['grade']}|{code}"
        return any(self.topic_subject.get(row["topic_id"]) == key for row in stored)

    def individuals(self, user: str) -> Row:
        reach = self.reach(user)
        ids = self.persona(user)["student_ids"]
        me = self.pupil_index.get(ids[0]) if "self" in reach and ids else None
        wards = [self.pupil_index[sid] for sid in ids if sid in self.pupil_index] if "guardian_ward" in reach else []
        return {"self": me, "wards": wards}

    def taught_sections(self, school_id: str) -> List[Row]:
        rows = self.seed["offerings"]
        section_ids = list(dict.fromkeys(row["section_id"] for row in rows if row["mine"]))
        out = []
        for section_id in section_ids:
            own = [row for row in rows if row["section_id"] == section_id and row["curriculum_id"]]
            if not own:
                continue
            pupils = self.pupils_of(section_id)
            stored = self.evidence_for(school_id, pupils)
            subjects = [{"code": row["subject_code"], "name": row["subject_name"], "mine": row["mine"], "offering_id": row["offering_id"]} for row in own]
            out.append(
                {
                    "section_id": section_id,
                    "label": own[0]["section_label"],
                    "grade": own[0]["grade"],
                    "subjects": sorted(subjects, key=lambda subject: not subject["mine"]),
                    "learners_with_evidence": sum(
                        1 for pupil in pupils if any(self.has_evidence(pupil, row["subject_code"], stored[pupil["student_id"]]) for row in own)
                    ),
                }
            )
        return out

    def scope(self, school_id: str, user: str) -> Row:
        reach = self.reach(user)
        people = self.individuals(user)
        sections = self.taught_sections(school_id) if "teacher_assignment" in reach else []
        return {
            "as_of": self.today(),
            "self": self.learner_ref(people["self"]) if people["self"] else None,
            "wards": [self.learner_ref(ward) for ward in people["wards"]],
            "sections": sorted(sections, key=lambda row: -row["learners_with_evidence"]),
            "school": {"grades": self.seed["grades"]} if "school" in reach else None,
        }

    @staticmethod
    def baseline(chapter: Row, plan: Optional[Row]) -> Row:
        partly = plan["in_progress"].get(str(chapter["sequence"])) if plan else None
        if plan and chapter["sequence"] in plan["taught"]:
            return {"chapter_id": chapter["id"], "state": "taught", "taught_topic_ids": []}
        if partly is not None:
            taught = [topic["id"] for topic in chapter["topics"] if topic["title"] in partly]
            return {"chapter_id": chapter["id"], "state": "in_progress", "taught_topic_ids": taught}
        return {"chapter_id": chapter["id"], "state": "not_taught", "taught_topic_ids": []}

    @staticmethod
    def with_planner(chapter: Row, base: Row, planned: Optional[Row]) -> Row:
        if planned is None or base["state"] == "taught":
            return base
        if planned["state"] == "taught":
            return {"chapter_id": chapter["id"], "state": "taught", "taught_topic_ids": []}
        topics = list(dict.fromkeys([*base["taught_topic_ids"], *planned["taught_topic_ids"]]))
        fallback = [topic["id"] for topic in chapter["topics"][:1]]
        return {"chapter_id": chapter["id"], "state": "in_progress", "taught_topic_ids": topics or fallback}

    def coverage_for(self, pupil: Row, subject: Row) -> List[Row]:
        if pupil["grade"] != subject["grade"]:
            return []
        plan = self.seed["term_coverage"].get(subject["code"])
        offering = next((row for row in self.seed["offerings"] if row["section_id"] == pupil["section_id"] and row["subject_code"] == subject["code"]), None)
        rows = self.seed["planned_coverage"].get(offering["offering_id"], []) if offering else []
        planned = {row["chapter_id"]: row for row in rows}
        if not plan and not planned:
            return []
        return [self.with_planner(chapter, self.baseline(chapter, plan), planned.get(chapter["id"])) for chapter in subject["chapters"]]

    def subject_for(self, pupil: Row, subject: Row, as_of: str, stored: Sequence[Row]) -> Row:
        key = f"{subject['grade']}|{subject['code']}"
        mine = [row for row in stored if self.topic_subject.get(row["topic_id"]) == key] if self.has_evidence(pupil, subject["code"], stored) else []
        return engine.analyze_subject(subject, engine.by_topic(mine), self.coverage_for(pupil, subject), as_of, {"kind": "learner"})

    def visible_learner(self, school_id: str, user: str, student_id: str) -> Row:
        reach = self.reach(user)
        people = self.individuals(user)
        if people["self"] and people["self"]["student_id"] == student_id:
            return people["self"]
        ward = next((row for row in people["wards"] if row["student_id"] == student_id), None)
        if ward:
            return ward
        pupil = self.pupil_index.get(student_id)
        teaches = "teacher_assignment" in reach and pupil is not None and any(
            row["section_id"] == pupil["section_id"] for row in self.taught_sections(school_id)
        )
        if pupil and ("school" in reach or teaches):
            return pupil
        raise Refusal(403, "forbidden", "this learner is outside what you may read")

    def learner(self, school_id: str, user: str, student_id: str) -> Row:
        pupil = self.visible_learner(school_id, user, student_id)
        as_of = self.today()
        stored = self.evidence_for(school_id, [pupil])[pupil["student_id"]]
        subjects = []
        for code in self.subject_codes_for(pupil["grade"]):
            catalog = self.catalog_for(pupil["grade"], code)
            if catalog:
                subjects.append(self.subject_for(pupil, catalog, as_of, stored))
        subjects.sort(key=lambda row: (-row["counts"]["gap"], -row["counts"]["at_risk"]))
        return {"learner": self.learner_ref(pupil), "as_of": as_of, "subjects": subjects}

    def section_scope(self, school_id: str, user: str, section_id: str) -> Row:
        reach = self.reach(user)
        if "teacher_assignment" in reach:
            taught = next((row for row in self.taught_sections(school_id) if row["section_id"] == section_id), None)
            if taught:
                return taught
        section = self.section_index.get(section_id)
        if section is None or "school" not in reach:
            raise Refusal(403, "forbidden", "this class is outside what you may read")
        rows = [row for row in self.seed["offerings"] if row["section_id"] == section_id and row["curriculum_id"]]
        return {
            "section_id": section_id,
            "label": rows[0]["section_label"] if rows else f"Class {section['grade']} {section['name'] or ''}",
            "grade": section["grade"],
            "subjects": [{"code": row["subject_code"], "name": row["subject_name"], "mine": False, "offering_id": row["offering_id"]} for row in rows],
            "learners_with_evidence": len(self.pupils_of(section_id)),
        }

    def learner_subjects(self, school_id: str, section_id: str, catalog: Row, as_of: str) -> List[Row]:
        key = (school_id, as_of, section_id, catalog["grade"], catalog["code"])
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        pupils = self.pupils_of(section_id)
        stored = self.evidence_for(school_id, pupils)
        rows = [{"learner": self.learner_ref(pupil), "analysis": self.subject_for(pupil, catalog, as_of, stored[pupil["student_id"]])} for pupil in pupils]
        self.cache[key] = rows
        return rows

    def class_view(self, school_id: str, user: str, section_id: str, code: str) -> Row:
        section = self.section_scope(school_id, user, section_id)
        subject = next((row for row in section["subjects"] if row["code"] == code), section["subjects"][0] if section["subjects"] else None)
        catalog = self.catalog_for(section["grade"], subject["code"]) if subject else None
        if subject is None or catalog is None:
            raise Refusal(404, "not_found", "this class has no subject with a curriculum")
        as_of = self.today()
        return engine.class_analysis(section, subject, catalog, self.learner_subjects(school_id, section_id, catalog, as_of), as_of)

    def school(self, school_id: str, user: str, grade: int, code: str) -> Row:
        if "school" not in self.reach(user):
            raise Refusal(403, "forbidden", "the whole school is outside what you may read")
        codes = self.subject_codes_for(grade)
        chosen = code if code in codes else (codes[0] if codes else "")
        catalog = self.catalog_for(grade, chosen)
        if catalog is None:
            raise Refusal(404, "not_found", f"Class {grade} has no curriculum")
        as_of = self.today()
        sections = sorted((row for row in self.seed["sections"] if row["grade"] == grade), key=lambda row: row["name"] or "")
        rows = [
            {"section_id": row["id"], "label": f"Class {grade} {row['name'] or ''}", "rows": self.learner_subjects(school_id, row["id"], catalog, as_of)}
            for row in sections
        ]
        subjects = [{"code": c, "name": self.catalog_for(grade, c)["name"]} for c in codes if self.catalog_for(grade, c)]
        return engine.school_analysis(grade, catalog, subjects, rows, as_of)

    def record_events(self, school_id: str, events: Sequence[Row], records: Sequence[Row]) -> List[Row]:
        accepted: List[Row] = []
        replaced = []
        for row in events:
            self.known_student(row["student_id"])
            if row["topic_id"] not in self.topic_subject:
                raise Refusal(422, "unknown_topic", f"topic {row['topic_id']} is in no curriculum")
            accepted.append(row)
        for wrapper in records:
            subject = self.catalog_for(wrapper["grade"], wrapper["subject_code"])
            if subject is None:
                raise Refusal(422, "unknown_subject", f"Class {wrapper['grade']} has no {wrapper['subject_code']} curriculum")
            record = wrapper["record"]
            self.known_student(record["student_id"])
            produced = normalise(record, subject)
            if not produced:
                where = f"Class {wrapper['grade']} {wrapper['subject_code']}"
                raise Refusal(422, "no_topics_matched", f"{record['type']} record for {record['student_id']} matched no topic in {where}")
            accepted.extend(produced)
            replaced.append(record_key(record))
        with self.store.lock:
            self.store.put_evidence(school_id, accepted, replaced)
            self.forget(school_id)
        return accepted

    def known_student(self, student_id: str) -> None:
        if student_id not in self.pupil_index:
            raise Refusal(404, "not_found", f"learner {student_id} not found")
