import os
import json
import random
import sqlite3
from datetime import datetime
from typing import Optional, Dict, List, Iterator

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import APP_PASSWORD, require_password
from video import router as video_router

app = FastAPI(title="Reddit Story Tool API")

# Allow the Next.js dev server (and Codespaces forwarded port) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video_router)

DB_PATH = os.path.join(os.path.dirname(__file__), "viewed.db")


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


def iter_lines(upload: UploadFile) -> Iterator[str]:
    """Read an uploaded file line by line without ever holding the whole thing
    in memory at once - large files (Starlette spools >1MB to disk automatically)
    are streamed straight from disk instead of being read into one giant string."""
    upload.file.seek(0)
    for raw_line in upload.file:
        try:
            line = raw_line.decode("utf-8", errors="ignore").strip()
        except AttributeError:
            line = str(raw_line).strip()
        if line:
            yield line


def parse_comments(upload: UploadFile, accepted_post_ids: set) -> Dict[str, List[dict]]:
    """Parse a comments .jsonl dump and group comments by parent post id.
    Only comments belonging to a post we actually kept are stored, so a huge
    comments dump doesn't balloon memory when most posts got filtered out."""
    by_post: Dict[str, List[dict]] = {}
    for line in iter_lines(upload):
        try:
            c = json.loads(line)
        except json.JSONDecodeError:
            continue

        link_id = str(c.get("link_id", ""))
        post_id = link_id.split("_")[-1] if link_id else ""
        if not post_id or post_id not in accepted_post_ids:
            continue

        body = c.get("body", "")
        if not body or body in ("[removed]", "[deleted]"):
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
    stories = []

    for line in iter_lines(posts):
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
            }
        )

    if comments is not None:
        accepted_ids = {s["id"] for s in stories}
        comments_by_post = parse_comments(comments, accepted_ids)
        for s in stories:
            s["comments"] = comments_by_post.get(s["id"], [])
    else:
        for s in stories:
            s["comments"] = []

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
