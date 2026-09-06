import os
import shutil
import tempfile
from typing import Optional

import requests
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from auth import require_password

router = APIRouter(prefix="/api/video", tags=["video"])

REDDIT_HEADERS = {"User-Agent": "reddit-story-tool/1.0 (personal use, 2 users)"}


@router.get("/discover")
async def discover(
    subreddit: str = Query(...),
    sort: str = Query("top"),
    t: str = Query("week"),
    limit: int = Query(30),
    x_app_password: str = Header(default=""),
):
    """Live-browse a subreddit's public JSON listing (no Reddit API key needed)
    and keep only actual video posts."""
    require_password(x_app_password)

    sort = sort if sort in ("top", "hot", "new") else "top"
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
    params = {"limit": max(1, min(limit, 100))}
    if sort == "top":
        params["t"] = t

    try:
        resp = requests.get(url, headers=REDDIT_HEADERS, params=params, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Не удалось получить данные с Reddit: {e}")

    data = resp.json()
    clips = []
    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {}) or {}
        if not post.get("is_video"):
            continue

        media = post.get("media") or {}
        reddit_video = media.get("reddit_video") or {}

        thumb = post.get("thumbnail", "")
        if not str(thumb).startswith("http"):
            thumb = ""

        clips.append(
            {
                "id": post.get("id", ""),
                "title": post.get("title", ""),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "author": post.get("author", ""),
                "subreddit": post.get("subreddit", ""),
                "permalink": f"https://www.reddit.com{post.get('permalink', '')}",
                "thumbnail": thumb,
                "duration": reddit_video.get("duration", 0),
                "width": reddit_video.get("width", 0),
                "height": reddit_video.get("height", 0),
                "preview_url": reddit_video.get("fallback_url", ""),
                "created_utc": post.get("created_utc", 0),
            }
        )

    return {"clips": clips, "count": len(clips)}


class ResolveRequest(BaseModel):
    url: str


@router.post("/resolve")
async def resolve(req: ResolveRequest, x_app_password: str = Header(default="")):
    """Fetch metadata (title, duration, thumbnail) for any link yt-dlp supports,
    without downloading anything - used for the Quick Add preview card."""
    require_password(x_app_password)
    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(status_code=500, detail="yt-dlp не установлен на сервере")

    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось обработать ссылку: {e}")

    return {
        "title": info.get("title", ""),
        "duration": info.get("duration", 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", ""),
        "extractor": info.get("extractor", ""),
        "webpage_url": info.get("webpage_url", req.url),
    }


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None


@router.post("/download")
async def download(
    req: DownloadRequest,
    background_tasks: BackgroundTasks,
    x_app_password: str = Header(default=""),
):
    """Actually download the clip via yt-dlp and stream the .mp4 back so the
    browser saves it to the user's own Downloads folder."""
    require_password(x_app_password)
    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(status_code=500, detail="yt-dlp не установлен на сервере")

    tmp_dir = tempfile.mkdtemp(prefix="ytdlp_")
    out_template = os.path.join(tmp_dir, "%(id)s.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": out_template,
        # Prefer an already-muxed mp4 (single file, audio+video together) so we
        # don't need ffmpeg to merge separate streams - Render's free tier
        # doesn't have ffmpeg installed. Slightly lower max quality in exchange
        # for not needing a heavier server setup.
        "format": "best[ext=mp4]/best",
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=True)
            filename = ydl.prepare_filename(info)
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Не удалось скачать: {e}")

    if not os.path.exists(filename):
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Файл не найден после скачивания")

    raw_title = (req.title or info.get("title") or "clip").strip()
    safe_title = "".join(c for c in raw_title if c.isalnum() or c in " -_").strip() or "clip"
    download_name = f"{safe_title}.mp4"

    # Delete the temp file only after the response has finished streaming,
    # so we don't slowly fill up the server's disk over many downloads.
    cleanup = BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True)
    return FileResponse(filename, media_type="video/mp4", filename=download_name, background=cleanup)
