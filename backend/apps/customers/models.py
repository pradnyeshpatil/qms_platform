from django.db import models
from django.db.models.functions import Lower

from apps.core.models import TenantModel


class Customer(TenantModel):
    """External customer (OEM/buyer) of a tenant company."""

    class Status(models.TextChoices):
        ACTIVE = "active"
        INACTIVE = "inactive"

    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    country = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["company", "status"])]
        constraints = [
            models.UniqueConstraint(
                "company", Lower("name"), condition=models.Q(deleted_at__isnull=True),
                name="uniq_customer_company_name_ci",
            )
        ]

    def __str__(self):
        return self.name
