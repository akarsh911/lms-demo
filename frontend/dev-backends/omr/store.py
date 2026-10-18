import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS answer_keys (
  school_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id, paper_id)
);
CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  responses TEXT NOT NULL,
  result TEXT NOT NULL,
  scored_at TEXT NOT NULL,
  UNIQUE (school_id, paper_id, roll_number)
);
"""


class Store:
    def __init__(self, path: str) -> None:
        self.path = path
        self.lock = threading.RLock()
        with self.connect() as db:
            db.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with self.lock:
                yield db
                db.commit()
        finally:
            db.close()

    def key(self, school_id: str, paper_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as db:
            row = db.execute(
                "SELECT body FROM answer_keys WHERE school_id = ? AND paper_id = ?", (school_id, paper_id)
            ).fetchone()
        return json.loads(row["body"]) if row else None

    def put_key(self, school_id: str, paper_id: str, body: Dict[str, Any], at: str) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO answer_keys (school_id, paper_id, body, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (school_id, paper_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
                (school_id, paper_id, json.dumps(body), at),
            )

    def save_sheet(self, school_id: str, paper_id: str, sheet: Dict[str, Any]) -> Dict[str, Any]:
        with self.connect() as db:
            db.execute(
                "INSERT INTO sheets (school_id, paper_id, roll_number, name, source, responses, result, scored_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (school_id, paper_id, roll_number) DO UPDATE SET "
                "name = excluded.name, source = excluded.source, responses = excluded.responses, "
                "result = excluded.result, scored_at = excluded.scored_at",
                (
                    school_id,
                    paper_id,
                    sheet["roll_number"],
                    sheet["name"],
                    sheet["source"],
                    json.dumps(sheet["responses"]),
                    json.dumps(sheet["result"]),
                    sheet["scored_at"],
                ),
            )
            row = db.execute(
                "SELECT * FROM sheets WHERE school_id = ? AND paper_id = ? AND roll_number = ?",
                (school_id, paper_id, sheet["roll_number"]),
            ).fetchone()
        return _sheet(row)

    def sheets(self, school_id: str, paper_id: str) -> List[Dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM sheets WHERE school_id = ? AND paper_id = ? ORDER BY id", (school_id, paper_id)
            ).fetchall()
        return [_sheet(row) for row in rows]

    def clear_sheets(self, school_id: str, paper_id: str) -> int:
        with self.connect() as db:
            return db.execute(
                "DELETE FROM sheets WHERE school_id = ? AND paper_id = ?", (school_id, paper_id)
            ).rowcount


def _sheet(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "paper_id": row["paper_id"],
        "roll_number": row["roll_number"],
        "name": row["name"],
        "source": row["source"],
        "responses": json.loads(row["responses"]),
        "result": json.loads(row["result"]),
        "scored_at": row["scored_at"],
    }
