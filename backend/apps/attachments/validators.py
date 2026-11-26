"""Upload validation: extension allowlist AND content sniffing (magic bytes). The client-supplied filename
and Content-Type are never trusted (PROJECT_SPEC §13)."""
import re
import zipfile

from rest_framework.exceptions import ValidationError

# extension -> (content type served on download, accepted sniffed kinds)
ALLOWED = {
    "pdf": ("application/pdf", {"pdf"}),
    "png": ("image/png", {"png"}),
    "jpg": ("image/jpeg", {"jpeg"}),
    "jpeg": ("image/jpeg", {"jpeg"}),
    "gif": ("image/gif", {"gif"}),
    "webp": ("image/webp", {"webp"}),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", {"xlsx"}),
    "xls": ("application/vnd.ms-excel", {"ole"}),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", {"docx"}),
    "doc": ("application/msword", {"ole"}),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", {"pptx"}),
    "csv": ("text/csv", {"text"}),
    "txt": ("text/plain", {"text"}),
}
HEAD_BYTES = 8192


def extension_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def sanitize_filename(name: str) -> str:
    """Display name only: no path parts, control characters or odd symbols; extension preserved."""
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[^\w.\- ()]", "_", name, flags=re.UNICODE).strip(" .")
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    stem = stem[: 150 - len(ext) - 1] or "file"
    return f"{stem}.{ext}" if ext else stem


def sniff(f) -> str | None:
    """Detect the real kind of an uploaded file from its content."""
    f.seek(0)
    head = f.read(HEAD_BYTES)
    f.seek(0)
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "ole"
    if head.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(f) as z:
                names = z.namelist()  # listing only; nothing is extracted
        except zipfile.BadZipFile:
            return None
        finally:
            f.seek(0)
        for prefix, kind in (("word/", "docx"), ("xl/", "xlsx"), ("ppt/", "pptx")):
            if any(n.startswith(prefix) for n in names) and "[Content_Types].xml" in names:
                return kind
        return None
    if head and b"\x00" not in head:
        import codecs

        try:
            codecs.getincrementaldecoder("utf-8")().decode(head, final=False)
            return "text"
        except UnicodeDecodeError:
            return None
    return None


def validate_upload(uploaded, *, max_bytes: int) -> tuple[str, str]:
    """Returns (sanitised display name, content type) or raises ValidationError."""
    name = sanitize_filename(uploaded.name or "")
    ext = extension_of(name)
    if ext not in ALLOWED:
        raise ValidationError({"file": f"File type '.{ext}' is not allowed. Allowed: {', '.join(sorted(ALLOWED))}."})
    if uploaded.size <= 0:
        raise ValidationError({"file": "The file is empty."})
    if uploaded.size > max_bytes:
        raise ValidationError({"file": f"The file is larger than the {max_bytes // (1024 * 1024)} MB limit."})
    content_type, kinds = ALLOWED[ext]
    if sniff(uploaded) not in kinds:
        raise ValidationError({"file": "The file content does not match its extension."})
    return name, content_type
