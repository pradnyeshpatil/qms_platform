from rest_framework import viewsets

from apps.core.mixins import TenantViewMixin

from . import services
from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Customer
    permission_map = {
        "list": "customers.view", "retrieve": "customers.view", "create": "customers.create",
        "update": "customers.update", "partial_update": "customers.update", "destroy": "customers.delete",
    }
    serializer_class = CustomerSerializer
    search_fields = ["name", "contact_person", "email"]
    filterset_fields = ["status", "country"]
    ordering_fields = ["name", "created_at", "country"]

    def perform_create(self, serializer):
        serializer.instance = services.create_customer(
            company=self.request.company, user=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_customer(serializer.instance, serializer.validated_data)

    def perform_destroy(self, instance):
        services.delete_customer(instance)
