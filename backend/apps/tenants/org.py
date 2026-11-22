"""Plants and departments: serializers, services and viewsets (PROJECT_SPEC §6)."""
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.exceptions import ValidationError

from apps.core.mixins import CompanyScopedPrimaryKeyField, TenantViewMixin
from apps.rbac.permissions import ANY_MEMBER

from .models import Department, Membership, Plant


class PlantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plant
        fields = ["id", "name", "code", "is_active"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        company = self.context["request"].company
        qs = Plant.objects.for_company(company).filter(name__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError("A plant with this name already exists.")
        return value.strip()


class DepartmentSerializer(serializers.ModelSerializer):
    plant = CompanyScopedPrimaryKeyField(
        queryset=Plant.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )

    class Meta:
        model = Department
        fields = ["id", "name", "plant", "is_active"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        company = self.context["request"].company
        qs = Department.objects.for_company(company).filter(name__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError("A department with this name already exists.")
        return value.strip()


def _soft_delete(obj):
    obj.deleted_at = timezone.now()
    obj.save(update_fields=["deleted_at", "updated_at"])


def delete_plant(plant: Plant) -> None:
    if (
        Membership.objects.filter(plant=plant).exists()
        or Department.objects.for_company(plant.company).filter(plant=plant).exists()
    ):
        raise ValidationError({"detail": "This plant is in use. Deactivate it instead."})
    _soft_delete(plant)


def delete_department(department: Department) -> None:
    if Membership.objects.filter(department=department).exists():
        raise ValidationError({"detail": "This department is in use. Deactivate it instead."})
    _soft_delete(department)


def _map(manage):
    return {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER,  # reference data for pickers: any member may read
        "create": manage, "update": manage, "partial_update": manage, "destroy": manage,
    }


class PlantViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Plant
    apply_scope = False
    permission_map = _map("plants.manage")
    serializer_class = PlantSerializer
    pagination_class = None
    search_fields = ["name", "code"]

    def perform_create(self, serializer):
        serializer.save(company=self.request.company, created_by=self.request.user)

    def perform_destroy(self, instance):
        delete_plant(instance)


class DepartmentViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Department
    apply_scope = False
    permission_map = _map("departments.manage")
    serializer_class = DepartmentSerializer
    pagination_class = None
    search_fields = ["name"]

    def get_queryset(self):
        return super().get_queryset().select_related("plant")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company, created_by=self.request.user)

    def perform_destroy(self, instance):
        delete_department(instance)
