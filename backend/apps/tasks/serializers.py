from rest_framework import serializers

from apps.complaints.models import Complaint
from apps.core.mixins import CompanyScopedPrimaryKeyField
from apps.core.utils import company_today
from apps.eight_d_reports.models import EightDReport
from apps.tenants.models import Membership

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    assignee = CompanyScopedPrimaryKeyField(
        queryset=Membership.objects.filter(status="active"), required=False, allow_null=True
    )
    complaint = CompanyScopedPrimaryKeyField(
        queryset=Complaint.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    eight_d_report = CompanyScopedPrimaryKeyField(
        queryset=EightDReport.objects.filter(deleted_at__isnull=True), required=False, allow_null=True
    )
    eight_d_section = serializers.CharField(required=False, allow_blank=True, max_length=2)
    assignee_name = serializers.SerializerMethodField()
    complaint_number = serializers.CharField(source="complaint.number", read_only=True, default=None)
    report_number = serializers.CharField(source="eight_d_report.number", read_only=True, default=None)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "task_type", "status", "priority", "due_date", "completed_at",
            "completion_notes", "complaint", "complaint_number", "eight_d_report", "report_number", "eight_d_section",
            "source_type", "source_id", "assignee", "assignee_name", "department", "is_overdue",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "completed_at", "completion_notes", "source_type", "source_id",
                            "department", "created_at", "updated_at"]

    def get_assignee_name(self, obj) -> str | None:
        return obj.assignee.display_name if obj.assignee_id else None

    def get_is_overdue(self, obj) -> bool:
        company = self.context["request"].company
        return bool(obj.due_date and obj.due_date < company_today(company) and not obj.is_finished)


class TaskStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Task.Status.choices)
    completion_notes = serializers.CharField(required=False, allow_blank=True)
