import uuid

from django.db import models

from apps.core.models import TenantModel


class Comment(TenantModel):
    """Comment on any registered target (complaint now; 8D reports, sections, tasks later)."""

    class Visibility(models.TextChoices):
        INTERNAL = "internal", "Internal"
        CUSTOMER_VISIBLE = "customer_visible", "Customer visible"

    target_type = models.CharField(max_length=40)
    target_id = models.UUIDField()
    author = models.ForeignKey("tenants.Membership", null=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField()
    visibility = models.CharField(max_length=20, choices=Visibility.choices, default=Visibility.INTERNAL)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["company", "target_type", "target_id", "created_at"])]

    def __str__(self):
        return f"{self.target_type}:{self.target_id} {self.body[:40]}"


class CommentEdit(models.Model):
    """Previous versions of an edited comment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="edits")
    previous_body = models.TextField()
    edited_by = models.ForeignKey("tenants.Membership", null=True, on_delete=models.SET_NULL, related_name="+")
    edited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["edited_at"]
