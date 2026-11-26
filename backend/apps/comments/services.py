from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.rbac.authorization import can

from .models import Comment, CommentEdit


def _preview(text: str) -> str:
    return text if len(text) <= 120 else text[:117] + "..."


@transaction.atomic
def create_comment(*, company, membership, target, target_type, body, visibility) -> Comment:
    if visibility == Comment.Visibility.CUSTOMER_VISIBLE and not can(membership, "comments.create_customer_visible"):
        raise PermissionDenied("You do not have permission to write customer-visible comments.")
    comment = Comment.objects.create(
        company=company, created_by=membership.user, author=membership, target_type=target_type,
        target_id=target.pk, body=body, visibility=visibility,
    )
    audit.log(company=company, user=membership.user, action="comment.created", target=target,
              target_type=target_type,
              changes={"comment_id": str(comment.id), "visibility": visibility, "preview": _preview(body)})
    return comment


def can_edit(comment: Comment, membership) -> bool:
    window = timedelta(minutes=settings.COMMENT_EDIT_WINDOW_MINUTES)
    return (
        comment.author_id == membership.id and comment.deleted_at is None
        and timezone.now() - comment.created_at <= window
    )


@transaction.atomic
def edit_comment(comment: Comment, *, membership, target, body=None, visibility=None) -> Comment:
    if comment.author_id != membership.id:
        raise PermissionDenied("Only the author can edit a comment.")
    if not can_edit(comment, membership):
        raise ValidationError({"detail": f"Comments can only be edited for {settings.COMMENT_EDIT_WINDOW_MINUTES} minutes."})
    if visibility is not None and visibility != comment.visibility:
        if visibility == Comment.Visibility.CUSTOMER_VISIBLE and not can(
            membership, "comments.create_customer_visible"
        ):
            raise PermissionDenied("You do not have permission to write customer-visible comments.")
    changes = {}
    if body is not None and body != comment.body:
        CommentEdit.objects.create(comment=comment, previous_body=comment.body, edited_by=membership)
        changes["body"] = {"from": _preview(comment.body), "to": _preview(body)}
        comment.body = body
    if visibility is not None and visibility != comment.visibility:
        changes["visibility"] = {"from": comment.visibility, "to": visibility}
        comment.visibility = visibility
    if changes:
        comment.edited_at = timezone.now()
        comment.save()
        audit.log(company=comment.company, user=membership.user, action="comment.edited", target=target,
                  target_type=comment.target_type, changes={"comment_id": str(comment.id), **changes})
    return comment


@transaction.atomic
def delete_comment(comment: Comment, *, membership, target) -> None:
    if comment.author_id != membership.id and not can(membership, "settings.manage"):
        raise PermissionDenied("Only the author or a company admin can delete a comment.")
    comment.deleted_at = timezone.now()
    comment.save(update_fields=["deleted_at", "updated_at"])
    audit.log(company=comment.company, user=membership.user, action="comment.deleted", target=target,
              target_type=comment.target_type,
              changes={"comment_id": str(comment.id), "preview": _preview(comment.body)})
