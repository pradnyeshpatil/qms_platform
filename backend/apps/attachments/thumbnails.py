"""Image thumbnails. Generated inline at upload for now (bounded: pixel cap, 256px JPEG); `make_thumbnail` is a plain
function so it can move into a Celery task unchanged when background jobs arrive. Re-encoding also strips EXIF
(GPS etc.) from what is served as a preview."""
import io
import logging

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

log = logging.getLogger(__name__)
MAX_SOURCE_PIXELS = 50_000_000
THUMB_SIZE = (256, 256)


def make_thumbnail(uploaded) -> ContentFile | None:
    """A JPEG thumbnail ContentFile, or None if the image can't be processed (never raises)."""
    try:
        uploaded.seek(0)
        with Image.open(uploaded) as img:
            if img.width * img.height > MAX_SOURCE_PIXELS:
                return None
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, "white")
                flat.paste(img, mask=img.split()[-1])
                img = flat
            else:
                img = img.convert("RGB")
            img.thumbnail(THUMB_SIZE)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=80, optimize=True)
        return ContentFile(buf.getvalue(), name="thumb.jpg")  # replaced by the storage key on save
    except Exception:  # corrupt / hostile image: skip the preview, keep the upload
        log.warning("thumbnail generation failed", exc_info=True)
        return None
    finally:
        uploaded.seek(0)
