from rest_framework import serializers

from apps.core.mixins import CompanyScopedPrimaryKeyField
from apps.core.utils import company_today
from apps.customers.models import Customer
from apps.tenants.models import Department, Membership, Plant

from .models import Complaint, ComplaintStatus, DefectCategory

_ACTIVE_STATUS = ComplaintStatus.objects.filter(deleted_at__isnull=True, is_active=True)


class ComplaintStatusSerializer(serializers.ModelSerializer):
    allowed_next = CompanyScopedPrimaryKeyField(
        queryset=ComplaintStatus.objects.filter(deleted_at__isnull=True), many=True, required=False,
        help_text="If set, only these statuses can follow this one. Empty = any status.",
    )
    is_finished = serializers.BooleanField(read_only=True)

    class Meta:
        model = ComplaintStatus
        fields = ["id", "name", "category", "system_key", "is_default", "is_active", "sort_order",
                  "is_finished", "allowed_next"]
        read_only_fields = ["id", "system_key"]


class DefectCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectCategory
        fields = ["id", "name", "is_active"]
        read_only_fields = ["id"]


class ComplaintSerializer(serializers.ModelSerializer):
    customer = CompanyScopedPrimaryKeyField(queryset=Customer.objects.filter(deleted_at__isnull=True))
    status = CompanyScopedPrimaryKeyField(queryset=_ACTIVE_STATUS, required=False)
    defect_category = CompanyScopedPrimaryKeyField(
        queryset=DefectCategory.objects.filter(deleted_at__isnull=True, is_active=True),
        required=False, allow_null=True,
    )
    owner = CompanyScopedPrimaryKeyField(
        queryset=Membership.objects.filter(status="active"), required=False, allow_null=True
    )
    plant = CompanyScopedPrimaryKeyField(
        queryset=Plant.objects.filter(deleted_at__isnull=True, is_active=True), required=False, allow_null=True
    )
    department = CompanyScopedPrimaryKeyField(
        queryset=Department.objects.filter(deleted_at__isnull=True, is_active=True), required=False, allow_null=True
    )
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    status_name = serializers.CharField(source="status.name", read_only=True)
    status_category = serializers.CharField(source="status.category", read_only=True)
    defect_category_name = serializers.CharField(source="defect_category.name", read_only=True, default=None)
    owner_name = serializers.SerializerMethodField()
    assignees = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            "id", "number", "customer", "customer_name", "customer_reference_number", "title", "description",
            "product_name", "part_number", "batch_number", "quantity_affected", "defect_category",
            "defect_category_name", "severity", "source", "status", "status_name", "status_category",
            "reported_date", "due_date", "closure_comment", "closed_at", "owner", "owner_name", "assignees",
            "plant", "department", "is_overdue", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "closed_at", "created_at", "updated_at"]

    def get_owner_name(self, obj) -> str | None:
        return obj.owner.display_name if obj.owner_id else None

    def get_assignees(self, obj) -> list[dict]:
        return [{"id": a.membership_id, "name": a.membership.display_name} for a in obj.assignees.all()]

    def get_is_overdue(self, obj) -> bool:
        company = self.context["request"].company
        return bool(obj.due_date and obj.due_date < company_today(company) and not obj.status.is_finished)


class AssignSerializer(serializers.Serializer):
    owner = CompanyScopedPrimaryKeyField(
        queryset=Membership.objects.filter(status="active"), required=False, allow_null=True
    )
    assignees = CompanyScopedPrimaryKeyField(
        queryset=Membership.objects.filter(status="active"), many=True, required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide owner and/or assignees.")
        return attrs


class ChangeStatusSerializer(serializers.Serializer):
    status = CompanyScopedPrimaryKeyField(queryset=_ACTIVE_STATUS)
    closure_comment = serializers.CharField(required=False, allow_blank=True)
