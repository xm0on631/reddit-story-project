import os
import json
import random
import sqlite3
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Reddit Story Tool API")

# Allow the Next.js dev server (and Codespaces forwarded port) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), "viewed.db")

# One shared password for the whole tool (no per-user accounts).
# Set this as an environment variable in Codespaces / wherever you deploy:
#   export APP_PASSWORD="whatever-you-want"
APP_PASSWORD = os.environ.get("APP_PASSWORD", "changeme")


def require_password(x_app_password: str = Header(default="")):
    if x_app_password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login")
async def login(req: LoginRequest):
    if req.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"ok": True}


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


@app.post("/api/parse")
async def parse_dump(
    file: UploadFile = File(...),
    min_words: int = Form(1),
    max_words: int = Form(1000),
    min_score: int = Form(1),
    keyword: str = Form(""),
    x_app_password: str = Header(default=""),
):
    require_password(x_app_password)
    """Parse an uploaded .jsonl dump, filter it, skip already-viewed posts, shuffle, return."""
    viewed_ids = get_viewed_ids()
    stories = []
    raw = (await file.read()).decode("utf-8", errors="ignore")

    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            post = json.loads(line)
        except json.JSONDecodeError:
            continue

        post_id = str(post.get("id", ""))
        text = post.get("selftext", "")

        if not post_id or post_id in viewed_ids:
            continue
        if not text or text in ("[removed]", "[deleted]"):
            continue

        words_count = len(text.split())
        score = post.get("score", 0)

        if not (min_words <= words_count <= max_words and score >= min_score):
            continue

        if keyword:
            kw = keyword.lower()
            if kw not in text.lower() and kw not in post.get("title", "").lower():
                continue

        date_str = "Unknown Date"
        created_utc = post.get("created_utc")
        if created_utc:
            try:
                date_str = datetime.fromtimestamp(int(created_utc)).strftime("%Y-%m-%d")
            except (ValueError, OSError):
                pass

        stories.append(
            {
                "id": post_id,
                "title": post.get("title", "No Title"),
                "text": text,
                "words": words_count,
                "score": score,
                "date": date_str,
                "url": post.get("url", ""),
            }
        )

    random.shuffle(stories)
    return {"stories": stories, "count": len(stories)}


class MarkRequest(BaseModel):
    post_id: str
    status: str  # "approved" or "skipped"


@app.post("/api/mark")
async def mark(req: MarkRequest, x_app_password: str = Header(default="")):
    """Permanently record a post as viewed so future dump loads skip it."""
    require_password(x_app_password)
    mark_viewed(req.post_id, req.status)
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"ok": True}
