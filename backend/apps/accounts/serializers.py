from rest_framework import serializers

from apps.rbac.authorization import get_grants


class LoginSerializer(serializers.Serializer):
    """Either `email` + `password`, or `workspace` + `username` + `password`."""

    email = serializers.EmailField(required=False)
    workspace = serializers.CharField(required=False)
    username = serializers.CharField(required=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs.get("email"):
            return attrs
        if attrs.get("workspace") and attrs.get("username"):
            return attrs
        raise serializers.ValidationError("Provide an email, or a workspace and username.")


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


class MembershipSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.CharField()
    company = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    def get_company(self, m):
        return {"id": str(m.company_id), "name": m.company.name, "slug": m.company.slug}

    def get_role(self, m):
        return {"id": str(m.role_id), "name": m.role.name, "system_key": m.role.system_key}

    def get_permissions(self, m) -> dict:
        """{code: scope}; the UI uses it to hide controls. The API enforces it regardless."""
        return get_grants(m)


class MeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField(allow_null=True)
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    must_change_password = serializers.BooleanField()
    memberships = serializers.SerializerMethodField()

    def get_memberships(self, user):
        qs = user.memberships.filter(status="active").select_related("company", "role")
        return MembershipSummarySerializer(qs, many=True).data
