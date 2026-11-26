from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseRedirect
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser

from apps.core.mixins import TenantViewMixin
from apps.core.targets import resolve_target
from apps.rbac.permissions import ANY_MEMBER

from . import services
from .models import Attachment
from .serializers import AttachmentSerializer


class AttachmentViewSet(
    TenantViewMixin, mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    """Files on a record. List/read/download: anyone who can view the record. Upload: attachments.upload.
    Delete: the uploader or attachments.delete. List needs `?target_type=complaint&target_id=<uuid>`."""

    model = Attachment
    apply_scope = False  # access follows the *target* record, checked via resolve_target
    permission_map = {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER, "download": ANY_MEMBER, "thumbnail": ANY_MEMBER,
        "create": "attachments.upload", "destroy": ANY_MEMBER,
    }
    serializer_class = AttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]
    ordering_fields = ["created_at", "size", "original_name"]

    def _target(self, target_type, target_id):
        return resolve_target(self.request.company, self.request.membership, target_type, target_id)

    def get_queryset(self):
        qs = super().get_queryset().select_related("created_by")
        if getattr(self, "swagger_fake_view", False):
            return qs
        if self.action == "list":
            p = self.request.query_params
            if not p.get("target_type") or not p.get("target_id"):
                raise ValidationError({"target_type": "target_type and target_id are required."})
            target = self._target(p["target_type"], p["target_id"])
            return qs.filter(target_type=p["target_type"], target_id=target.pk)
        return qs

    def get_object(self):
        attachment = super().get_object()
        self._attachment_target = self._target(attachment.target_type, attachment.target_id)
        return attachment

    def perform_create(self, serializer):
        d = serializer.validated_data
        target = self._target(d["target_type"], d["target_id"])
        serializer.instance = services.upload_attachment(
            company=self.request.company, user=self.request.user, target=target, target_type=d["target_type"],
            uploaded=d["file"],
        )

    def perform_destroy(self, instance):
        services.delete_attachment(instance, membership=self.request.membership, target=self._attachment_target)

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None, **kwargs):
        """The file, after the permission check. Always an attachment download, never rendered inline.
        On S3 storage this redirects to a short-lived presigned URL instead of proxying the bytes."""
        a = self.get_object()
        if settings.ATTACHMENT_STORAGE == "s3":
            return HttpResponseRedirect(a.file.storage.url(a.file.name, parameters={
                "ResponseContentDisposition": _disposition(a.original_name),
                "ResponseContentType": a.content_type,
            }, expire=settings.ATTACHMENT_URL_TTL_SECONDS))
        response = FileResponse(a.file.open("rb"), as_attachment=True, filename=a.original_name,
                                content_type=a.content_type)
        return _harden(response)

    @extend_schema(responses={(200, "image/jpeg"): bytes})
    @action(detail=True, methods=["get"])
    def thumbnail(self, request, pk=None, **kwargs):
        """256px JPEG preview for image attachments (404 for other types)."""
        a = self.get_object()
        if not a.thumbnail:
            raise Http404
        if settings.ATTACHMENT_STORAGE == "s3":
            return HttpResponseRedirect(a.thumbnail.storage.url(
                a.thumbnail.name, parameters={"ResponseContentType": "image/jpeg"},
                expire=settings.ATTACHMENT_URL_TTL_SECONDS,
            ))
        return _harden(FileResponse(a.thumbnail.open("rb"), content_type="image/jpeg"))


def _harden(response):
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response


def _disposition(name: str) -> str:
    from urllib.parse import quote

    return f"attachment; filename*=UTF-8''{quote(name)}"
