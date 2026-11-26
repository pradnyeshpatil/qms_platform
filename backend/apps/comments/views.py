from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.mixins import TenantViewMixin
from apps.core.targets import resolve_target
from apps.rbac.permissions import ANY_MEMBER

from . import services
from .models import Comment
from .serializers import CommentEditSerializer, CommentSerializer


class CommentViewSet(TenantViewMixin, viewsets.ModelViewSet):
    """Comments on a record. List/read: anyone who can view the record. Write: comments.create.

    List needs `?target_type=complaint&target_id=<uuid>`.
    """

    model = Comment
    apply_scope = False  # visibility follows the *target* record, checked via resolve_target
    permission_map = {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER, "history": ANY_MEMBER, "create": "comments.create",
        "update": "comments.create", "partial_update": "comments.create", "destroy": "comments.create",
    }
    serializer_class = CommentSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filterset_fields = ["visibility"]
    ordering_fields = ["created_at"]

    def _target(self, target_type, target_id):
        return resolve_target(self.request.company, self.request.membership, target_type, target_id)

    def get_queryset(self):
        qs = super().get_queryset().select_related("author__user")
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
        comment = super().get_object()
        self._comment_target = self._target(comment.target_type, comment.target_id)
        return comment

    def perform_create(self, serializer):
        d = serializer.validated_data
        target = self._target(d["target_type"], d["target_id"])
        serializer.instance = services.create_comment(
            company=self.request.company, membership=self.request.membership, target=target,
            target_type=d["target_type"], body=d["body"], visibility=d.get("visibility", Comment.Visibility.INTERNAL),
        )

    def perform_update(self, serializer):
        d = serializer.validated_data
        serializer.instance = services.edit_comment(
            serializer.instance, membership=self.request.membership, target=self._comment_target,
            body=d.get("body"), visibility=d.get("visibility"),
        )

    def perform_destroy(self, instance):
        services.delete_comment(instance, membership=self.request.membership, target=self._comment_target)

    @extend_schema(responses=CommentEditSerializer(many=True))
    @action(detail=True, methods=["get"])
    def history(self, request, pk=None, **kwargs):
        """Previous versions of an edited comment."""
        comment = self.get_object()
        return Response(CommentEditSerializer(comment.edits.all(), many=True).data)
