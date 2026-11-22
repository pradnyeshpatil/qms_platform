import uuid

from django.conf import settings
from django.db import models


class TenantManager(models.Manager):
    """Tenant data must be fetched through for_company(); no implicit scoping."""

    def for_company(self, company, include_deleted=False):
        if company is None:
            raise ValueError("A company is required for tenant queries.")
        qs = self.get_queryset().filter(company=company)
        return qs if include_deleted else qs.filter(deleted_at__isnull=True)


class TenantModel(models.Model):
    """Base for every company-owned record. Composite indexes should start with company."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="+")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = TenantManager()

    class Meta:
        abstract = True


class NumberSequence(models.Model):
    """Per-company, per-key, per-year counter. Always incremented under a row lock."""

    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=40)
    year = models.PositiveIntegerField()
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "key", "year"], name="uniq_number_sequence")
        ]
