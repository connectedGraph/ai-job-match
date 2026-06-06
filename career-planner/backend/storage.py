import json
import sqlite3
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .config import DATA_DIR, DB_PATH, LEGACY_DB_PATH
from .security import hash_password


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_timestamp_uid() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return f"U{timestamp}_{uuid.uuid4().hex[:6]}"


def _materialize_db_path() -> None:
    if DB_PATH.exists():
        return
    if LEGACY_DB_PATH.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(LEGACY_DB_PATH, DB_PATH)


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _materialize_db_path()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(row) if row is not None else None


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT UNIQUE,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_data (
                user_id INTEGER PRIMARY KEY,
                student_profile TEXT NOT NULL DEFAULT '{}',
                ai_results TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profile_submissions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                evaluation TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS match_workspace (
                user_id INTEGER PRIMARY KEY,
                workspace_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "uid" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN uid TEXT")
        rows = conn.execute("SELECT id FROM users WHERE uid IS NULL OR uid = ''").fetchall()
        for row in rows:
            conn.execute("UPDATE users SET uid = ? WHERE id = ?", (create_timestamp_uid(), row["id"]))
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid)")
        conn.commit()


def create_user(username: str, password: str) -> Dict[str, Any]:
    timestamp = now_iso()
    uid = create_timestamp_uid()
    with _connect() as conn:
        cursor = conn.execute(
            "INSERT INTO users (uid, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (uid, username, hash_password(password), timestamp, timestamp),
        )
        user_id = int(cursor.lastrowid)
        conn.execute(
            "INSERT INTO user_data (user_id, student_profile, ai_results, updated_at) VALUES (?, '{}', '{}', ?)",
            (user_id, timestamp),
        )
        conn.commit()
    return {"id": user_id, "uid": uid, "username": username, "created_at": timestamp, "updated_at": timestamp}


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return _row_to_dict(row)


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_dict(row)


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("uid") or user["id"],
        "dbId": user["id"],
        "username": user["username"],
        "createdAt": user.get("created_at"),
        "updatedAt": user.get("updated_at"),
    }


def update_username(user_id: int, username: str) -> Dict[str, Any]:
    timestamp = now_iso()
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET username = ?, updated_at = ? WHERE id = ?",
            (username, timestamp, user_id),
        )
        conn.commit()
    user = get_user_by_id(user_id)
    if not user:
        raise RuntimeError("user not found")
    return user


def update_password(user_id: int, password: str) -> Dict[str, Any]:
    timestamp = now_iso()
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(password), timestamp, user_id),
        )
        conn.commit()
    user = get_user_by_id(user_id)
    if not user:
        raise RuntimeError("user not found")
    return user


def get_user_data(user_id: int) -> Dict[str, Any]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM user_data WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return {"studentData": None, "aiResults": None, "updatedAt": None}
    student_profile = json.loads(row["student_profile"] or "{}")
    ai_results = json.loads(row["ai_results"] or "{}")
    return {
        "studentData": student_profile or None,
        "aiResults": ai_results or None,
        "updatedAt": row["updated_at"],
    }


def upsert_user_data(user_id: int, student_data: Dict[str, Any], ai_results: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_data (user_id, student_profile, ai_results, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                student_profile = excluded.student_profile,
                ai_results = excluded.ai_results,
                updated_at = excluded.updated_at
            """,
            (
                user_id,
                json.dumps(student_data or {}, ensure_ascii=False),
                json.dumps(ai_results or {}, ensure_ascii=False),
                timestamp,
            ),
        )
        conn.execute("UPDATE users SET updated_at = ? WHERE id = ?", (timestamp, user_id))
        conn.commit()
    return {"updatedAt": timestamp}


def insert_profile_submission(user_id: int, payload: Dict[str, Any], evaluation: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    submission_id = f"sub_{uuid.uuid4().hex[:16]}"
    with _connect() as conn:
        conn.execute(
            "INSERT INTO profile_submissions (id, user_id, payload, evaluation, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                submission_id,
                user_id,
                json.dumps(payload or {}, ensure_ascii=False),
                json.dumps(evaluation or {}, ensure_ascii=False),
                timestamp,
            ),
        )
        conn.commit()
    return {"submissionId": submission_id, "submittedAt": timestamp}


def get_match_workspace(user_id: int) -> Dict[str, Any]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM match_workspace WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        return {"workspace": None, "updatedAt": None}
    return {
        "workspace": json.loads(row["workspace_json"] or "{}"),
        "updatedAt": row["updated_at"],
    }


def upsert_match_workspace(user_id: int, workspace: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO match_workspace (user_id, workspace_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                workspace_json = excluded.workspace_json,
                updated_at = excluded.updated_at
            """,
            (user_id, json.dumps(workspace or {}, ensure_ascii=False), timestamp),
        )
    return {"updatedAt": timestamp}


def reset_user_data(user_id: int) -> None:
    timestamp = now_iso()
    with _connect() as conn:
        # Reset user data record
        conn.execute(
            "UPDATE user_data SET student_profile = '{}', ai_results = '{}', updated_at = ? WHERE user_id = ?",
            (timestamp, user_id),
        )
        # Reset match workspace
        conn.execute(
            "UPDATE match_workspace SET workspace_json = '{}', updated_at = ? WHERE user_id = ?",
            (timestamp, user_id),
        )
        # Clear profile submissions history
        conn.execute("DELETE FROM profile_submissions WHERE user_id = ?", (user_id,))
        conn.commit()
