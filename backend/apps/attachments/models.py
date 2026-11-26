import uuid

from django.db import models

from apps.core.models import TenantModel


def attachment_key(instance, _filename) -> str:
    """Storage key `companies/{company_id}/{target_type}/{uuid}/{random}`. The original filename is never
    part of the key (path tricks, collisions, PII); it lives in `original_name` for display only."""
    return f"companies/{instance.company_id}/{instance.target_type}/{uuid.uuid4()}/{uuid.uuid4().hex}"


def thumbnail_key(instance, _filename) -> str:
    return f"companies/{instance.company_id}/{instance.target_type}/thumbs/{uuid.uuid4().hex}"


class Attachment(TenantModel):
    target_type = models.CharField(max_length=40)
    target_id = models.UUIDField()
    file = models.FileField(upload_to=attachment_key, max_length=255)
    thumbnail = models.FileField(upload_to=thumbnail_key, max_length=255, blank=True)  # images only
    original_name = models.CharField(max_length=255)  # sanitised, display / download name only
    content_type = models.CharField(max_length=100)  # from content sniffing, never from the client
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "target_type", "target_id", "-created_at"])]

    def __str__(self):
        return self.original_name
