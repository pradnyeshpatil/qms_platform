from rest_framework import serializers

from . import catalog


class GrantSerializer(serializers.Serializer):
    code = serializers.CharField()
    scope = serializers.ChoiceField(choices=catalog.SCOPES, default=catalog.ALL)


class RoleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=80)
    description = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")
    is_system = serializers.BooleanField(read_only=True)
    system_key = serializers.CharField(read_only=True, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    member_count = serializers.SerializerMethodField()
    permissions = GrantSerializer(many=True, required=False, write_only=True, source="grant_list")

    def get_member_count(self, role) -> int:
        return role.memberships.exclude(status="inactive").count()

    def to_representation(self, role):
        data = super().to_representation(role)
        data["permissions"] = [
            {"code": code, "scope": scope}
            for code, scope in role.grants.values_list("permission__code", "scope").order_by("permission__code")
        ]
        return data


class RoleSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    system_key = serializers.CharField(allow_null=True)
