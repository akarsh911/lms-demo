import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
  school_id TEXT NOT NULL,
  id TEXT NOT NULL,
  offering_id TEXT NOT NULL,
  author_id TEXT,
  updated_at TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (school_id, id)
);
CREATE INDEX IF NOT EXISTS plans_by_offering ON plans (school_id, offering_id);
CREATE TABLE IF NOT EXISTS term_plans (
  school_id TEXT NOT NULL,
  offering_id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (school_id, offering_id)
);
CREATE TABLE IF NOT EXISTS seeded_schools (
  school_id TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: str, legacy_author_id: str) -> None:
        self.path = path
        self.lock = threading.RLock()
        with self.connect() as db:
            db.executescript(SCHEMA)
            columns = {row[1] for row in db.execute("PRAGMA table_info(plans)")}
            if "author_id" not in columns:
                db.execute("ALTER TABLE plans ADD COLUMN author_id TEXT")
            db.execute("UPDATE plans SET author_id = ? WHERE author_id IS NULL", (legacy_author_id,))

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def plans(self, school_id: str, offering_id: Optional[str] = None, author_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = "SELECT body FROM plans WHERE school_id = ?"
        args = [school_id]
        if offering_id is not None:
            query += " AND offering_id = ?"
            args.append(offering_id)
        if author_id is not None:
            query += " AND author_id = ?"
            args.append(author_id)
        with self.connect() as db:
            rows = db.execute(query + " ORDER BY updated_at DESC, rowid ASC", args).fetchall()
        return [json.loads(body) for (body,) in rows]

    def plan(self, school_id: str, plan_id: str, author_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        query = "SELECT body FROM plans WHERE school_id = ? AND id = ?"
        args = [school_id, plan_id]
        if author_id is not None:
            query += " AND author_id = ?"
            args.append(author_id)
        with self.connect() as db:
            row = db.execute(query, args).fetchone()
        return json.loads(row[0]) if row else None

    def put_plan(self, school_id: str, plan: Dict[str, Any], author_id: Optional[str] = None) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO plans (school_id, id, offering_id, author_id, updated_at, body) VALUES (?, ?, ?, ?, ?, ?)"
                " ON CONFLICT (school_id, id) DO UPDATE SET offering_id = excluded.offering_id,"
                " updated_at = excluded.updated_at, body = excluded.body",
                (school_id, plan["id"], plan["offering_id"], author_id, plan["updated_at"], json.dumps(plan)),
            )

    def delete_plan(self, school_id: str, plan_id: str) -> bool:
        with self.connect() as db:
            return db.execute("DELETE FROM plans WHERE school_id = ? AND id = ?", (school_id, plan_id)).rowcount > 0

    def term_plans(self, school_id: str) -> Dict[str, Dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT offering_id, body FROM term_plans WHERE school_id = ?", (school_id,)).fetchall()
        return {offering_id: json.loads(body) for offering_id, body in rows}

    def put_term_plan(self, school_id: str, settings: Dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO term_plans (school_id, offering_id, body) VALUES (?, ?, ?)"
                " ON CONFLICT (school_id, offering_id) DO UPDATE SET body = excluded.body",
                (school_id, settings["offering_id"], json.dumps(settings)),
            )

    def mark_seeded(self, school_id: str, now: str) -> bool:
        with self.connect() as db:
            return db.execute("INSERT OR IGNORE INTO seeded_schools (school_id, seeded_at) VALUES (?, ?)", (school_id, now)).rowcount > 0

    def plan_bodies(self, school_id: str) -> Dict[str, str]:
        with self.connect() as db:
            return dict(db.execute("SELECT id, body FROM plans WHERE school_id = ?", (school_id,)).fetchall())

    def forget_school(self, school_id: str) -> int:
        with self.connect() as db:
            term_plans = db.execute("DELETE FROM term_plans WHERE school_id = ?", (school_id,)).rowcount
            db.execute("DELETE FROM plans WHERE school_id = ?", (school_id,))
            db.execute("DELETE FROM seeded_schools WHERE school_id = ?", (school_id,))
            return term_plans
