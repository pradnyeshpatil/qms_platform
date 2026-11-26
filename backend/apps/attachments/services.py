import hashlib

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.rbac.authorization import can

from .models import Attachment
from .thumbnails import make_thumbnail
from .validators import validate_upload


def company_usage_bytes(company) -> int:
    return Attachment.objects.for_company(company).aggregate(n=Sum("size"))["n"] or 0


def _sha256(f) -> str:
    h = hashlib.sha256()
    f.seek(0)
    for chunk in f.chunks():
        h.update(chunk)
    f.seek(0)
    return h.hexdigest()


def upload_attachment(*, company, user, target, target_type, uploaded) -> Attachment:
    name, content_type = validate_upload(uploaded, max_bytes=settings.ATTACHMENT_MAX_BYTES)
    if company_usage_bytes(company) + uploaded.size > settings.ATTACHMENT_COMPANY_QUOTA_BYTES:
        raise ValidationError({"file": "Your workspace's attachment storage quota has been reached."})
    attachment = Attachment(
        company=company, created_by=user, target_type=target_type, target_id=target.pk, original_name=name,
        content_type=content_type, size=uploaded.size, sha256=_sha256(uploaded),
    )
    attachment.file = uploaded
    if content_type.startswith("image/"):
        thumb = make_thumbnail(uploaded)
        if thumb is not None:
            attachment.thumbnail = thumb
    try:
        with transaction.atomic():
            attachment.save()
            audit.log(company=company, user=user, action="attachment.uploaded", target=target,
                      target_type=target_type,
                      changes={"attachment_id": str(attachment.id), "name": name, "size": attachment.size})
    except Exception:
        for f in (attachment.file, attachment.thumbnail):  # no orphan blobs if the DB write failed
            if f and f._committed:
                f.storage.delete(f.name)
        raise
    return attachment


def delete_attachment(attachment: Attachment, *, membership, target) -> None:
    """Uploader (who can still upload) or anyone with attachments.delete. Soft delete; the blob is kept for audit
    until a retention purge removes it."""
    own = attachment.created_by_id == membership.user_id and can(membership, "attachments.upload")
    if not own and not can(membership, "attachments.delete"):
        raise PermissionDenied("You do not have permission to delete this attachment.")
    attachment.deleted_at = timezone.now()
    attachment.save(update_fields=["deleted_at", "updated_at"])
    audit.log(company=attachment.company, user=membership.user, action="attachment.deleted", target=target,
              target_type=attachment.target_type,
              changes={"attachment_id": str(attachment.id), "name": attachment.original_name})
