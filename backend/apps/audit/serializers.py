from rest_framework import serializers

from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = ["id", "action", "actor_user_id", "actor_name", "target_type", "target_id", "target_label",
                  "changes", "created_at"]
        read_only_fields = fields


class AuditLogSerializer(ActivityLogSerializer):
    """Compliance view: adds request metadata."""

    class Meta(ActivityLogSerializer.Meta):
        fields = ActivityLogSerializer.Meta.fields + ["ip_address", "user_agent", "request_id"]
        read_only_fields = fields
