import os
import json
import random
import sqlite3
from datetime import datetime
from typing import Optional, Dict, List

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


def parse_comments(raw: str) -> Dict[str, List[dict]]:
    """Parse a comments .jsonl dump and group comments by their parent post id."""
    by_post: Dict[str, List[dict]] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            c = json.loads(line)
        except json.JSONDecodeError:
            continue

        body = c.get("body", "")
        if not body or body in ("[removed]", "[deleted]"):
            continue

        # Reddit dumps usually store link_id as "t3_<post_id>" - strip any prefix.
        link_id = str(c.get("link_id", ""))
        post_id = link_id.split("_")[-1] if link_id else ""
        if not post_id:
            continue

        words_count = len(body.split())
        date_str = "Unknown Date"
        created_utc = c.get("created_utc")
        if created_utc:
            try:
                date_str = datetime.fromtimestamp(int(created_utc)).strftime("%Y-%m-%d")
            except (ValueError, OSError):
                pass

        comment = {
            "id": str(c.get("id", "")),
            "text": body,
            "words": words_count,
            "score": c.get("score", 0),
            "date": date_str,
            "author": c.get("author", ""),
        }
        by_post.setdefault(post_id, []).append(comment)
    return by_post


@app.post("/api/parse")
async def parse_dump(
    posts: UploadFile = File(...),
    comments: Optional[UploadFile] = File(None),
    min_words: int = Form(1),
    max_words: int = Form(1000),
    min_score: int = Form(1),
    keyword: str = Form(""),
    x_app_password: str = Header(default=""),
):
    """Parse an uploaded posts (+ optional comments) dump, filter, link, shuffle, return."""
    require_password(x_app_password)

    viewed_ids = get_viewed_ids()

    comments_by_post: Dict[str, List[dict]] = {}
    if comments is not None:
        comments_raw = (await comments.read()).decode("utf-8", errors="ignore")
        comments_by_post = parse_comments(comments_raw)

    stories = []
    raw = (await posts.read()).decode("utf-8", errors="ignore")

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
                "author": post.get("author", ""),
                "subreddit": post.get("subreddit", ""),
                "comments": comments_by_post.get(post_id, []),
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


@app.delete("/api/mark/{post_id}")
async def unmark(post_id: str, x_app_password: str = Header(default="")):
    """Undo: remove a post's viewed record so it can show up again."""
    require_password(x_app_password)
    conn = get_db()
    conn.execute("DELETE FROM viewed_posts WHERE post_id = ?", (post_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"ok": True}
