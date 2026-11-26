from rest_framework import serializers

from . import services
from .models import Comment, CommentEdit


class CommentEditSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommentEdit
        fields = ["id", "previous_body", "edited_at"]


class CommentSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField()
    target_id = serializers.UUIDField()
    author_name = serializers.SerializerMethodField()
    is_edited = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=10000)

    class Meta:
        model = Comment
        fields = ["id", "target_type", "target_id", "body", "visibility", "author", "author_name", "is_edited",
                  "can_edit", "edited_at", "created_at"]
        read_only_fields = ["id", "author", "edited_at", "created_at"]

    def validate_body(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A comment cannot be empty.")
        return value

    def get_author_name(self, obj) -> str | None:
        return obj.author.display_name if obj.author_id else None

    def get_is_edited(self, obj) -> bool:
        return obj.edited_at is not None

    def get_can_edit(self, obj) -> bool:
        return services.can_edit(obj, self.context["request"].membership)
