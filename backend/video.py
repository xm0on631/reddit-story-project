import os
import shutil
import tempfile
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from auth import require_password

router = APIRouter(prefix="/api/video", tags=["video"])


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
