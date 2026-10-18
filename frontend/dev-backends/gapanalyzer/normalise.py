import re
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from engine import EXAM_MIN_SPECIFICITY, FACT_SIGNAL, MASTERY_SIGNAL, SOURCE_WEIGHTS, clamp01, round3

Row = Dict[str, Any]

SCORED_OMR = {"correct", "incorrect", "blank", "multiple", "out_of_range"}

RECORD_REFS = {
    "exam_mark": ("exam_mark", "exam_id", "exam_id"),
    "answer_sheet": ("answer_sheet", "paper_id", "paper_id"),
    "omr": ("omr_sheet", "paper_id", "paper_id"),
    "practice": ("practice_paper", "record_id", "attempt_id"),
    "mastery": ("mastery", "record_id", "record_id"),
    "flashcards": ("flashcard_report", "record_id", "deck_id"),
    "debate": ("debate_report", "record_id", "session_id"),
}


def record_key(record: Row) -> Tuple[str, str, str, str]:
    kind, ref_field, field = RECORD_REFS[record["type"]]
    return record["student_id"], kind, ref_field, record[field]


def folded(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def named(topic: Row, text: str) -> bool:
    return any(folded(name) == folded(text) for name in [topic["title"], *topic["aliases"]])


def chapter_named(subject: Row, title: str) -> Optional[Row]:
    return next((chapter for chapter in subject["chapters"] if folded(chapter["title"]) == folded(title)), None)


def topic_in_chapter(chapter: Row, label: str) -> Optional[Row]:
    return next((topic for topic in chapter["topics"] if named(topic, label)), None)


def resolve_path(subject: Row, path: str) -> Optional[Row]:
    parts = [part.strip() for part in path.split(">")]
    chapter = chapter_named(subject, parts[0] if parts else "")
    if chapter is None:
        return None
    for segment in reversed(parts[1:]):
        topic = topic_in_chapter(chapter, segment)
        if topic is not None:
            return topic
    return chapter["topics"][0] if len(chapter["topics"]) == 1 else None


def volume_factor(units: float, full: float) -> float:
    return min(1, units / full)


def event(source: str, topic: Row, ref: Row, signal: float, weight_factor: float, when: str, label: str, detail: str) -> Row:
    return {
        "id": f"{ref['kind']}:{ref['record_id']}:{topic['id']}",
        "student_id": ref["student_id"],
        "topic_id": topic["id"],
        "source": source,
        "signal": round3(clamp01(signal)),
        "weight": round3(SOURCE_WEIGHTS[source] * weight_factor),
        "date": when,
        "label": label,
        "detail": detail,
        "ref": ref,
    }


def grouped(rows: Sequence[Any], topic_of: Callable[[Any], Optional[Row]]) -> List[Tuple[Row, List[Any]]]:
    out: Dict[str, Tuple[Row, List[Any]]] = {}
    for row in rows:
        topic = topic_of(row)
        if topic is not None:
            out.setdefault(topic["id"], (topic, []))[1].append(row)
    return list(out.values())


def total(rows: Sequence[Any], value: Callable[[Any], float]) -> float:
    acc = 0
    for row in rows:
        acc += value(row)
    return acc


def from_exam_mark(record: Row, syllabus: Sequence[Row]) -> List[Row]:
    if record["max"] <= 0 or not syllabus:
        return []
    specificity = max(EXAM_MIN_SPECIFICITY, 1 / len(syllabus))
    ref = {
        "kind": "exam_mark",
        "record_id": record["mark_id"],
        "title": f"{record['exam_name']}, {record['subject_name']}",
        "student_id": record["student_id"],
        "exam_id": record["exam_id"],
    }
    chapters = ", ".join(chapter["title"] for chapter in syllabus)
    label = f"{fmt(record['marks'])}/{fmt(record['max'])} overall"
    detail = f"The whole-paper mark, spread over the {len(syllabus)} chapters it examined: {chapters}."
    return [
        event("exam", topic, ref, record["marks"] / record["max"], specificity, record["date"], label, detail)
        for chapter in syllabus
        for topic in chapter["topics"]
    ]


def fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else repr(float(value))


def from_answer_sheet(record: Row, subject: Row) -> List[Row]:
    out = []
    for topic, questions in grouped(record["questions"], lambda q: resolve_path(subject, q["section_path"])):
        awarded = total(questions, lambda q: q["awarded"])
        most = total(questions, lambda q: q["max"])
        numbers = ", ".join(f"Q{number}" for number in (q["n"] for q in questions))
        label = f"{numbers} · {fmt(awarded)}/{fmt(most)}"
        ref = {
            "kind": "answer_sheet",
            "record_id": record["sheet_id"],
            "title": record["paper_title"],
            "student_id": record["student_id"],
            "paper_id": record["paper_id"],
            "question": ",".join(str(q["n"]) for q in questions),
        }
        signal = awarded / most if most > 0 else 0
        out.append(event("answer_sheet", topic, ref, signal, volume_factor(most, 4), record["date"], label, f"Checked against the marking scheme of {record['paper_title']}."))
    return out


def from_omr(record: Row, subject: Row) -> List[Row]:
    scored = [q for q in record["questions"] if q["outcome"] in SCORED_OMR]
    out = []
    for topic, questions in grouped(scored, lambda q: resolve_path(subject, q["section_path"])):
        right = sum(1 for q in questions if q["outcome"] == "correct")
        blank = sum(1 for q in questions if q["outcome"] == "blank")
        ref = {
            "kind": "omr_sheet",
            "record_id": record["sheet_id"],
            "title": record["paper_title"],
            "student_id": record["student_id"],
            "paper_id": record["paper_id"],
            "question": ",".join(str(q["n"]) for q in questions),
        }
        detail = f"{blank} left blank, counted as not known." if blank > 0 else "Every bubble read cleanly."
        out.append(event("omr", topic, ref, right / len(questions), volume_factor(len(questions), 4), record["date"], f"{right} of {len(questions)} bubbles right", detail))
    return out


def from_practice(record: Row, subject: Row) -> List[Row]:
    out = []
    for topic, rows in grouped(record["topics"], lambda row: resolve_path(subject, row["section_path"])):
        awarded = total(rows, lambda row: row["awarded"])
        most = total(rows, lambda row: row["max"])
        ref = {
            "kind": "practice_paper",
            "record_id": record["attempt_id"],
            "title": record["paper_title"],
            "student_id": record["student_id"],
            "paper_id": record["paper_id"],
        }
        signal = awarded / most if most > 0 else 0
        out.append(event("paper", topic, ref, signal, volume_factor(most, 4), record["date"], f"{fmt(awarded)}/{fmt(most)} on this topic", "A practice paper from the paper setter."))
    return out


def from_mastery(record: Row, subject: Row) -> List[Row]:
    topics_by_id = {topic["id"]: topic for chapter in subject["chapters"] for topic in chapter["topics"]}
    topic_of: Mapping[str, str] = record["topic_of"]
    label_of: Mapping[str, str] = record["label_of"]
    out: List[Row] = []
    for topic, entries in grouped(list(record["states"].items()), lambda entry: topics_by_id.get(topic_of.get(entry[0], ""))):
        ref = {"kind": "mastery", "record_id": record["record_id"], "title": f"Mind map · {record['map_title']}", "student_id": record["student_id"]}
        drilled = [entry for entry in entries if entry[1] != "read"]
        read = [entry for entry in entries if entry[1] == "read"]
        if drilled:
            missed = [label_of.get(node, node) for node, state in drilled if state == "missed"]
            signal = total(drilled, lambda entry: MASTERY_SIGNAL[entry[1]]) / len(drilled)
            detail = f"Missed in the drill: {', '.join(missed)}." if missed else "Every drilled concept answered."
            label = f"{len(drilled) - len(missed)} of {len(drilled)} concepts held"
            out.append(event("mindmap", topic, ref, signal, volume_factor(len(drilled), 3), record["date"], label, detail))
        if read:
            exposure = event("read", topic, ref, MASTERY_SIGNAL["read"], 1, record["date"], f"{len(read)} concepts read", "Read on the map, not yet drilled.")
            out.append({**exposure, "id": f"read:{record['record_id']}:{topic['id']}"})
    return out


def from_flashcards(record: Row, subject: Row) -> List[Row]:
    chapter = chapter_named(subject, record["chapter_title"])
    if chapter is None:
        return []
    out = []
    for standing in record["standings"]:
        topic = topic_in_chapter(chapter, standing["label"])
        if topic is None or standing["cards"] == 0:
            continue
        ref = {"kind": "flashcard_report", "record_id": record["deck_id"], "title": record["title"], "student_id": record["student_id"]}
        label = f"{standing['correct']} of {standing['cards']} cards right"
        out.append(event("flashcards", topic, ref, standing["correct"] / standing["cards"], volume_factor(standing["cards"], 3), record["date"], label, "From the deck report the flashcard engine returned."))
    return out


def from_debate(record: Row, subject: Row) -> List[Row]:
    chapter = chapter_named(subject, record["chapter_title"])
    if chapter is None:
        return []
    checked = [item for item in record["fact_checks"] if item["assessment"] != "unverified"]
    out = []
    for topic, items in grouped(checked, lambda item: topic_in_chapter(chapter, item["topic"])):
        signal = total(items, lambda item: FACT_SIGNAL[item["assessment"]]) / len(items)
        wrong = [f"“{item['claim']}”" for item in items if item["assessment"] == "incorrect"]
        ref = {"kind": "debate_report", "record_id": record["session_id"], "title": f"Debate · {record['motion']}", "student_id": record["student_id"]}
        detail = f"Fact-checked as incorrect: {'; '.join(wrong)}." if wrong else "Every claim on this topic held up in the fact-check."
        label = f"{len(items)} claim{'' if len(items) == 1 else 's'} fact-checked"
        out.append(event("debate", topic, ref, signal, volume_factor(len(items), 2), record["date"], label, detail))
    return out


def normalise(record: Row, subject: Row) -> List[Row]:
    kind = record["type"]
    if kind == "exam_mark":
        index = {chapter["id"]: chapter for chapter in subject["chapters"]}
        return from_exam_mark(record, [index[chapter_id] for chapter_id in record["syllabus_chapter_ids"] if chapter_id in index])
    handlers = {
        "answer_sheet": from_answer_sheet,
        "omr": from_omr,
        "practice": from_practice,
        "mastery": from_mastery,
        "flashcards": from_flashcards,
        "debate": from_debate,
    }
    return handlers[kind](record, subject)
