from rest_framework import serializers

from .models import Attachment


class AttachmentSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField()
    target_id = serializers.UUIDField()
    file = serializers.FileField(write_only=True)
    uploaded_by = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "target_type", "target_id", "file", "original_name", "content_type", "size",
                  "uploaded_by", "download_url", "thumbnail_url", "created_at"]
        read_only_fields = ["id", "original_name", "content_type", "size", "created_at"]

    def get_uploaded_by(self, obj) -> str | None:
        u = obj.created_by
        return (u.full_name or u.email) if u else None

    def get_download_url(self, obj) -> str:
        slug = self.context["request"].company.slug
        return f"/api/v1/c/{slug}/attachments/{obj.id}/download/"

    def get_thumbnail_url(self, obj) -> str | None:
        if not obj.thumbnail:
            return None
        slug = self.context["request"].company.slug
        return f"/api/v1/c/{slug}/attachments/{obj.id}/thumbnail/"
