import uuid

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.core.models import TenantModel


class ComplaintStatus(TenantModel):
    """Company-configurable workflow status (PROJECT_SPEC §8). Logic keys off `category`, never the label."""

    class Category(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        WAITING = "waiting", "Waiting"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    FINISHED = ("resolved", "closed")  # categories that stop the overdue clock and leave the "open" counts

    name = models.CharField(max_length=60)
    category = models.CharField(max_length=20, choices=Category.choices)
    system_key = models.CharField(max_length=40, blank=True)  # set on seeded statuses; stable handle for code
    is_default = models.BooleanField(default=False)  # status given to new complaints
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Optional workflow limits. If a status has any rows here, only those targets are allowed from it.
    allowed_next = models.ManyToManyField("self", through="ComplaintStatusTransition", symmetrical=False,
                                          through_fields=("from_status", "to_status"), related_name="allowed_from")

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "complaint statuses"
        constraints = [
            models.UniqueConstraint(
                "company", Lower("name"), condition=Q(deleted_at__isnull=True), name="uniq_complaint_status_name_ci"
            ),
            models.UniqueConstraint(
                fields=["company"], condition=Q(is_default=True, deleted_at__isnull=True),
                name="uniq_complaint_status_one_default",
            ),
        ]

    @property
    def is_finished(self) -> bool:
        return self.category in self.FINISHED

    def __str__(self):
        return self.name


class ComplaintStatusTransition(models.Model):
    from_status = models.ForeignKey(ComplaintStatus, on_delete=models.CASCADE, related_name="transitions_out")
    to_status = models.ForeignKey(ComplaintStatus, on_delete=models.CASCADE, related_name="transitions_in")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["from_status", "to_status"], name="uniq_status_transition")]


class DefectCategory(TenantModel):
    """Company-managed lookup (dimensional, surface finish, ...)."""

    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "defect categories"
        constraints = [
            models.UniqueConstraint(
                "company", Lower("name"), condition=Q(deleted_at__isnull=True), name="uniq_defect_category_name_ci"
            )
        ]

    def __str__(self):
        return self.name


class Complaint(TenantModel):
    class Severity(models.TextChoices):
        MINOR = "minor", "Minor"
        MAJOR = "major", "Major"
        CRITICAL = "critical", "Critical"

    class Source(models.TextChoices):
        EMAIL = "email", "Email"
        PHONE = "phone", "Phone"
        PORTAL = "portal", "Customer portal"
        AUDIT = "audit", "Audit"
        OTHER = "other", "Other"

    number = models.CharField(max_length=20)
    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="complaints")
    customer_reference_number = models.CharField(max_length=100, blank=True)  # the customer's own complaint id
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    product_name = models.CharField(max_length=200, blank=True)
    part_number = models.CharField(max_length=100, blank=True)
    batch_number = models.CharField(max_length=100, blank=True)  # batch / lot
    quantity_affected = models.PositiveIntegerField(null=True, blank=True)
    defect_category = models.ForeignKey(DefectCategory, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MINOR)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.OTHER)
    status = models.ForeignKey(ComplaintStatus, on_delete=models.PROTECT, related_name="complaints")
    reported_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    closure_comment = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(
        "tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_complaints"
    )

    plant = models.ForeignKey("tenants.Plant", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    department = models.ForeignKey(
        "tenants.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    @staticmethod
    def assigned_q(membership) -> Q:
        """'Assigned' scope (PROJECT_SPEC §5.2): the primary owner or any additional assignee."""
        return Q(owner_id=membership.id) | Q(
            id__in=ComplaintAssignee.objects.filter(membership_id=membership.id).values("complaint_id")
        )

    def is_assigned_to(self, membership) -> bool:
        return self.owner_id == membership.id or self.assignees.filter(membership_id=membership.id).exists()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "severity"]),
            models.Index(fields=["company", "due_date"]),
            models.Index(fields=["company", "reported_date"]),
            models.Index(fields=["company", "customer", "part_number", "batch_number"]),
        ]
        constraints = [models.UniqueConstraint(fields=["company", "number"], name="uniq_complaint_number")]

    def __str__(self):
        return f"{self.number} {self.title}"


class ComplaintAssignee(models.Model):
    """Additional assignees; the primary owner stays on Complaint.owner."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="assignees")
    membership = models.ForeignKey("tenants.Membership", on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["complaint", "membership"], name="uniq_complaint_assignee")]
