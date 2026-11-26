from django.db import models

from apps.core.models import TenantModel


class Task(TenantModel):
    """A unit of follow-up work, optionally tied to a complaint, an 8D report and one of its sections (PROJECT_SPEC §11)."""

    class Status(models.TextChoices):
        TODO = "todo", "To Do"
        IN_PROGRESS = "in_progress", "In Progress"
        BLOCKED = "blocked", "Blocked"
        DONE = "done", "Done"
        CANCELLED = "cancelled", "Cancelled"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    class Type(models.TextChoices):
        ACTION = "action", "Action"
        CONTAINMENT = "containment", "Containment"
        CORRECTIVE = "corrective", "Corrective action"
        VALIDATION = "validation", "Validation"
        PREVENTIVE = "preventive", "Preventive action"
        INVESTIGATION = "investigation", "Investigation"
        OTHER = "other", "Other"

    FINISHED = ("done", "cancelled")

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    task_type = models.CharField(max_length=20, choices=Type.choices, default=Type.ACTION)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_notes = models.TextField(blank=True)

    complaint = models.ForeignKey("complaints.Complaint", null=True, blank=True, on_delete=models.PROTECT, related_name="tasks")
    eight_d_report = models.ForeignKey(
        "eight_d_reports.EightDReport", null=True, blank=True, on_delete=models.PROTECT, related_name="tasks"
    )
    eight_d_section = models.CharField(max_length=2, blank=True)  # D0..D8
    # The action row that produced this task (e.g. a D3 containment action). Generic: no FK, so apps stay decoupled.
    source_type = models.CharField(max_length=40, blank=True)
    source_id = models.UUIDField(null=True, blank=True)

    assignee = models.ForeignKey(
        "tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_tasks"
    )
    department = models.ForeignKey("tenants.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    @property
    def is_finished(self) -> bool:
        return self.status in self.FINISHED

    @staticmethod
    def assigned_q(membership):
        return models.Q(assignee_id=membership.id)

    def is_assigned_to(self, membership) -> bool:
        return self.assignee_id == membership.id

    class Meta:
        ordering = ["due_date", "-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "assignee", "status"]),
            models.Index(fields=["company", "due_date"]),
            models.Index(fields=["company", "complaint"]),
            models.Index(fields=["company", "eight_d_report"]),
            models.Index(fields=["company", "source_type", "source_id"]),
        ]

    def __str__(self):
        return self.title
