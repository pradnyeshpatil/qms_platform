from rest_framework import serializers

from apps.complaints.models import Complaint
from apps.core.mixins import CompanyScopedPrimaryKeyField
from apps.tenants.models import Department, Membership, Plant

from . import services
from .models import (
    D0Assessment, D1TeamMember, D2ProblemDescription, D3ContainmentAction, D4FishboneCause, D4RootCauseAnalysis,
    D4WhyStep, D5CorrectiveAction, D6Validation, D7PreventiveAction, D8Closure, EightDReport, EightDSection,
    ReportApproval, ReportRevision,
)

_MEMBERS = Membership.objects.filter(status="active")


def _member_field(**kw):
    return CompanyScopedPrimaryKeyField(queryset=_MEMBERS, required=False, allow_null=True, **kw)


class _Versioned(serializers.ModelSerializer):
    """`version` is read-only in responses; clients echo it back on update (checked in the service)."""

    version = serializers.IntegerField(read_only=True)


# --- report ------------------------------------------------------------------------------------

class SectionSerializer(_Versioned):
    owner = _member_field()
    owner_name = serializers.CharField(source="owner.display_name", read_only=True, default=None)

    class Meta:
        model = EightDSection
        fields = ["id", "code", "status", "owner", "owner_name", "completed_at", "version", "custom_data", "custom_schema"]
        read_only_fields = fields


class ApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportApproval
        fields = ["id", "revision", "level", "approver_name", "decision", "comment", "signed_name", "created_at"]
        read_only_fields = fields


class ReportListSerializer(serializers.ModelSerializer):
    complaint = CompanyScopedPrimaryKeyField(queryset=Complaint.objects.filter(deleted_at__isnull=True))
    complaint_number = serializers.CharField(source="complaint.number", read_only=True)
    customer_name = serializers.CharField(source="complaint.customer.name", read_only=True)
    team_leader = _member_field()
    approver = _member_field()
    plant = CompanyScopedPrimaryKeyField(queryset=Plant.objects.filter(deleted_at__isnull=True, is_active=True),
                                         required=False, allow_null=True)
    department = CompanyScopedPrimaryKeyField(
        queryset=Department.objects.filter(deleted_at__isnull=True, is_active=True), required=False, allow_null=True)
    team_leader_name = serializers.CharField(source="team_leader.display_name", read_only=True, default=None)
    approver_name = serializers.CharField(source="approver.display_name", read_only=True, default=None)
    is_locked = serializers.BooleanField(read_only=True)
    completion = serializers.SerializerMethodField()
    version = serializers.IntegerField(read_only=True)
    custom_data = serializers.JSONField(required=False)
    custom_schema = serializers.JSONField(read_only=True)

    class Meta:
        model = EightDReport
        fields = [
            "id", "number", "complaint", "complaint_number", "customer_name", "title", "status", "revision",
            "template_key", "team_leader", "team_leader_name", "approver", "approver_name", "plant", "department",
            "opened_date", "target_close_date", "submitted_at", "submitted_method", "submitted_to", "closed_at",
            "reopen_reason", "is_locked", "completion", "custom_data", "custom_schema", "version", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "status", "revision", "submitted_at", "submitted_method", "submitted_to",
                            "closed_at", "reopen_reason", "created_at", "updated_at"]
        extra_kwargs = {"title": {"required": False}}  # defaults to the complaint title

    def get_completion(self, obj) -> dict:
        return services.completion(obj)


# --- sections ----------------------------------------------------------------------------------

def _meta(model, extra=()):
    base = ["id", "version", "created_at", "updated_at"]

    class Meta:
        fields = [*base, *extra]
        read_only_fields = ["id", "created_at", "updated_at"]

    Meta.model = model
    return Meta


class D0Serializer(_Versioned):
    class Meta(_meta(D0Assessment, ["formal_8d_required", "rationale", "emergency_response_needed",
                                    "emergency_actions", "planned_resources", "notes"])):
        pass


class D2Serializer(_Versioned):
    class Meta(_meta(D2ProblemDescription, [
        "problem_statement", "what", "where", "when", "who_detected", "how_detected", "how_many", "is_not_analysis",
        "part_number", "batch_number", "product_name", "quantity_affected", "detected_date"])):
        pass


class D4Serializer(_Versioned):
    class Meta(_meta(D4RootCauseAnalysis, [
        "root_cause", "occurrence_cause", "escape_cause", "method_used", "verification_notes",
        "root_cause_verified"])):
        pass


class D8Serializer(_Versioned):
    class Meta(_meta(D8Closure, ["closure_summary", "team_recognition", "lessons_learned", "customer_confirmation",
                                 "confirmation_date", "confirmation_notes"])):
        pass


class _RowSerializer(_Versioned):
    """Rows carry `report` (write-once, set on create) and `sort_order`."""

    report = CompanyScopedPrimaryKeyField(queryset=EightDReport.objects.filter(deleted_at__isnull=True))

    def validate_report(self, value):
        if self.instance is not None and value.pk != self.instance.report_id:
            raise serializers.ValidationError("A row cannot be moved to another report.")
        return value


class TeamMemberSerializer(_RowSerializer):
    membership = _member_field()

    class Meta(_meta(D1TeamMember, ["report", "membership", "name", "role", "department_name", "responsibilities",
                                    "is_leader", "sort_order"])):
        pass

    def validate(self, attrs):
        member = attrs.get("membership")
        if member is not None and not attrs.get("name"):
            attrs["name"] = member.display_name
        if not (attrs.get("name") or (self.instance and self.instance.name)):
            raise serializers.ValidationError({"name": "Name the team member or pick an employee."})
        return attrs


class ContainmentSerializer(_RowSerializer):
    responsible = _member_field()
    task = serializers.SerializerMethodField()

    class Meta(_meta(D3ContainmentAction, [
        "report", "description", "scope", "responsible", "due_date", "completed_date", "quantity_checked",
        "quantity_defective", "effectiveness_verified", "verification_notes", "sort_order", "task"])):
        pass

    def get_task(self, obj) -> dict | None:
        return _task_info(self, obj, "containment-actions")


class WhyStepSerializer(_RowSerializer):
    class Meta(_meta(D4WhyStep, ["report", "chain", "question", "answer", "sort_order"])):
        pass


class FishboneSerializer(_RowSerializer):
    parent = CompanyScopedPrimaryKeyField(queryset=D4FishboneCause.objects.filter(deleted_at__isnull=True),
                                          required=False, allow_null=True)

    class Meta(_meta(D4FishboneCause, ["report", "category", "cause", "parent", "is_root_cause", "sort_order"])):
        pass

    def validate(self, attrs):
        parent = attrs.get("parent")
        report = attrs.get("report") or (self.instance.report if self.instance else None)
        if parent is not None:
            if report is not None and parent.report_id != report.pk:
                raise serializers.ValidationError({"parent": "The parent cause is on a different report."})
            if self.instance is not None and parent.pk == self.instance.pk:
                raise serializers.ValidationError({"parent": "A cause cannot be its own parent."})
        return attrs


class CorrectiveActionSerializer(_RowSerializer):
    responsible = _member_field()
    task = serializers.SerializerMethodField()

    class Meta(_meta(D5CorrectiveAction, [
        "report", "kind", "description", "decision", "rationale", "responsible", "due_date",
        "expected_effectiveness", "sort_order", "task"])):
        pass

    def get_task(self, obj) -> dict | None:
        return _task_info(self, obj, "corrective-actions")


class ValidationSerializer(_RowSerializer):
    responsible = _member_field()
    corrective_action = CompanyScopedPrimaryKeyField(
        queryset=D5CorrectiveAction.objects.filter(deleted_at__isnull=True), required=False, allow_null=True)
    task = serializers.SerializerMethodField()

    class Meta(_meta(D6Validation, [
        "report", "corrective_action", "description", "responsible", "implemented_date", "validation_method",
        "results", "validated_date", "is_effective", "sort_order", "task"])):
        pass

    def get_task(self, obj) -> dict | None:
        return _task_info(self, obj, "validations")

    def validate(self, attrs):
        action = attrs.get("corrective_action")
        report = attrs.get("report") or (self.instance.report if self.instance else None)
        if action is not None and report is not None and action.report_id != report.pk:
            raise serializers.ValidationError({"corrective_action": "That action is on a different report."})
        return attrs


class PreventiveSerializer(_RowSerializer):
    responsible = _member_field()
    task = serializers.SerializerMethodField()

    class Meta(_meta(D7PreventiveAction, [
        "report", "action_type", "description", "responsible", "due_date", "completed_date", "document_reference",
        "sort_order", "task"])):
        pass

    def get_task(self, obj) -> dict | None:
        return _task_info(self, obj, "preventive-actions")


def _task_info(serializer, obj, key) -> dict | None:
    """{id, status} of the task generated from this row (looked up once per request)."""
    cache = serializer.context.setdefault("_task_cache", {})
    if key not in cache:
        from apps.tasks.models import Task

        request = serializer.context["request"]
        cache[key] = {
            t.source_id: {"id": t.id, "status": t.status}
            for t in Task.objects.for_company(request.company).filter(source_type=services.source_type_for(key))
            .exclude(status="cancelled")
        }
    return cache[key].get(obj.id)


ROW_SERIALIZERS = {
    "team-members": TeamMemberSerializer, "containment-actions": ContainmentSerializer,
    "why-steps": WhyStepSerializer, "fishbone-causes": FishboneSerializer,
    "corrective-actions": CorrectiveActionSerializer, "validations": ValidationSerializer,
    "preventive-actions": PreventiveSerializer,
}
SINGLETON_SERIALIZERS = {"d0": D0Serializer, "d2": D2Serializer, "d4": D4Serializer, "d8": D8Serializer}


class ReportDetailSerializer(ReportListSerializer):
    """Header plus every section, in one payload (a report is small)."""

    sections = SectionSerializer(many=True, read_only=True)
    d0 = D0Serializer(read_only=True)
    d2 = D2Serializer(read_only=True)
    d4 = D4Serializer(read_only=True)
    d8 = D8Serializer(read_only=True)
    team_members = TeamMemberSerializer(many=True, read_only=True)
    containment_actions = ContainmentSerializer(many=True, read_only=True)
    why_steps = WhyStepSerializer(many=True, read_only=True)
    fishbone_causes = FishboneSerializer(many=True, read_only=True)
    corrective_actions = CorrectiveActionSerializer(many=True, read_only=True)
    validations = ValidationSerializer(many=True, read_only=True)
    preventive_actions = PreventiveSerializer(many=True, read_only=True)
    approvals = ApprovalSerializer(many=True, read_only=True)

    class Meta(ReportListSerializer.Meta):
        fields = ReportListSerializer.Meta.fields + [
            "sections", "d0", "d2", "d4", "d8", "team_members", "containment_actions", "why_steps",
            "fishbone_causes", "corrective_actions", "validations", "preventive_actions", "approvals"]
        read_only_fields = ReportListSerializer.Meta.read_only_fields
        extra_kwargs = ReportListSerializer.Meta.extra_kwargs


class RevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportRevision
        fields = ["id", "revision", "kind", "created_at"]
        read_only_fields = fields


class RevisionDetailSerializer(RevisionSerializer):
    class Meta(RevisionSerializer.Meta):
        fields = RevisionSerializer.Meta.fields + ["snapshot"]
        read_only_fields = fields


# --- action payloads ---------------------------------------------------------------------------

class VersionedUpdateMixin(serializers.Serializer):
    version = serializers.IntegerField(required=False, help_text="The version you loaded; required on updates.")


class RequestApprovalSerializer(serializers.Serializer):
    approver = _member_field()


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    comment = serializers.CharField(required=False, allow_blank=True)
    signed_name = serializers.CharField(required=False, allow_blank=True)


class SubmitSerializer(serializers.Serializer):
    method = serializers.CharField(max_length=60)
    recipient = serializers.CharField(max_length=255)


class ReopenSerializer(serializers.Serializer):
    reason = serializers.CharField()


class SectionStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=EightDSection.Status.choices)
    version = serializers.IntegerField(required=False)


class SectionCustomSerializer(serializers.Serializer):
    custom_data = serializers.DictField()
    version = serializers.IntegerField(required=False)


class SectionOwnerSerializer(serializers.Serializer):
    owner = _member_field()
