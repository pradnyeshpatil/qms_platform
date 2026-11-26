import django_filters
from rest_framework import mixins, viewsets
from rest_framework.exceptions import ValidationError

from apps.core.targets import resolve_target
from apps.rbac.permissions import ANY_MEMBER, HasCompanyPermission

from .models import ActivityLog
from .serializers import ActivityLogSerializer, AuditLogSerializer


class ActivityFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = ActivityLog
        fields = ["action", "target_type", "target_id", "actor_user_id"]


class TargetActivityViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """History of one record (`?target_type=complaint&target_id=...`): visible to whoever can view that record."""

    permission_classes = [HasCompanyPermission]
    permission_map = {"list": ANY_MEMBER}
    serializer_class = ActivityLogSerializer
    filterset_class = None
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ActivityLog.objects.none()
        p = self.request.query_params
        if not p.get("target_type") or not p.get("target_id"):
            raise ValidationError({"target_type": "target_type and target_id are required."})
        target = resolve_target(self.request.company, self.request.membership, p["target_type"], p["target_id"])
        return ActivityLog.objects.filter(
            company=self.request.company, target_type=p["target_type"], target_id=target.pk
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Company-wide audit trail (needs audit.view)."""

    permission_classes = [HasCompanyPermission]
    permission_map = {"list": "audit.view", "retrieve": "audit.view"}
    serializer_class = AuditLogSerializer
    filterset_class = ActivityFilter
    search_fields = ["actor_name", "target_label", "action"]
    ordering_fields = ["created_at", "action"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ActivityLog.objects.none()
        return ActivityLog.objects.filter(company=self.request.company)
