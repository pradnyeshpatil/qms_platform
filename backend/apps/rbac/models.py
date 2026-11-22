import uuid

from django.db import models
from django.db.models.functions import Lower

from .catalog import SCOPES


class Permission(models.Model):
    """Global catalog row. Seeded from catalog.py; never edited by tenants."""

    code = models.CharField(max_length=60, unique=True)
    module = models.CharField(max_length=40)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code


class Role(models.Model):
    """Company-owned role. System roles are seeded per company: editable, not deletable."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="roles")
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)
    is_system = models.BooleanField(default=False)
    system_key = models.CharField(max_length=40, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint("company", Lower("name"), name="uniq_role_company_name_ci"),
            models.UniqueConstraint(
                fields=["company", "system_key"], condition=models.Q(system_key__isnull=False),
                name="uniq_role_company_system_key",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.company_id})"


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="grants")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="+")
    scope = models.CharField(max_length=20, choices=[(s, s) for s in SCOPES], default="all")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["role", "permission"], name="uniq_role_permission")]
