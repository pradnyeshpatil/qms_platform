import re

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.accounts.models import User

from .models import Company

RESERVED_SLUGS = {
    "admin", "api", "platform-admin", "support", "www", "app", "static", "login", "register",
    "docs", "health", "auth", "c", "s", "public", "billing", "help", "status",
}
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$")


class RegisterSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=200)
    company_slug = serializers.CharField(max_length=40)
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100, allow_blank=True, required=False, default="")
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_company_slug(self, value):
        value = value.strip().lower()
        if not SLUG_RE.match(value):
            raise serializers.ValidationError("Use 3-40 lowercase letters, digits or hyphens.")
        if value in RESERVED_SLUGS:
            raise serializers.ValidationError("This workspace name is reserved.")
        if Company.objects.filter(slug=value).exists():
            raise serializers.ValidationError("This workspace name is taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate(self, attrs):
        validate_password(attrs["password"], User(email=attrs["email"], first_name=attrs["first_name"]))
        return attrs
