from rest_framework import serializers

from apps.core.mixins import CompanyScopedPrimaryKeyField
from apps.core.utils import company_today
from apps.customers.models import Customer
from apps.tenants.models import Department, Membership, Plant

from .models import Complaint


class ComplaintSerializer(serializers.ModelSerializer):
    customer = CompanyScopedPrimaryKeyField(queryset=Customer.objects.filter(deleted_at__isnull=True))
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
    owner_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            "id", "number", "customer", "customer_name", "title", "description", "product_name",
            "part_number", "severity", "status", "due_date", "owner", "owner_name", "plant", "department", "is_overdue",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "created_at", "updated_at"]

    def get_owner_name(self, obj) -> str | None:
        return obj.owner.display_name if obj.owner_id else None

    def get_is_overdue(self, obj) -> bool:
        company = self.context["request"].company
        return bool(
            obj.due_date and obj.due_date < company_today(company)
            and obj.status not in Complaint.CLOSED_STATUSES
        )
