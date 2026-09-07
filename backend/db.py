import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "viewed.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS viewed_posts (
            post_id TEXT PRIMARY KEY,
            status TEXT,
            viewed_at TEXT
        )
        """
    )
    return conn


def get_viewed_ids() -> set:
    conn = get_db()
    rows = conn.execute("SELECT post_id FROM viewed_posts").fetchall()
    conn.close()
    return {r[0] for r in rows}


def mark_viewed(post_id: str, status: str):
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO viewed_posts (post_id, status, viewed_at) VALUES (?, ?, ?)",
        (post_id, status, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
