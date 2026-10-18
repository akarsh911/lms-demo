import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Sequence

SCHEMA = """
CREATE TABLE IF NOT EXISTS evidence (
  school_id TEXT NOT NULL,
  id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (school_id, id)
);
CREATE INDEX IF NOT EXISTS evidence_by_student ON evidence (school_id, student_id);
CREATE TABLE IF NOT EXISTS seeded_schools (
  school_id TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL
);
"""

CHUNK = 500


class Store:
    def __init__(self, path: str) -> None:
        self.path = path
        self.lock = threading.RLock()
        with self.connect() as db:
            db.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def evidence_of(self, school_id: str, student_ids: Sequence[str]) -> Dict[str, List[Dict[str, Any]]]:
        out: Dict[str, List[Dict[str, Any]]] = {student_id: [] for student_id in student_ids}
        ids = list(out)
        with self.connect() as db:
            for start in range(0, len(ids), CHUNK):
                chunk = ids[start : start + CHUNK]
                marks = ",".join("?" for _ in chunk)
                rows = db.execute(
                    f"SELECT student_id, body FROM evidence WHERE school_id = ? AND student_id IN ({marks}) ORDER BY rowid",
                    [school_id, *chunk],
                ).fetchall()
                for student_id, body in rows:
                    out[student_id].append(json.loads(body))
        return out

    @staticmethod
    def write(db: sqlite3.Connection, school_id: str, events: Sequence[Dict[str, Any]]) -> None:
        db.executemany(
            "INSERT OR REPLACE INTO evidence (school_id, id, student_id, topic_id, body) VALUES (?, ?, ?, ?, ?)",
            [(school_id, row["id"], row["student_id"], row["topic_id"], json.dumps(row, ensure_ascii=False)) for row in events],
        )

    def put_evidence(self, school_id: str, events: Sequence[Dict[str, Any]], replaced: Sequence[Sequence[str]] = ()) -> None:
        with self.connect() as db:
            db.executemany(
                "DELETE FROM evidence WHERE school_id = ? AND student_id = ?"
                " AND json_extract(body, '$.ref.kind') = ? AND json_extract(body, ?) = ?",
                [(school_id, student_id, kind, f"$.ref.{ref_field}", value) for student_id, kind, ref_field, value in replaced],
            )
            self.write(db, school_id, events)

    def reset_school(self, school_id: str, events: Sequence[Dict[str, Any]]) -> Dict[str, int]:
        seeded = {row["id"]: json.dumps(row, ensure_ascii=False) for row in events}
        with self.connect() as db:
            stored = dict(db.execute("SELECT id, body FROM evidence WHERE school_id = ?", (school_id,)).fetchall())
            db.execute("DELETE FROM evidence WHERE school_id = ?", (school_id,))
            self.write(db, school_id, events)
        removed = sum(1 for row_id in stored if row_id not in seeded)
        restored = sum(1 for row_id, body in seeded.items() if stored.get(row_id) != body)
        return {"removed": removed, "restored": restored}

    def seed_school(self, school_id: str, now: str, events: Sequence[Dict[str, Any]]) -> bool:
        with self.connect() as db:
            fresh = db.execute("INSERT OR IGNORE INTO seeded_schools (school_id, seeded_at) VALUES (?, ?)", (school_id, now)).rowcount > 0
            if fresh:
                self.write(db, school_id, events)
            return fresh
