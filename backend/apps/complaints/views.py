from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import TenantViewMixin
from apps.rbac.authorization import can
from apps.rbac.permissions import HasCompanyPermission

from . import selectors, services
from .filters import ComplaintFilter
from .models import Complaint
from .serializers import ComplaintSerializer


class ComplaintViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Complaint
    permission_map = {
        "list": "complaints.view", "retrieve": "complaints.view", "create": "complaints.create",
        "update": "complaints.update", "partial_update": "complaints.update", "destroy": "complaints.delete",
    }
    serializer_class = ComplaintSerializer
    filterset_class = ComplaintFilter
    search_fields = ["number", "title", "product_name", "part_number", "customer__name"]
    ordering_fields = ["created_at", "due_date", "severity", "number", "status"]

    def get_queryset(self):
        return super().get_queryset().select_related("customer", "owner__user")

    def _check_field_permissions(self, data, instance=None):
        """Assigning an owner and resolving/closing are separate permissions."""
        m = self.request.membership
        if "owner" in data:
            current = instance.owner_id if instance else None
            new = data["owner"].id if data["owner"] else None
            if new != current and not can(m, "complaints.assign"):
                raise PermissionDenied("You do not have permission to assign complaint owners.")
        if "status" in data:
            current = instance.status if instance else Complaint.Status.NEW
            if data["status"] != current and data["status"] in Complaint.CLOSED_STATUSES and not can(m, "complaints.close"):
                raise PermissionDenied("You do not have permission to resolve or close complaints.")

    def perform_create(self, serializer):
        self._check_field_permissions(serializer.validated_data)
        serializer.instance = services.create_complaint(
            company=self.request.company, user=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        self._check_field_permissions(serializer.validated_data, serializer.instance)
        serializer.instance = services.update_complaint(serializer.instance, serializer.validated_data)

    def perform_destroy(self, instance):
        services.delete_complaint(instance)


class DashboardView(APIView):
    permission_classes = [HasCompanyPermission]
    required_permission = "complaints.view"

    @extend_schema(responses={200: dict})
    def get(self, request, company_slug):
        return Response(selectors.dashboard_stats(request.company, request.membership))
