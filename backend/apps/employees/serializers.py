from rest_framework import serializers

from apps.core.mixins import CompanyScopedPrimaryKeyField
from apps.rbac.models import Role
from apps.tenants.models import Department, Membership, Plant


class _OrgRefs(serializers.Serializer):
    role = CompanyScopedPrimaryKeyField(queryset=Role.objects.filter(is_active=True))
    department = CompanyScopedPrimaryKeyField(
        queryset=Department.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    plant = CompanyScopedPrimaryKeyField(
        queryset=Plant.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    employee_id = serializers.CharField(max_length=40, allow_blank=True, required=False, default="")


class InviteSerializer(_OrgRefs):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, allow_blank=True, required=False, default="")


class UsernameEmployeeSerializer(_OrgRefs):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, allow_blank=True, required=False, default="")
    phone = serializers.CharField(max_length=40, allow_blank=True, required=False, default="")
    username = serializers.CharField(max_length=60)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)


class EmployeeUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    phone = serializers.CharField(max_length=40, allow_blank=True, required=False)
    role = CompanyScopedPrimaryKeyField(queryset=Role.objects.filter(is_active=True), required=False)
    department = CompanyScopedPrimaryKeyField(
        queryset=Department.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    plant = CompanyScopedPrimaryKeyField(
        queryset=Plant.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    employee_id = serializers.CharField(max_length=40, allow_blank=True, required=False)


class EmployeeSerializer(serializers.ModelSerializer):
    """Read model: one row per Membership."""

    user_id = serializers.UUIDField(source="user.id")
    email = serializers.EmailField(source="user.email", allow_null=True)
    first_name = serializers.CharField(source="user.first_name")
    last_name = serializers.CharField(source="user.last_name")
    phone = serializers.CharField(source="user.phone")
    must_change_password = serializers.BooleanField(source="user.must_change_password")
    role = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    plant = serializers.SerializerMethodField()
    invitation_expires_at = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = [
            "id", "user_id", "email", "first_name", "last_name", "phone", "username", "employee_id",
            "status", "role", "department", "plant", "joined_at", "must_change_password",
            "invitation_expires_at",
        ]

    def get_role(self, m):
        return {"id": str(m.role_id), "name": m.role.name, "system_key": m.role.system_key}

    def get_department(self, m):
        return {"id": str(m.department_id), "name": m.department.name} if m.department_id else None

    def get_plant(self, m):
        return {"id": str(m.plant_id), "name": m.plant.name} if m.plant_id else None

    def get_invitation_expires_at(self, m):
        if m.status != Membership.Status.INVITED:
            return None
        inv = next((i for i in m.invitations.all() if i.accepted_at is None and i.revoked_at is None), None)
        return inv.expires_at if inv else None


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
