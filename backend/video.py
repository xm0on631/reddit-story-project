import json
import os
import shutil
import tempfile
from datetime import datetime
from typing import Iterator, Optional

import zstandard as zstd
from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from auth import require_password
from db import get_viewed_ids

router = APIRouter(prefix="/api/video", tags=["video"])

# Domains we treat as "this is a video post" when the post itself isn't
# natively hosted on Reddit (post.url points off-site to one of these).
VIDEO_DOMAINS = {
    "v.redd.it",
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "m.youtube.com",
    "streamable.com",
    "gfycat.com",
    "clips.twitch.tv",
    "twitch.tv",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "twitter.com",
    "x.com",
    "imgur.com",
}
VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".gifv")


def iter_dump_lines(upload: UploadFile) -> Iterator[str]:
    """Read a .jsonl or .zst-compressed .jsonl dump line by line without ever
    holding the whole (possibly huge) decompressed dump in memory at once.
    Arctic Shift / Pushshift dumps are usually zstandard-compressed with a
    large window, hence max_window_size below."""
    upload.file.seek(0)
    filename = (upload.filename or "").lower()

    if filename.endswith(".zst"):
        dctx = zstd.ZstdDecompressor(max_window_size=2**31)
        with dctx.stream_reader(upload.file) as reader:
            buffer = b""
            while True:
                chunk = reader.read(1 << 16)
                if not chunk:
                    break
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    text = line.decode("utf-8", errors="ignore").strip()
                    if text:
                        yield text
            tail = buffer.decode("utf-8", errors="ignore").strip()
            if tail:
                yield tail
    else:
        for raw_line in upload.file:
            try:
                line = raw_line.decode("utf-8", errors="ignore").strip()
            except AttributeError:
                line = str(raw_line).strip()
            if line:
                yield line


def looks_like_video(post: dict) -> bool:
    if post.get("is_video"):
        return True
    domain = str(post.get("domain", "")).lower()
    if domain in VIDEO_DOMAINS:
        return True
    url = str(post.get("url", "")).lower()
    if "v.redd.it" in url:
        return True
    if url.endswith(VIDEO_EXTENSIONS):
        return True
    return False


@router.post("/parse-dump")
async def parse_dump(
    posts: UploadFile = File(...),
    min_score: int = Form(1000),
    subreddit: str = Form(""),
    x_app_password: str = Header(default=""),
):
    """Parse a local posts dump (.jsonl or .jsonl.zst from Arctic Shift /
    Pushshift), keep only posts that look like video posts, filter by score
    and (optionally) subreddit. No Reddit API/scraping involved at all."""
    require_password(x_app_password)

    viewed_ids = get_viewed_ids()
    clips = []
    for line in iter_dump_lines(posts):
        try:
            post = json.loads(line)
        except json.JSONDecodeError:
            continue

        post_id = post.get("id", "")
        if not post_id or post_id in viewed_ids:
            continue

        score = post.get("score", 0)
        if score < min_score:
            continue

        if subreddit and str(post.get("subreddit", "")).lower() != subreddit.lower():
            continue

        if not looks_like_video(post):
            continue

        permalink = post.get("permalink", "")
        full_permalink = f"https://reddit.com{permalink}" if permalink else ""

        date_str = "Unknown Date"
        created_utc = post.get("created_utc")
        if created_utc:
            try:
                date_str = datetime.fromtimestamp(int(created_utc)).strftime("%Y-%m-%d")
            except (ValueError, OSError, TypeError):
                pass

        thumb = post.get("thumbnail", "")
        if not str(thumb).startswith("http"):
            thumb = ""

        media = post.get("media") or {}
        reddit_video = media.get("reddit_video") or {}

        clips.append(
            {
                "id": post.get("id", ""),
                "title": post.get("title", "No title"),
                "score": score,
                "url": post.get("url", ""),
                "permalink": full_permalink,
                "author": post.get("author", ""),
                "subreddit": post.get("subreddit", ""),
                "num_comments": post.get("num_comments", 0),
                "date": date_str,
                "is_video": bool(post.get("is_video")),
                "domain": post.get("domain", ""),
                "thumbnail": thumb,
                "preview_url": reddit_video.get("fallback_url", ""),
                "duration": reddit_video.get("duration", 0),
                "width": reddit_video.get("width", 0),
                "height": reddit_video.get("height", 0),
            }
        )

    clips.sort(key=lambda c: c["score"], reverse=True)
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
    post_id: Optional[str] = None


@router.post("/download")
async def download(
    req: DownloadRequest,
    background_tasks: BackgroundTasks,
    x_app_password: str = Header(default=""),
):
    """Download the clip via yt-dlp, merging best video + best audio with
    ffmpeg (Reddit serves them as separate DASH streams), and stream the
    resulting .mp4 back so the browser saves it to Downloads."""
    require_password(x_app_password)
    try:
        import yt_dlp
        import imageio_ffmpeg
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Отсутствует зависимость на сервере: {e}")

    tmp_dir = tempfile.mkdtemp(prefix="ytdlp_")
    out_template = os.path.join(tmp_dir, "%(id)s.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": out_template,
        "format": "bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=True)
            filename = ydl.prepare_filename(info)
            base, _ = os.path.splitext(filename)
            merged_path = base + ".mp4"
            if os.path.exists(merged_path):
                filename = merged_path
    except yt_dlp.utils.DownloadError as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Видео недоступно или удалено: {e}")
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Не удалось скачать: {e}")

    if not os.path.exists(filename):
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Файл не найден после скачивания")

    raw_name = (req.title or req.post_id or info.get("title") or info.get("id") or "clip").strip()
    safe_name = "".join(c for c in raw_name if c.isalnum() or c in " -_").strip() or "clip"
    download_name = f"{safe_name}.mp4"

    cleanup = BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True)
    return FileResponse(filename, media_type="video/mp4", filename=download_name, background=cleanup)
