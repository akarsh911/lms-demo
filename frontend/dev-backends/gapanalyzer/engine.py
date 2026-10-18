import math
from datetime import date
from functools import cmp_to_key
from typing import Any, Dict, List, Mapping, Optional, Sequence

SOURCE_WEIGHTS = {
    "exam": 1,
    "omr": 0.9,
    "answer_sheet": 0.85,
    "paper": 0.7,
    "mindmap": 0.5,
    "flashcards": 0.4,
    "debate": 0.3,
    "read": 0.1,
}

SOURCE_LABELS = {
    "exam": "Exam marks",
    "omr": "OMR",
    "answer_sheet": "Answer sheet",
    "paper": "Paper",
    "mindmap": "Mind map",
    "flashcards": "Flashcards",
    "debate": "Debate",
    "read": "Mind map read",
}

ASSESSED_SOURCES = {"omr", "answer_sheet", "paper"}
EXPOSURE_ONLY = {"read"}
DIFFUSE_SOURCES = {"exam", "read"}

HALF_LIFE_DAYS = 45
WEAK_BELOW = 0.5
SECURE_FROM = 0.7
VOLUME_SCALE = 1.2
SINGLE_SOURCE_DISCOUNT = 0.8
HIGH_CONFIDENCE = 0.6
MEDIUM_CONFIDENCE = 0.3
TREND_WINDOW_DAYS = 21
TREND_STEP = 0.08
EXAM_MIN_SPECIFICITY = 0.15
CLASS_WIDE_SHARE = 0.45
CLASS_WIDE_MIN_LEARNERS = 5
QUIZ_QUESTIONS = 5
WEAKEST_LISTED = 8
MASTERY_SIGNAL = {"known": 1, "shaky": 0.6, "missed": 0.15, "read": 0.6}
FACT_SIGNAL = {"correct": 1, "mostly_correct": 0.8, "partially_correct": 0.5, "incorrect": 0}

STATUS_KEYS = ("gap", "at_risk", "not_taught", "strong", "no_data")

Row = Dict[str, Any]


def js_round(value: float) -> int:
    whole = math.floor(value)
    return whole + 1 if value - whole >= 0.5 else whole


def round3(value: float) -> float:
    return js_round(value * 1000) / 1000


def clamp01(value: float) -> float:
    return min(1, max(0, value))


def percent(value: Optional[float]) -> str:
    return "—" if value is None else f"{js_round(value * 100)}%"


def days_between(start: str, end: str) -> int:
    return (date.fromisoformat(end[:10]) - date.fromisoformat(start[:10])).days


def ordered(rows: Sequence[Any], compare) -> List[Any]:
    return sorted(rows, key=cmp_to_key(compare))


def sign(value: float) -> int:
    return (value > 0) - (value < 0)


def text_order(a: str, b: str) -> int:
    return (a > b) - (a < b)


def decay(when: str, as_of: str) -> float:
    return 0.5 ** (max(0, days_between(when, as_of)) / HALF_LIFE_DAYS)


def weigh(evidence: Sequence[Row], as_of: str) -> List[Row]:
    rows = [{**row, "effective_weight": round3(row["weight"] * decay(row["date"], as_of))} for row in evidence if row["date"] <= as_of]
    return ordered(rows, lambda a, b: text_order(b["date"], a["date"]) or sign(b["effective_weight"] - a["effective_weight"]))


def total_weight(rows: Sequence[Row]) -> float:
    total = 0
    for row in rows:
        total += row["effective_weight"]
    return total


def weighted_mean(rows: Sequence[Row]) -> Optional[float]:
    total = total_weight(rows)
    if total <= 0:
        return None
    acc = 0
    for row in rows:
        acc += row["signal"] * row["effective_weight"]
    return acc / total


def source_means(rows: Sequence[Row]) -> Dict[str, float]:
    by_source: Dict[str, List[Row]] = {}
    for row in rows:
        by_source.setdefault(row["source"], []).append(row)
    out: Dict[str, float] = {}
    for source, group in by_source.items():
        mean = weighted_mean(group)
        if mean is not None:
            out[source] = round3(mean)
    return out


def agreement_of(evidence: Sequence[Row], mean: float) -> float:
    rows = [row for row in evidence if row["source"] not in EXPOSURE_ONLY]
    total = total_weight(rows)
    if total == 0:
        return 0
    spread = 0
    for row in rows:
        gap = row["signal"] - mean
        spread += row["effective_weight"] * (gap * gap)
    return clamp01(1 - 2 * math.sqrt(spread / total))


def band_of(confidence: float) -> str:
    if confidence >= HIGH_CONFIDENCE:
        return "high"
    return "medium" if confidence >= MEDIUM_CONFIDENCE else "low"


def score_topic(evidence: Sequence[Row], as_of: str) -> Row:
    weighed = weigh(evidence, as_of)
    score = weighted_mean(weighed)
    means = source_means(weighed)
    if score is None:
        return {"score": None, "confidence": 0, "confidence_band": "low", "agreement": 0, "evidence": weighed, "source_means": means}
    volume = 1 - math.exp(-total_weight(weighed) / VOLUME_SCALE)
    agreement = agreement_of(weighed, score)
    diversity = 1 if len(means) >= 2 else SINGLE_SOURCE_DISCOUNT
    confidence = round3(volume * (0.4 + 0.6 * agreement) * diversity)
    return {
        "score": round3(score),
        "confidence": confidence,
        "confidence_band": band_of(confidence),
        "agreement": round3(agreement),
        "evidence": weighed,
        "source_means": means,
    }


def trend_series(evidence: Sequence[Row], as_of: str) -> List[Row]:
    points = []
    for when in sorted({row["date"] for row in evidence if row["date"] <= as_of}):
        score = weighted_mean(weigh(evidence, when))
        if score is not None:
            points.append({"date": when, "score": round3(score)})
    return points


def trend_of(points: Sequence[Row]) -> str:
    if len(points) < 2:
        return "unknown"
    last = points[-1]
    earlier = next((point for point in reversed(points) if days_between(point["date"], last["date"]) >= TREND_WINDOW_DAYS), points[0])
    if earlier is last:
        return "unknown"
    change = last["score"] - earlier["score"]
    if change > TREND_STEP:
        return "improving"
    if change < -TREND_STEP:
        return "declining"
    return "steady"


COVERAGE_REASON = {
    "taught": "Taught, according to the lesson record.",
    "not_taught": "Not taught yet, according to the lesson record, so weak practice here is not counted as a gap.",
    "unrecorded": "No lesson record says whether this was taught, so it is treated as taught.",
}

TREND_REASON = {
    "improving": "The trend is improving over the last three weeks.",
    "declining": "The trend is getting worse over the last three weeks.",
}


def assessments(evidence: Sequence[Row]) -> List[str]:
    seen: Dict[str, str] = {}
    for row in evidence:
        record = row["ref"]["record_id"]
        if row["source"] in ASSESSED_SOURCES and record not in seen:
            seen[record] = f"{row['ref']['title']} ({row['label']})"
    return list(seen.values())


def disagreement(means: Mapping[str, float]) -> Optional[str]:
    ranked = ordered([item for item in means.items() if item[0] not in EXPOSURE_ONLY], lambda a, b: sign(a[1] - b[1]))
    if len(ranked) < 2:
        return None
    low, high = ranked[0], ranked[-1]
    if high[1] - low[1] < 0.35:
        return None
    return f"The sources disagree: {SOURCE_LABELS[high[0]]} reads {percent(high[1])} but {SOURCE_LABELS[low[0]]} reads {percent(low[1])}."


def weakness(score: float, assessed: bool) -> str:
    if score < WEAK_BELOW:
        return "gap" if assessed else "at_risk"
    return "at_risk" if score < SECURE_FROM else "strong"


def headline(status: str, score: Optional[float]) -> str:
    if status == "gap":
        return "Taught, tested, weak."
    if status == "at_risk":
        return "Weak in practice, not yet tested." if score is not None and score < WEAK_BELOW else f"Borderline, below {percent(SECURE_FROM)}."
    if status == "strong":
        return "Secure."
    if status == "not_taught":
        return "Not taught yet."
    return "No records yet."


def plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def classify(coverage: str, scored: Row, trend: str) -> Row:
    on_assessment = assessments(scored["evidence"])
    assessed = len(on_assessment) > 0
    score = scored["score"]
    if coverage == "not_taught":
        status = "not_taught"
    elif score is None:
        status = "no_data"
    else:
        status = weakness(score, assessed)

    reasons = [headline(status, score), COVERAGE_REASON[coverage]]
    if status == "not_taught" and score is not None and score < WEAK_BELOW:
        reasons.append(f"Early practice is weak ({percent(score)}); worth watching once it is taught.")
    if assessed:
        reasons.append(f"Assessed on: {'; '.join(on_assessment)}.")
    if not assessed and any(row["source"] == "exam" for row in scored["evidence"]):
        reasons.append("Only a whole-paper exam mark touches this topic, which says little about it on its own.")
    split = disagreement(scored["source_means"])
    if split:
        reasons.append(split)
    note = TREND_REASON.get(trend)
    if note and status != "no_data":
        reasons.append(note)
    if score is not None:
        pieces = len(scored["evidence"])
        sources = len(scored["source_means"])
        reasons.append(
            f"Confidence is {scored['confidence_band']}: {pieces} piece{'' if pieces == 1 else 's'} of evidence from {plural(sources, 'source')}."
        )
    return {"status": status, "assessed": assessed, "reasons": reasons}


FOLLOWS_FROM = {
    "reteach": (),
    "mindmap": ("mindmap", "read", "answer_sheet"),
    "flashcards": ("flashcards", "omr", "paper"),
    "playground": ("answer_sheet", "exam"),
    "debate": ("debate",),
    "quiz": ("exam",),
}


def weakest_among(kind: str, means: Mapping[str, float]) -> float:
    related = [means[source] for source in FOLLOWS_FROM[kind] if source in means]
    return min(related) if related else 1


def weak_source_note(source: str, means: Mapping[str, float], note: str) -> Optional[str]:
    mean = means.get(source)
    return f"{note} ({percent(mean)})." if mean is not None and mean < WEAK_BELOW else None


def actions_for(status: str, subject: Row, chapter: Row, topic: Row, means: Mapping[str, float], audience: Row) -> List[Row]:
    if status not in ("gap", "at_risk"):
        return []
    links = topic["links"]
    title = topic["title"]
    actions: List[Row] = []
    if audience["kind"] == "class" and audience.get("offering_id"):
        actions.append(
            {
                "kind": "reteach",
                "title": f"Re-teach {title}",
                "reason": f"Add a revision period for {title} to the {chapter['title']} term plan.",
                "offering_id": audience["offering_id"],
            }
        )
    if links.get("mindmap"):
        reason = weak_source_note("mindmap", means, "Concepts were missed in the mind-map drill") or f"See how the ideas in {title} connect before practising."
        actions.append({"kind": "mindmap", "title": f"Mind map · {title}", "reason": reason, **links["mindmap"]})
    if links.get("flashcards_chapter"):
        reason = weak_source_note("flashcards", means, "Flashcards on this topic went wrong") or f"A short deck on {title} to fix the definitions."
        actions.append({"kind": "flashcards", "title": f"Flashcards · {title}", "reason": reason, "chapter_id": links["flashcards_chapter"], "topic": title})
    if links.get("playground_thread"):
        actions.append(
            {
                "kind": "playground",
                "title": f"Visual playground · {title}",
                "reason": "Work it through visually, which helps where written answers fall short.",
                "thread_id": links["playground_thread"],
                "grade": subject["grade"],
            }
        )
    if links.get("debate_motion"):
        motion = links["debate_motion"]
        reason = weak_source_note("debate", means, "Claims on this topic failed the fact-check") or "Argue a motion that leans on this topic, and get every claim fact-checked."
        actions.append({"kind": "debate", "title": f"Debate · {motion['text']}", "reason": reason, "motion_id": motion["id"]})
    actions.append(
        {
            "kind": "quiz",
            "title": f"Quick quiz · {title}",
            "reason": f"A {QUIZ_QUESTIONS}-question check from the paper setter, to confirm it has been fixed.",
            "question_count": QUIZ_QUESTIONS,
            "grade": subject["grade"],
            "subject_code": subject["code"],
            "subject_name": subject["name"],
            "chapter_id": chapter["id"],
            "chapter_title": chapter["title"],
            "topic_id": topic["id"],
            "topic_title": title,
        }
    )

    def rank(action: Row) -> float:
        if action["kind"] == "reteach":
            return -1
        if action["kind"] == "quiz":
            return 2
        return weakest_among(action["kind"], means)

    indexed = list(enumerate(actions))
    return [action for _, action in ordered(indexed, lambda a, b: sign(rank(a[1]) - rank(b[1])) or a[0] - b[0])]


def topic_coverage(records: Sequence[Row], chapter_id: str, topic_id: str) -> str:
    record = next((row for row in records if row["chapter_id"] == chapter_id), None)
    if record is None:
        return "unrecorded"
    if record["state"] == "taught":
        return "taught"
    if record["state"] == "not_taught":
        return "not_taught"
    return "taught" if topic_id in record["taught_topic_ids"] else "not_taught"


def count_statuses(statuses: Sequence[str]) -> Dict[str, int]:
    counts = {key: 0 for key in STATUS_KEYS}
    for status in statuses:
        counts[status] += 1
    return counts


def weighted_score(rows: Sequence[Row]) -> Optional[float]:
    scored = [row for row in rows if row["score"] is not None and row["weight"] > 0]
    total = 0
    for row in scored:
        total += row["weight"]
    if total <= 0:
        return None
    acc = 0
    for row in scored:
        acc += row["score"] * row["weight"]
    return round3(acc / total)


def evidence_weight(topic: Row) -> float:
    return total_weight(topic["evidence"])


def analyze_topic(subject: Row, chapter: Row, topic: Row, evidence: Sequence[Row], coverage: str, as_of: str, audience: Row) -> Row:
    scored = score_topic(evidence, as_of)
    points = trend_series(evidence, as_of)
    trend = trend_of(points)
    verdict = classify(coverage, scored, trend)
    return {
        "topic_id": topic["id"],
        "title": topic["title"],
        "chapter_id": chapter["id"],
        "status": verdict["status"],
        "coverage": coverage,
        "score": scored["score"],
        "confidence": scored["confidence"],
        "confidence_band": scored["confidence_band"],
        "agreement": scored["agreement"],
        "assessed": verdict["assessed"],
        "sources": list(scored["source_means"].keys()),
        "trend": trend,
        "trend_points": points,
        "reasons": verdict["reasons"],
        "evidence": scored["evidence"],
        "actions": actions_for(verdict["status"], subject, chapter, topic, scored["source_means"], audience),
    }


def chapter_coverage(topics: Sequence[Row]) -> str:
    if any(topic["coverage"] == "taught" for topic in topics):
        return "taught"
    return "not_taught" if topics and all(topic["coverage"] == "not_taught" for topic in topics) else "unrecorded"


def scored_rows(topics: Sequence[Row]) -> List[Row]:
    return [{"score": topic["score"], "weight": 0 if topic["coverage"] == "not_taught" else evidence_weight(topic)} for topic in topics]


def analyze_subject(subject: Row, evidence_by_topic: Mapping[str, Sequence[Row]], coverage: Sequence[Row], as_of: str, audience: Row) -> Row:
    chapters = []
    for chapter in subject["chapters"]:
        topics = [
            analyze_topic(subject, chapter, topic, evidence_by_topic.get(topic["id"], []), topic_coverage(coverage, chapter["id"], topic["id"]), as_of, audience)
            for topic in chapter["topics"]
        ]
        chapters.append(
            {
                "chapter_id": chapter["id"],
                "title": chapter["title"],
                "sequence": chapter["sequence"],
                "unit": chapter["unit"],
                "coverage": chapter_coverage(topics),
                "score": weighted_score(scored_rows(topics)),
                "counts": count_statuses([topic["status"] for topic in topics]),
                "topics": topics,
            }
        )
    every = [topic for chapter in chapters for topic in chapter["topics"]]
    return {
        "subject_code": subject["code"],
        "subject_name": subject["name"],
        "curriculum_id": subject["curriculum_id"],
        "score": weighted_score(scored_rows(every)),
        "counts": count_statuses([topic["status"] for topic in every]),
        "chapters": chapters,
    }


def by_topic(evidence: Sequence[Row]) -> Dict[str, List[Row]]:
    out: Dict[str, List[Row]] = {}
    for row in evidence:
        out.setdefault(row["topic_id"], []).append(row)
    return out


def specific(topic: Row) -> bool:
    return any(source not in DIFFUSE_SOURCES for source in topic["sources"])


def has_data(topic: Row) -> bool:
    return topic["score"] is not None and topic["coverage"] != "not_taught" and specific(topic)


def is_weak(topic: Row) -> bool:
    return has_data(topic) and topic["score"] < WEAK_BELOW


def topics_of(rows: Sequence[Row]) -> Dict[str, List[Row]]:
    out: Dict[str, List[Row]] = {}
    for row in rows:
        for chapter in row["analysis"]["chapters"]:
            for topic in chapter["topics"]:
                out.setdefault(topic["topic_id"], []).append(topic)
    return out


def class_means(topics: Sequence[Row]) -> Dict[str, float]:
    sums: Dict[str, List[float]] = {}
    for topic in topics:
        for row in topic["evidence"]:
            acc = sums.setdefault(row["source"], [0, 0])
            acc[0] += row["signal"]
            acc[1] += 1
    return {source: round3(total / n) for source, (total, n) in sums.items()}


def weak_share(topics: Sequence[Row]) -> Row:
    data = [topic for topic in topics if has_data(topic)]
    weak = sum(1 for topic in data if is_weak(topic))
    mean = None
    if data:
        acc = 0
        for topic in data:
            acc += topic["score"] or 0
        mean = round3(acc / len(data))
    return {"with_data": len(data), "weak": weak, "share": round3(weak / len(data)) if data else 0, "mean": mean}


def class_analysis(section: Row, subject: Row, catalog: Row, rows: Sequence[Row], as_of: str) -> Row:
    grouped = topics_of(rows)
    offering = subject["offering_id"] if subject["mine"] else None
    topics = []
    for chapter in catalog["chapters"]:
        for topic in chapter["topics"]:
            found = grouped.get(topic["id"], [])
            share = weak_share(found)
            coverage = found[0]["coverage"] if found else "unrecorded"
            class_wide = coverage != "not_taught" and share["with_data"] >= CLASS_WIDE_MIN_LEARNERS and share["share"] >= CLASS_WIDE_SHARE
            topics.append(
                {
                    "topic_id": topic["id"],
                    "title": topic["title"],
                    "chapter_id": chapter["id"],
                    "chapter_title": chapter["title"],
                    "coverage": coverage,
                    "learners_with_data": share["with_data"],
                    "weak": share["weak"],
                    "weak_share": share["share"],
                    "mean_score": share["mean"],
                    "class_wide": class_wide,
                    "actions": actions_for("gap", catalog, chapter, topic, class_means(found), {"kind": "class", "offering_id": offering}) if class_wide else [],
                }
            )
    return {
        "section": section,
        "subject": subject,
        "as_of": as_of,
        "learners": [row["learner"] for row in rows],
        "chapters": [{"chapter_id": c["id"], "title": c["title"], "topic_ids": [t["id"] for t in c["topics"]]} for c in catalog["chapters"]],
        "topics": topics,
        "cells": [
            {
                "student_id": row["learner"]["student_id"],
                "topic_id": topic["topic_id"],
                "status": topic["status"],
                "score": topic["score"],
                "confidence_band": topic["confidence_band"],
                "topic_specific": specific(topic),
            }
            for row in rows
            for chapter in row["analysis"]["chapters"]
            for topic in chapter["topics"]
        ],
        "reteach": ordered([topic for topic in topics if topic["class_wide"]], lambda a, b: sign(b["weak_share"] - a["weak_share"])),
    }


def school_analysis(grade: int, catalog: Row, subjects: Sequence[Row], sections: Sequence[Row], as_of: str) -> Row:
    section_rows = []
    for section in sections:
        grouped = topics_of(section["rows"])
        data = [topic for group in grouped.values() for topic in group if has_data(topic)]
        chapters = []
        for chapter in catalog["chapters"]:
            share = weak_share([topic for t in chapter["topics"] for topic in grouped.get(t["id"], [])])
            chapters.append({"chapter_id": chapter["id"], "weak_share": share["share"] if share["with_data"] > 0 else None, "learners_with_data": share["with_data"]})
        section_rows.append(
            {
                "section_id": section["section_id"],
                "label": section["label"],
                "learners": len(section["rows"]),
                "chapters": chapters,
                "gap_rate": round3(sum(1 for topic in data if topic["status"] == "gap") / len(data)) if data else None,
            }
        )

    per_section = [topics_of(section["rows"]) for section in sections]
    everyone = topics_of([row for section in sections for row in section["rows"]])
    candidates = []
    for chapter in catalog["chapters"]:
        for topic in chapter["topics"]:
            share = weak_share(everyone.get(topic["id"], []))
            affected = 0
            for grouped in per_section:
                local = weak_share(grouped.get(topic["id"], []))
                if local["with_data"] >= CLASS_WIDE_MIN_LEARNERS and local["share"] >= CLASS_WIDE_SHARE:
                    affected += 1
            candidates.append(
                (
                    share["with_data"],
                    {"topic_id": topic["id"], "title": topic["title"], "chapter_title": chapter["title"], "weak_share": share["share"], "sections_affected": affected},
                )
            )
    weakest = ordered([row for with_data, row in candidates if with_data > 0], lambda a, b: sign(b["weak_share"] - a["weak_share"]))[:WEAKEST_LISTED]
    return {
        "grade": grade,
        "subject_code": catalog["code"],
        "subject_name": catalog["name"],
        "subjects": list(subjects),
        "as_of": as_of,
        "chapters": [{"chapter_id": c["id"], "title": c["title"], "sequence": c["sequence"]} for c in catalog["chapters"]],
        "sections": section_rows,
        "weakest": weakest,
    }
