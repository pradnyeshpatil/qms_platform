import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.models import TenantModel


class Company(models.Model):
    class Status(models.TextChoices):
        TRIAL = "trial"
        ACTIVE = "active"
        SUSPENDED = "suspended"
        CANCELLED = "cancelled"
        DELETED_PENDING = "deleted_pending"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=40, unique=True)  # immutable after creation
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    country = models.CharField(max_length=80, blank=True)
    timezone = models.CharField(max_length=64, default="America/Chicago")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "companies"

    def __str__(self):
        return self.name


class Plant(TenantModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                "company", Lower("name"), condition=models.Q(deleted_at__isnull=True),
                name="uniq_plant_company_name_ci",
            )
        ]

    def __str__(self):
        return self.name


class Department(TenantModel):
    """Optionally tied to one plant; plant=None means company-wide."""

    name = models.CharField(max_length=120)
    plant = models.ForeignKey(Plant, null=True, blank=True, on_delete=models.PROTECT, related_name="departments")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                "company", Lower("name"), condition=models.Q(deleted_at__isnull=True),
                name="uniq_department_company_name_ci",
            )
        ]

    def __str__(self):
        return self.name


class Membership(models.Model):
    """User <-> Company link. One role per company (MVP)."""

    class Status(models.TextChoices):
        INVITED = "invited"   # invitation sent, not yet accepted: cannot sign in
        ACTIVE = "active"
        INACTIVE = "inactive"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="memberships")
    role = models.ForeignKey("rbac.Role", on_delete=models.PROTECT, related_name="memberships")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.PROTECT, related_name="memberships")
    plant = models.ForeignKey(Plant, null=True, blank=True, on_delete=models.PROTECT, related_name="memberships")
    employee_id = models.CharField(max_length=40, blank=True)
    username = models.CharField(max_length=60, null=True, blank=True)  # company-specific login name
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    joined_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "company"], name="uniq_membership_user_company"),
            models.UniqueConstraint(
                "company", Lower("username"), condition=models.Q(username__isnull=False),
                name="uniq_membership_company_username_ci",
            ),
            models.UniqueConstraint(
                "company", Lower("employee_id"), condition=~models.Q(employee_id=""),
                name="uniq_membership_company_employee_id_ci",
            ),
        ]

    @property
    def display_name(self):
        return self.user.full_name or self.user.email or self.username or str(self.id)

    def __str__(self):
        return f"{self.user} @ {self.company.slug}"


class Invitation(models.Model):
    """Single-use, expiring email invitation. Only the SHA-256 of the token is stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="invitations")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_pending(self) -> bool:
        return self.accepted_at is None and self.revoked_at is None and self.expires_at > timezone.now()
