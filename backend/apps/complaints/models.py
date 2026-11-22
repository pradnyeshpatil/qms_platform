from django.db import models
from django.db.models import Q

from apps.core.models import TenantModel


class Complaint(TenantModel):
    # TODO: statuses become company-configurable rows (ComplaintStatus with category).
    class Status(models.TextChoices):
        NEW = "new", "New"
        UNDER_INVESTIGATION = "under_investigation", "Under Investigation"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Severity(models.TextChoices):
        MINOR = "minor", "Minor"
        MAJOR = "major", "Major"
        CRITICAL = "critical", "Critical"

    CLOSED_STATUSES = (Status.RESOLVED, Status.CLOSED)

    number = models.CharField(max_length=20)
    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="complaints")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    product_name = models.CharField(max_length=200, blank=True)
    part_number = models.CharField(max_length=100, blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MINOR)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.NEW)
    due_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        "tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_complaints"
    )

    plant = models.ForeignKey("tenants.Plant", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    department = models.ForeignKey(
        "tenants.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    @staticmethod
    def assigned_q(membership) -> Q:
        """'Assigned' scope (PROJECT_SPEC §5.2). Assignee list arrives with the assignment slice."""
        return Q(owner_id=membership.id)

    def is_assigned_to(self, membership) -> bool:
        return self.owner_id == membership.id

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "severity"]),
            models.Index(fields=["company", "due_date"]),
        ]
        constraints = [models.UniqueConstraint(fields=["company", "number"], name="uniq_complaint_number")]

    def __str__(self):
        return f"{self.number} {self.title}"
