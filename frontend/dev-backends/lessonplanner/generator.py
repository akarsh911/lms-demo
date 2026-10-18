import math
import uuid
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

LESSON_BLOCK_KINDS = ("warm_up", "explanation", "activity", "check", "homework")

SHARE = {"warm_up": 5, "explanation": 12, "activity": 13, "check": 7, "homework": 3}

Segment = Mapping[str, Any]
Sources = Mapping[str, Any]
Draft = Dict[str, Any]


def js_round(value: float) -> int:
    return math.floor(value + 0.5)


def draft(title: str, summary: str, steps: Sequence[str], resources: Sequence[str]) -> Draft:
    return {"title": title, "summary": summary, "steps": list(steps), "resources": list(resources)}


def lower(segment: Segment) -> str:
    return segment["focus"].lower()


TEMPLATES: Dict[str, List[Callable[[Segment, Sources], Draft]]] = {
    "warm_up": [
        lambda s, _: draft(
            "Hook question",
            s["hook"],
            ["Pose the question and take three quick answers.", "Write the predictions on the board to revisit at the end."],
            ["playground"],
        ),
        lambda s, _: draft(
            "Recall starter",
            f"Three quick recall questions from the last lesson, leading into {lower(s)}.",
            ["Pupils answer on mini whiteboards.", "Correct one common slip aloud before moving on."],
            [],
        ),
        lambda s, _: draft(
            "Think, pair, share",
            s["hook"],
            ["One minute alone, one minute with a partner.", "Two pairs share; keep their wording for the explanation."],
            ["playground"],
        ),
    ],
    "explanation": [
        lambda s, _: draft(
            f"Teach: {s['focus']}",
            s["idea"],
            [f"Model it: {s['example']}", "Pause for two checking questions before going on.", "Pupils copy the key statement in their own words."],
            ["mindmap", "playground_tool"],
        ),
        lambda s, _: draft(
            "Example first, then the idea",
            f"Start from the example and name the idea only once pupils have seen it work: {s['example']}",
            [s["idea"], "Ask pupils which step of the example the idea explains."],
            ["mindmap", "playground_tool"],
        ),
        lambda s, sources: draft(
            "Build the concept map",
            f"Build the map of {sources['title']} live, adding {lower(s)} as the new branch.",
            [s["idea"], f"Anchor it with: {s['example']}", "Pupils add one link of their own to the map."],
            ["mindmap"],
        ),
    ],
    "activity": [
        lambda s, _: draft(
            "Group task",
            s["task"],
            ["Groups of four, roles assigned: reader, recorder, checker, reporter.", "Circulate and ask each group one why question."],
            ["playground", "debate"],
        ),
        lambda s, _: draft(
            "Explore in the playground",
            f"Pupils explore {lower(s)} interactively, recording one observation that surprised them.",
            ["Pairs share a screen and take turns at the controls.", s["task"]],
            ["playground", "playground_tool"],
        ),
        lambda s, _: draft(
            "Gallery walk",
            f"Each group posts a worked answer on {lower(s)}; groups rotate and leave a sticky-note comment.",
            [s["task"], "Finish with the best comment read aloud."],
            ["debate"],
        ),
    ],
    "check": [
        lambda s, _: draft(
            "Exit questions",
            "Three short questions; collect answers to plan the next lesson.",
            list(s["questions"]),
            ["paper_setter"],
        ),
        lambda s, _: draft(
            "Quick quiz",
            f"A five-question quiz on {lower(s)}, set in the Paper setter and marked in class.",
            [*s["questions"][:2], "Pupils swap and mark against the key."],
            ["paper_setter", "flashcards"],
        ),
        lambda s, _: draft(
            "Traffic-light check",
            "Pupils hold up green, amber or red against each objective, then answer one question at their level.",
            [
                s["questions"][0] if s["questions"] else "Explain the idea in one sentence.",
                "Reds sit together for a two-minute reteach next lesson.",
            ],
            [],
        ),
    ],
    "homework": [
        lambda s, _: draft("Practice from the textbook", s["homework"], [], ["flashcards"]),
        lambda s, _: draft(
            "Flashcard revision",
            f"Study the flashcard deck for this chapter and mark the cards on {lower(s)} you got wrong.",
            [s["homework"]],
            ["flashcards"],
        ),
        lambda s, _: draft(
            "Reflect and explain",
            f"Write five lines explaining {lower(s)} to a classmate who was absent.",
            ["Include one example and one common mistake."],
            [],
        ),
    ],
}


def generic_segment(chapter: str, focus: str) -> Dict[str, Any]:
    low = focus.lower()
    return {
        "focus": focus,
        "hook": f"Open with a real-life question about {low} and take a show of hands on the answer.",
        "idea": f"Introduce the key terms of {low} and how they connect to what the class already knows from {chapter}.",
        "example": f"one worked example of {low} from the textbook.",
        "task": f"Pairs solve two textbook problems on {low} and explain one solution to the class.",
        "questions": [f"State the main idea of {low} in one sentence.", "Solve one short textbook problem.", "Name one place this idea is used outside school."],
        "homework": f"Textbook exercise on {low}.",
    }


def guide_for(guides: Mapping[str, Any], chapter: str, topics: Sequence[str]) -> Mapping[str, Any]:
    authored = guides.get(chapter)
    if authored:
        return authored
    foci = list(topics) if topics else [f"Core ideas of {chapter}", f"Working with {chapter}", f"Applying {chapter}"]
    return {
        "objectives": [
            f"Explain the key ideas of {chapter} in their own words.",
            f"Solve textbook problems on {chapter} with correct working.",
            f"Apply {chapter} to an unfamiliar situation.",
        ],
        "segments": [generic_segment(chapter, focus) for focus in foci],
    }


def consolidation(chapter: str, round_: int) -> Dict[str, Any]:
    focus = "Practice and consolidation" if round_ % 2 == 0 else "Review and assessment"
    return generic_segment(chapter, f"{focus}: {chapter}")


def segments_for(guides: Mapping[str, Any], sources: Sources, period_count: int) -> List[Segment]:
    if sources["topics"]:
        segments = [generic_segment(sources["title"], topic) for topic in sources["topics"]]
    else:
        segments = guide_for(guides, sources["title"], sources["topics"])["segments"]
    return [segments[i] if i < len(segments) else consolidation(sources["title"], i - len(segments)) for i in range(period_count)]


def minutes_for(kind: str, period_minutes: int) -> int:
    total = sum(SHARE.values())
    return max(2, js_round(SHARE[kind] * period_minutes / total))


def pages_for(citation: Mapping[str, Any], part: int, parts: int) -> Dict[str, Any]:
    span = citation["page_end"] - citation["page_start"] + 1
    size = max(1, span // max(parts, 1))
    start = min(citation["page_end"], citation["page_start"] + part * size)
    end = citation["page_end"] if part == parts - 1 else min(citation["page_end"], start + size - 1)
    return {**citation, "page_start": start, "page_end": end}


def citations_for(kind: str, sources: Sources, part: int, parts: int) -> List[Dict[str, Any]]:
    citations = sources["citations"]
    if not citations:
        return []
    share = pages_for(citations[0], part % parts, parts)
    if kind == "explanation":
        return [share]
    if kind == "activity":
        return [citations[1] if len(citations) > 1 else share]
    if kind == "homework":
        return [{**share, "page_start": share["page_end"], "page_end": share["page_end"]}]
    return []


def resources_for(wanted: Sequence[str], sources: Sources, part: int) -> List[Dict[str, Any]]:
    chosen = []
    for kind in wanted:
        matching = [resource for resource in sources["resources"] if resource["kind"] == kind]
        if matching:
            chosen.append(matching[part % len(matching)])
    return chosen


def build_block(kind: str, variant: int, segment: Segment, sources: Sources, part: int, parts: int, minutes: int) -> Dict[str, Any]:
    templates = TEMPLATES[kind]
    index = variant % len(templates)
    made = templates[index](segment, sources)
    return {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "title": made["title"],
        "minutes": minutes,
        "summary": made["summary"],
        "steps": made["steps"],
        "citations": citations_for(kind, sources, part, parts),
        "resources": resources_for(made["resources"], sources, part),
        "variant": index,
    }


def build_periods(guides: Mapping[str, Any], sources: Sources, period_count: int, period_minutes: int) -> List[Dict[str, Any]]:
    return [
        {
            "id": str(uuid.uuid4()),
            "sequence": part + 1,
            "focus": segment["focus"],
            "slot": None,
            "taught": None,
            "blocks": [
                build_block(kind, 0, segment, sources, part, period_count, minutes_for(kind, period_minutes))
                for kind in LESSON_BLOCK_KINDS
            ],
        }
        for part, segment in enumerate(segments_for(guides, sources, period_count))
    ]


def segment_by_focus(guides: Mapping[str, Any], sources: Sources, focus: str) -> Segment:
    segments = guide_for(guides, sources["title"], sources["topics"])["segments"]
    found: Optional[Segment] = next((segment for segment in segments if segment["focus"] == focus), None)
    return found if found is not None else generic_segment(sources["title"], focus)
