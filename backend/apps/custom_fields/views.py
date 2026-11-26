from rest_framework import mixins, viewsets

from apps.core.mixins import TenantViewMixin
from apps.rbac.permissions import ANY_MEMBER

from . import services
from .models import CustomFieldDefinition
from .serializers import CustomFieldSerializer


class CustomFieldViewSet(TenantViewMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                         mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Custom field definitions. Everyone reads (forms render from them); `custom_fields.manage` writes.
    There is no DELETE: deactivate a field instead so existing records keep their values."""

    model = CustomFieldDefinition
    apply_scope = False
    permission_map = {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER, "create": "custom_fields.manage",
        "update": "custom_fields.manage", "partial_update": "custom_fields.manage",
    }
    serializer_class = CustomFieldSerializer
    filterset_fields = ["entity_type", "section", "is_active", "field_type"]
    ordering_fields = ["sort_order", "label", "created_at"]
    pagination_class = None

    def perform_create(self, serializer):
        serializer.instance = services.create_definition(
            company=self.request.company, user=self.request.user, data=serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = services.update_definition(
            serializer.instance, serializer.validated_data, user=self.request.user)
