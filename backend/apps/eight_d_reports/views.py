from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import status as http, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.complaints.models import Complaint
from apps.core.mixins import TenantViewMixin
from apps.rbac.authorization import can, scope_queryset
from apps.rbac.permissions import HasCompanyPermission, resolve_permission
from apps.tasks.serializers import TaskSerializer

from . import services
from .models import ROW_MODELS, SINGLETONS, EightDReport, EightDSection
from .serializers import (
    ROW_SERIALIZERS, SINGLETON_SERIALIZERS, DecisionSerializer, ReopenSerializer, ReportDetailSerializer,
    ReportListSerializer, RequestApprovalSerializer, RevisionDetailSerializer, RevisionSerializer,
    SectionCustomSerializer, SectionOwnerSerializer, SectionSerializer, SectionStatusSerializer, SubmitSerializer,
)


def _version(request):
    """`version` from the request body as int, or None (the service answers 400 when it is required)."""
    raw = request.data.get("version") if hasattr(request.data, "get") else None
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        raise ValidationError({"version": "Must be a whole number."})


class EightDReportViewSet(TenantViewMixin, viewsets.ModelViewSet):
    """8D reports. One payload carries the header and every section; edits go to the section endpoints."""

    model = EightDReport
    permission_map = {
        "list": "eight_d_reports.view", "retrieve": "eight_d_reports.view", "create": "eight_d_reports.create",
        "update": "eight_d_reports.update", "partial_update": "eight_d_reports.update",
        "destroy": "eight_d_reports.update", "section_data": "eight_d_reports.view",
        "set_section_status": "eight_d_reports.update", "set_section_owner": "eight_d_reports.update", "set_section_custom": "eight_d_reports.update",
        "request_approval": "eight_d_reports.update", "decide": "eight_d_reports.approve",
        "submit": "eight_d_reports.update", "close": "eight_d_reports.update", "reopen": "eight_d_reports.reopen",
        "revisions": "eight_d_reports.view", "revision": "eight_d_reports.view",
    }
    filterset_fields = ["status", "complaint", "team_leader", "approver", "department", "plant"]
    search_fields = ["number", "title", "complaint__number", "complaint__title", "complaint__customer__name"]
    ordering_fields = ["created_at", "number", "status", "target_close_date"]

    def get_serializer_class(self):
        return ReportDetailSerializer if self.action == "retrieve" else ReportListSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related("complaint__customer", "team_leader__user", "approver__user")
        if self.action == "retrieve":
            qs = qs.select_related("d0", "d2", "d4", "d8").prefetch_related(
                "sections__owner__user", "team_members", "containment_actions", "why_steps", "fishbone_causes",
                "corrective_actions", "validations", "preventive_actions", "approvals")
        return qs

    def _actor(self):
        return {"user": self.request.user, "membership": self.request.membership}

    def _full(self, report):
        return ReportDetailSerializer(
            EightDReport.objects.filter(pk=report.pk).select_related(
                "complaint__customer", "team_leader__user", "approver__user", "d0", "d2", "d4", "d8"
            ).prefetch_related("sections__owner__user", "team_members", "containment_actions", "why_steps",
                               "fishbone_causes", "corrective_actions", "validations", "preventive_actions",
                               "approvals").get(),
            context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        complaint = s.validated_data.pop("complaint")
        visible = scope_queryset(request.membership, "complaints.view", Complaint.objects.for_company(request.company))
        if not visible.filter(pk=complaint.pk).exists():
            raise Http404
        report = services.create_report(company=request.company, complaint=complaint, data=s.validated_data,
                                        **self._actor())
        return Response(self._full(report), status=http.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        report = self.get_object()
        s = self.get_serializer(report, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        d = dict(s.validated_data)
        d.pop("complaint", None)  # a report never moves to another complaint
        services.update_header(report, d, version=_version(request), **self._actor())
        return Response(self._full(report))

    def perform_destroy(self, instance):
        services.delete_report(instance, user=self.request.user)

    # --- section data ---------------------------------------------------------------------------

    @extend_schema(request=None, responses=SectionSerializer(many=True))
    @action(detail=True, methods=["get", "patch"], url_path=r"data/(?P<key>d[0248])")
    def section_data(self, request, key=None, pk=None, **kwargs):
        """D0 / D2 / D4 / D8 content. PATCH needs `version` (409 if someone saved first)."""
        report = self.get_object()
        obj = SINGLETONS[key].objects.get(report=report)
        serializer_class = SINGLETON_SERIALIZERS[key]
        if request.method == "GET":
            return Response(serializer_class(obj).data)
        if not can(request.membership, "eight_d_reports.update", report):
            raise PermissionDenied("You do not have permission to edit 8D reports.")
        s = serializer_class(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        updated = services.update_singleton(report, key, s.validated_data, version=_version(request),
                                            user=request.user)
        return Response(serializer_class(updated).data)

    @extend_schema(request=SectionStatusSerializer, responses=SectionSerializer)
    @action(detail=True, methods=["post"], url_path=r"sections/(?P<code>D[0-8])/status")
    def set_section_status(self, request, code=None, pk=None, **kwargs):
        """Mark a section not_started / in_progress / complete (complete runs the section's minimum checks)."""
        report = self.get_object()
        s = SectionStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        section = services.set_section_status(report, code, s.validated_data["status"],
                                              version=s.validated_data.get("version"), **self._actor())
        return Response(SectionSerializer(section).data)

    @extend_schema(request=SectionCustomSerializer, responses=SectionSerializer)
    @action(detail=True, methods=["post"], url_path=r"sections/(?P<code>D[0-8])/custom")
    def set_section_custom(self, request, code=None, pk=None, **kwargs):
        """Set the company's extra fields for one section. Body: {custom_data: {key: value}, version}. null clears."""
        report = self.get_object()
        s = SectionCustomSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        section = services.update_section_custom(report, code, s.validated_data["custom_data"],
                                                 version=s.validated_data.get("version"), user=request.user)
        return Response(SectionSerializer(section).data)

    @extend_schema(request=SectionOwnerSerializer, responses=SectionSerializer)
    @action(detail=True, methods=["post"], url_path=r"sections/(?P<code>D[0-8])/owner")
    def set_section_owner(self, request, code=None, pk=None, **kwargs):
        report = self.get_object()
        s = SectionOwnerSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        section = services.set_section_owner(report, code, s.validated_data.get("owner"), user=request.user)
        return Response(SectionSerializer(section).data)

    # --- workflow -------------------------------------------------------------------------------

    @extend_schema(request=RequestApprovalSerializer, responses=ReportDetailSerializer)
    @action(detail=True, methods=["post"], url_path="request-approval")
    def request_approval(self, request, pk=None, **kwargs):
        report = self.get_object()
        s = RequestApprovalSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        services.request_approval(report, approver=s.validated_data.get("approver"), **self._actor())
        return Response(self._full(report))

    @extend_schema(request=DecisionSerializer, responses=ReportDetailSerializer)
    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None, **kwargs):
        """Approve (typed `signed_name` required) or reject (`comment` required). Approval writes a locked snapshot."""
        report = self.get_object()
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.decide_approval(report, **s.validated_data, **self._actor())
        return Response(self._full(report))

    @extend_schema(request=SubmitSerializer, responses=ReportDetailSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None, **kwargs):
        """Record that the approved report was sent to the customer."""
        report = self.get_object()
        s = SubmitSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.submit_report(report, **s.validated_data, **self._actor())
        return Response(self._full(report))

    @extend_schema(request=None, responses=ReportDetailSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None, **kwargs):
        report = self.get_object()
        services.close_report(report, **self._actor())
        return Response(self._full(report))

    @extend_schema(request=ReopenSerializer, responses=ReportDetailSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None, **kwargs):
        """Reopen an approved/submitted/closed report as the next revision (reason required)."""
        report = self.get_object()
        s = ReopenSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.reopen_report(report, reason=s.validated_data["reason"], **self._actor())
        return Response(self._full(report))

    @extend_schema(responses=RevisionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def revisions(self, request, pk=None, **kwargs):
        report = self.get_object()
        return Response(RevisionSerializer(report.revisions.all(), many=True).data)

    @extend_schema(responses=RevisionDetailSerializer)
    @action(detail=True, methods=["get"], url_path=r"revisions/(?P<revision_id>[0-9a-f-]{36})")
    def revision(self, request, revision_id=None, pk=None, **kwargs):
        """One immutable snapshot (what the PDF is rendered from)."""
        report = self.get_object()
        rev = report.revisions.filter(pk=revision_id).first()
        if rev is None:
            raise Http404
        return Response(RevisionDetailSerializer(rev).data)


def make_row_viewset(key: str):
    """List/create/update/delete for one kind of section row (team members, containment actions, ...)."""
    model, serializer_class = ROW_MODELS[key], ROW_SERIALIZERS[key]
    taskable = key in services.TASKABLE

    class RowViewSet(TenantViewMixin, viewsets.ModelViewSet):
        permission_map = {
            "list": "eight_d_reports.view", "retrieve": "eight_d_reports.view",
            "create": "eight_d_reports.update", "update": "eight_d_reports.update",
            "partial_update": "eight_d_reports.update", "destroy": "eight_d_reports.update",
            "create_task": "tasks.create",
        }
        apply_scope = False  # scoping follows the parent report
        filterset_fields = ["report"]
        ordering_fields = ["sort_order", "created_at"]
        http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

        def get_serializer_class(self):
            return serializer_class

        def _reports(self):
            permission = resolve_permission(self, self.request)
            return scope_queryset(self.request.membership, permission,
                                  EightDReport.objects.for_company(self.request.company))

        def get_queryset(self):
            if getattr(self, "swagger_fake_view", False):
                return model.objects.none()
            return model.objects.for_company(self.request.company).filter(report__in=self._reports()).select_related(
                "report")

        def _actor(self):
            return {"user": self.request.user, "membership": self.request.membership}

        def perform_create(self, serializer):
            data = dict(serializer.validated_data)
            report = data.pop("report")
            if not self._reports().filter(pk=report.pk).exists():
                raise Http404
            serializer.instance = services.add_row(report, key, data, user=self.request.user)

        def perform_update(self, serializer):
            data = dict(serializer.validated_data)
            data.pop("report", None)
            serializer.instance = services.update_row(serializer.instance, data, version=_version(self.request),
                                                      user=self.request.user)

        def perform_destroy(self, instance):
            services.delete_row(instance, user=self.request.user)

        if taskable:
            @extend_schema(request=None, responses=TaskSerializer)
            @action(detail=True, methods=["post"], url_path="create-task")
            def create_task(self, request, pk=None, **kwargs):
                """Turn this action row into a linked task (assignee/due date default from the row)."""
                row = self.get_object()
                task = services.create_task_for_row(row, key, **self._actor())
                return Response(TaskSerializer(task, context=self.get_serializer_context()).data,
                                status=http.HTTP_201_CREATED)

    RowViewSet.__name__ = RowViewSet.__qualname__ = f"{model.__name__}ViewSet"
    return RowViewSet
