import uuid

from django.db import models
from django.db.models import Q

from apps.core.models import TenantModel

SECTION_CODES = [f"D{i}" for i in range(9)]


class EightDReport(TenantModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        IN_PROGRESS = "in_progress", "In Progress"
        PENDING_APPROVAL = "pending_approval", "Pending Approval"
        APPROVED = "approved", "Approved"
        SUBMITTED = "submitted", "Submitted"
        CLOSED = "closed", "Closed"

    EDITABLE = ("draft", "in_progress")  # pending_approval is read-only so the approver reviews a stable document
    LOCKED = ("pending_approval", "approved", "submitted", "closed")

    number = models.CharField(max_length=20)
    complaint = models.ForeignKey("complaints.Complaint", on_delete=models.PROTECT, related_name="eight_d_reports")
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    revision = models.PositiveIntegerField(default=1)
    template_key = models.CharField(max_length=40, default="standard")
    team_leader = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    approver = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    plant = models.ForeignKey("tenants.Plant", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    department = models.ForeignKey("tenants.Department", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    opened_date = models.DateField(null=True, blank=True)
    target_close_date = models.DateField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)  # optimistic locking for header edits

    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_method = models.CharField(max_length=60, blank=True)
    submitted_to = models.CharField(max_length=255, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    reopen_reason = models.TextField(blank=True)
    custom_data = models.JSONField(default=dict, blank=True)  # company-defined report-level fields (custom_fields app)
    custom_schema = models.JSONField(default=dict, blank=True)  # their definitions as of the last save

    @property
    def is_editable(self) -> bool:
        return self.status in self.EDITABLE

    @property
    def is_locked(self) -> bool:
        return not self.is_editable

    @staticmethod
    def assigned_q(membership) -> Q:
        """'Assigned' (PROJECT_SPEC §5.2): team leader, a D1 team member, or the owner of any section."""
        return (
            Q(team_leader_id=membership.id)
            | Q(id__in=D1TeamMember.objects.filter(membership_id=membership.id).values("report_id"))
            | Q(id__in=EightDSection.objects.filter(owner_id=membership.id).values("report_id"))
        )

    def is_assigned_to(self, membership) -> bool:
        return (
            self.team_leader_id == membership.id
            or self.team_members.filter(membership_id=membership.id).exists()
            or self.sections.filter(owner_id=membership.id).exists()
        )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "complaint"]),
            models.Index(fields=["company", "created_at"]),
        ]
        constraints = [models.UniqueConstraint(fields=["company", "number"], name="uniq_8d_number")]

    def __str__(self):
        return f"{self.number} {self.title}"


class ReportPart(TenantModel):
    """Base for everything that hangs off a report. Carries `report` and an optimistic-locking `version`."""

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE)
    version = models.PositiveIntegerField(default=1)
    custom_data = models.JSONField(default=dict, blank=True)  # reserved for Phase 4 custom fields

    SECTION = ""  # D0..D8

    @property
    def department_id(self):
        return self.report.department_id

    def is_assigned_to(self, membership) -> bool:
        return self.report.is_assigned_to(membership)

    class Meta:
        abstract = True


class EightDSection(ReportPart):
    """Per-section tracking: status, owner, completion. Report completion % derives from these rows."""

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETE = "complete", "Complete"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="sections")
    code = models.CharField(max_length=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NOT_STARTED)
    owner = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    custom_schema = models.JSONField(default=dict, blank=True)  # definitions of the section's custom fields as of the last save

    class Meta:
        ordering = ["code"]
        constraints = [models.UniqueConstraint(fields=["report", "code"], name="uniq_8d_section")]

    def __str__(self):
        return f"{self.report.number} {self.code}"


# --- singular sections (one row per report) ----------------------------------------------------

class D0Assessment(ReportPart):
    SECTION = "D0"
    report = models.OneToOneField(EightDReport, on_delete=models.CASCADE, related_name="d0")
    formal_8d_required = models.BooleanField(default=True)
    rationale = models.TextField(blank=True)
    emergency_response_needed = models.BooleanField(default=False)
    emergency_actions = models.TextField(blank=True)
    planned_resources = models.TextField(blank=True)
    notes = models.TextField(blank=True)


class D2ProblemDescription(ReportPart):
    SECTION = "D2"
    report = models.OneToOneField(EightDReport, on_delete=models.CASCADE, related_name="d2")
    problem_statement = models.TextField(blank=True)
    what = models.TextField(blank=True)
    where = models.TextField(blank=True)
    when = models.TextField(blank=True)
    who_detected = models.CharField(max_length=200, blank=True)
    how_detected = models.TextField(blank=True)
    how_many = models.TextField(blank=True)
    is_not_analysis = models.TextField(blank=True)  # what the problem is / is not
    part_number = models.CharField(max_length=100, blank=True)
    batch_number = models.CharField(max_length=100, blank=True)
    product_name = models.CharField(max_length=200, blank=True)
    quantity_affected = models.PositiveIntegerField(null=True, blank=True)
    detected_date = models.DateField(null=True, blank=True)


class D4RootCauseAnalysis(ReportPart):
    SECTION = "D4"
    report = models.OneToOneField(EightDReport, on_delete=models.CASCADE, related_name="d4")
    root_cause = models.TextField(blank=True)
    occurrence_cause = models.TextField(blank=True)
    escape_cause = models.TextField(blank=True)
    method_used = models.CharField(max_length=120, blank=True)
    verification_notes = models.TextField(blank=True)
    root_cause_verified = models.BooleanField(default=False)


class D8Closure(ReportPart):
    SECTION = "D8"
    report = models.OneToOneField(EightDReport, on_delete=models.CASCADE, related_name="d8")
    closure_summary = models.TextField(blank=True)
    team_recognition = models.TextField(blank=True)
    lessons_learned = models.TextField(blank=True)
    customer_confirmation = models.BooleanField(default=False)
    confirmation_date = models.DateField(null=True, blank=True)
    confirmation_notes = models.TextField(blank=True)


# --- list sections (many rows per report) ------------------------------------------------------

class _Row(ReportPart):
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ["sort_order", "created_at"]


class D1TeamMember(_Row):
    SECTION = "D1"
    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="team_members")
    membership = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    name = models.CharField(max_length=200)  # free text for non-users (customer / supplier contacts)
    role = models.CharField(max_length=80, blank=True)  # leader, champion, member, sponsor, ...
    department_name = models.CharField(max_length=120, blank=True)
    responsibilities = models.TextField(blank=True)
    is_leader = models.BooleanField(default=False)


class D3ContainmentAction(_Row):
    SECTION = "D3"
    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="containment_actions")
    description = models.TextField()
    scope = models.CharField(max_length=200, blank=True)  # e.g. suspect stock, WIP, customer site
    responsible = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    due_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    quantity_checked = models.PositiveIntegerField(null=True, blank=True)
    quantity_defective = models.PositiveIntegerField(null=True, blank=True)
    effectiveness_verified = models.BooleanField(default=False)
    verification_notes = models.TextField(blank=True)


class D4WhyStep(_Row):
    SECTION = "D4"

    class Chain(models.TextChoices):
        OCCURRENCE = "occurrence", "Why did it occur"
        ESCAPE = "escape", "Why was it not detected"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="why_steps")
    chain = models.CharField(max_length=20, choices=Chain.choices, default=Chain.OCCURRENCE)
    question = models.TextField(blank=True)
    answer = models.TextField()


class D4FishboneCause(_Row):
    SECTION = "D4"

    class Category(models.TextChoices):
        MAN = "man", "Man"
        MACHINE = "machine", "Machine"
        METHOD = "method", "Method"
        MATERIAL = "material", "Material"
        MEASUREMENT = "measurement", "Measurement"
        ENVIRONMENT = "environment", "Environment"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="fishbone_causes")
    category = models.CharField(max_length=20, choices=Category.choices)
    cause = models.TextField()
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    is_root_cause = models.BooleanField(default=False)


class D5CorrectiveAction(_Row):
    SECTION = "D5"

    class Kind(models.TextChoices):
        OCCURRENCE = "occurrence", "Eliminates the cause"
        ESCAPE = "escape", "Improves detection"

    class Decision(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        SELECTED = "selected", "Selected"
        REJECTED = "rejected", "Rejected"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="corrective_actions")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OCCURRENCE)
    description = models.TextField()
    decision = models.CharField(max_length=20, choices=Decision.choices, default=Decision.PROPOSED)
    rationale = models.TextField(blank=True)
    responsible = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    due_date = models.DateField(null=True, blank=True)
    expected_effectiveness = models.TextField(blank=True)


class D6Validation(_Row):
    SECTION = "D6"
    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="validations")
    corrective_action = models.ForeignKey(D5CorrectiveAction, null=True, blank=True, on_delete=models.SET_NULL, related_name="validations")
    description = models.TextField()
    responsible = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    implemented_date = models.DateField(null=True, blank=True)
    validation_method = models.TextField(blank=True)
    results = models.TextField(blank=True)
    validated_date = models.DateField(null=True, blank=True)
    is_effective = models.BooleanField(null=True, blank=True)  # null = not yet assessed


class D7PreventiveAction(_Row):
    SECTION = "D7"

    class ActionType(models.TextChoices):
        FMEA = "fmea", "FMEA updated"
        CONTROL_PLAN = "control_plan", "Control plan updated"
        PROCEDURE = "procedure", "Procedure / work instruction"
        TRAINING = "training", "Training"
        HORIZONTAL = "horizontal", "Horizontal deployment (similar products/lines)"
        OTHER = "other", "Other"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="preventive_actions")
    action_type = models.CharField(max_length=20, choices=ActionType.choices, default=ActionType.OTHER)
    description = models.TextField()
    responsible = models.ForeignKey("tenants.Membership", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    due_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    document_reference = models.CharField(max_length=200, blank=True)


# --- approval, revisions -----------------------------------------------------------------------

class ReportApproval(TenantModel):
    """One decision on one revision. Single level now; `level` leaves room for approval chains."""

    class Decision(models.TextChoices):
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="approvals")
    revision = models.PositiveIntegerField()
    level = models.PositiveIntegerField(default=1)
    approver = models.ForeignKey("tenants.Membership", null=True, on_delete=models.SET_NULL, related_name="+")
    approver_name = models.CharField(max_length=200)
    decision = models.CharField(max_length=20, choices=Decision.choices)
    comment = models.TextField(blank=True)
    signed_name = models.CharField(max_length=200, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]


class ReportRevision(models.Model):
    """Immutable JSON snapshot taken when a report is approved or submitted. PDFs render from this."""

    class Kind(models.TextChoices):
        APPROVED = "approved", "Approved"
        SUBMITTED = "submitted", "Submitted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="+")
    report = models.ForeignKey(EightDReport, on_delete=models.CASCADE, related_name="revisions")
    revision = models.PositiveIntegerField()
    kind = models.CharField(max_length=20, choices=Kind.choices)
    snapshot = models.JSONField()
    created_by = models.ForeignKey("accounts.User", null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["revision", "created_at"]
        indexes = [models.Index(fields=["company", "report", "revision"])]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RuntimeError("Report revisions are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Report revisions are immutable.")


# Child-row models by section, in display order. Used by services, serializers, snapshots.
SINGLETONS = {"d0": D0Assessment, "d2": D2ProblemDescription, "d4": D4RootCauseAnalysis, "d8": D8Closure}
ROW_MODELS = {
    "team-members": D1TeamMember,
    "containment-actions": D3ContainmentAction,
    "why-steps": D4WhyStep,
    "fishbone-causes": D4FishboneCause,
    "corrective-actions": D5CorrectiveAction,
    "validations": D6Validation,
    "preventive-actions": D7PreventiveAction,
}
