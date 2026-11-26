import uuid

from django.db import models


class AppendOnlyQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise RuntimeError("ActivityLog is append-only.")

    def delete(self):
        raise RuntimeError("ActivityLog is append-only.")

    def bulk_update(self, *args, **kwargs):
        raise RuntimeError("ActivityLog is append-only.")


class ActivityLog(models.Model):
    """Append-only audit trail (PROJECT_SPEC §13). Rows are never updated or deleted: enforced in the model,
    the queryset, and a PostgreSQL trigger (migration 0002), so not even a stray `.update()` can rewrite history.

    Actor and target are stored by value (no FKs) so history survives user / record deletion.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "tenants.Company", on_delete=models.DO_NOTHING, db_constraint=False, related_name="+"
    )
    actor_user_id = models.UUIDField(null=True, blank=True)
    actor_name = models.CharField(max_length=200, blank=True)
    action = models.CharField(max_length=60)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.UUIDField(null=True, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)  # {field: {"from": x, "to": y}} or free-form details
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    request_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["company", "target_type", "target_id", "-created_at"]),
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["company", "action"]),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RuntimeError("ActivityLog is append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("ActivityLog is append-only.")
