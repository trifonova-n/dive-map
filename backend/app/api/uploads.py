import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user
from ..config import settings
from ..models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

CHUNK_SIZE = 64 * 1024


@router.post("/landmark-image")
async def upload_landmark_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    ext = ALLOWED_EXTENSIONS.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=415,
            detail="Unsupported image type. Use JPEG, PNG, or WebP.",
        )

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    final_name = f"{uuid.uuid4().hex}{ext}"
    final_path = uploads_dir / final_name
    temp_path = uploads_dir / f".{final_name}.part"

    written = 0
    try:
        with temp_path.open("wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                written += len(chunk)
                if written > settings.uploads_max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Image is too large. Max "
                            f"{settings.uploads_max_bytes // (1024 * 1024)} MB."
                        ),
                    )
                out.write(chunk)
        os.replace(temp_path, final_path)
    except HTTPException:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise
    except Exception:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise

    return {"url": f"{settings.uploads_url_prefix}/{final_name}"}
