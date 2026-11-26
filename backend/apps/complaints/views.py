import csv

from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers as drf_serializers
from rest_framework import status as http, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from apps.core.mixins import TenantViewMixin
from apps.core.utils import company_now
from apps.customers.models import Customer
from apps.rbac.permissions import ANY_MEMBER, HasCompanyPermission

from . import selectors, services
from .exports import build_xlsx
from .filters import ComplaintFilter
from .models import Complaint, ComplaintStatus, DefectCategory
from .serializers import (
    AssignSerializer, ChangeStatusSerializer, ComplaintSerializer, ComplaintStatusSerializer,
    DefectCategorySerializer,
)

EXPORT_COLUMNS = [
    ("Number", lambda c: c.number), ("Title", lambda c: c.title), ("Customer", lambda c: c.customer.name),
    ("Customer reference", lambda c: c.customer_reference_number), ("Status", lambda c: c.status.name),
    ("Severity", lambda c: c.severity), ("Defect category", lambda c: c.defect_category.name if c.defect_category_id else ""),
    ("Product", lambda c: c.product_name), ("Part number", lambda c: c.part_number),
    ("Batch / lot", lambda c: c.batch_number), ("Quantity affected", lambda c: c.quantity_affected),
    ("Source", lambda c: c.source), ("Reported date", lambda c: c.reported_date), ("Due date", lambda c: c.due_date),
    ("Owner", lambda c: c.owner.display_name if c.owner_id else ""),
    ("Created", lambda c: c.created_at.isoformat()), ("Closed", lambda c: c.closed_at.isoformat() if c.closed_at else ""),
]


def _csv_safe(value) -> str:
    """Neutralise spreadsheet formula injection (a cell starting with = + - @ is executed by Excel)."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _xlsx_cell(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else _csv_safe(value)


class _Echo:
    def write(self, value):
        return value


class ComplaintViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = Complaint
    permission_map = {
        "list": "complaints.view", "retrieve": "complaints.view", "create": "complaints.create",
        "update": "complaints.update", "partial_update": "complaints.update", "destroy": "complaints.delete",
        "assign": "complaints.assign", "change_status": "complaints.update", "duplicates": "complaints.create",
        "export": "complaints.view",
    }
    serializer_class = ComplaintSerializer
    filterset_class = ComplaintFilter
    search_fields = ["number", "title", "product_name", "part_number", "batch_number",
                     "customer_reference_number", "customer__name"]
    ordering_fields = ["created_at", "due_date", "reported_date", "severity", "number", "status__sort_order"]

    def get_queryset(self):
        return super().get_queryset().select_related(
            "customer", "owner__user", "status", "defect_category"
        ).prefetch_related("assignees__membership__user")

    def _actor(self):
        return {"user": self.request.user, "membership": self.request.membership}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        data = dict(serializer.data)
        duplicates = services.find_possible_duplicates(
            request.company, customer=serializer.instance.customer, part_number=serializer.instance.part_number,
            batch_number=serializer.instance.batch_number, exclude_id=serializer.instance.id,
        )
        data["warnings"] = [{
            "code": "possible_duplicate",
            "message": "An open complaint exists for the same customer, part number and batch.",
            "complaints": [{"id": d.id, "number": d.number, "title": d.title} for d in duplicates],
        }] if duplicates else []
        return Response(data, status=http.HTTP_201_CREATED)

    def perform_create(self, serializer):
        serializer.instance = services.create_complaint(
            company=self.request.company, data=serializer.validated_data, **self._actor()
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_complaint(
            serializer.instance, serializer.validated_data, **self._actor()
        )
        self._saved = serializer.instance

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        response.data = {**response.data, "warnings": getattr(self._saved, "_closure_warnings", [])}
        return response

    def perform_destroy(self, instance):
        services.delete_complaint(instance, user=self.request.user)

    @extend_schema(request=AssignSerializer, responses=ComplaintSerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None, **kwargs):
        """Set the primary owner and/or the additional assignees."""
        complaint = self.get_object()
        s = AssignSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        d = s.validated_data
        services.assign_complaint(
            complaint,
            owner=d["owner"] if "owner" in d else services.UNSET,
            assignees=d["assignees"] if "assignees" in d else services.UNSET,
            **self._actor(),
        )
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(request=ChangeStatusSerializer, responses=ComplaintSerializer)
    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None, **kwargs):
        """Move to another status. Resolving/closing/reopening needs complaints.close; closing needs a comment."""
        complaint = self.get_object()
        s = ChangeStatusSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        services.change_status(
            complaint, s.validated_data["status"], closure_comment=s.validated_data.get("closure_comment"),
            **self._actor(),
        )
        data = dict(self.get_serializer(self.get_object()).data)
        data["warnings"] = getattr(complaint, "_closure_warnings", [])
        return Response(data)

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def duplicates(self, request, **kwargs):
        """Open complaints with the same customer + part number + batch (call before submitting the form)."""
        customer = Customer.objects.for_company(request.company).filter(pk=request.query_params.get("customer")).first() \
            if _is_uuid(request.query_params.get("customer")) else None
        if customer is None:
            return Response({"results": []})
        found = services.find_possible_duplicates(
            request.company, customer=customer, part_number=request.query_params.get("part_number", ""),
            batch_number=request.query_params.get("batch_number", ""),
            exclude_id=request.query_params.get("exclude") if _is_uuid(request.query_params.get("exclude")) else None,
        )
        return Response({"results": [{"id": d.id, "number": d.number, "title": d.title} for d in found]})

    @extend_schema(
        parameters=[OpenApiParameter("export_format", str, enum=["csv", "xlsx"], description="Default csv.")],
        responses={(200, "text/csv"): bytes},
    )
    @action(detail=False, methods=["get"])
    def export(self, request, **kwargs):
        """CSV or XLSX (`?export_format=xlsx`) of the current filtered/searched/sorted list, limited to records the
        caller may see."""
        fmt = request.query_params.get("export_format", "csv")
        if fmt not in ("csv", "xlsx"):
            raise ValidationError({"export_format": "Use csv or xlsx."})
        qs = self.filter_queryset(self.get_queryset())
        count = qs.count()
        if fmt == "xlsx" and count > settings.EXPORT_XLSX_MAX_ROWS:
            raise ValidationError({"export_format": f"Too many rows for XLSX ({count}); narrow the filters or use csv."})
        audit.log(company=request.company, user=request.user, action="complaints.exported", target_type="complaint",
                  label=f"{count} complaints",
                  changes={"count": count, "format": fmt,
                           "filters": {k: v for k, v in request.query_params.items()}})
        stamp = company_now(request.company).strftime("%Y%m%d-%H%M")
        if fmt == "xlsx":
            response = HttpResponse(
                build_xlsx([h for h, _ in EXPORT_COLUMNS], ([_xlsx_cell(fn(c)) for _, fn in EXPORT_COLUMNS]
                                                              for c in qs.iterator(chunk_size=500))),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="complaints-{stamp}.xlsx"'
            return response
        writer = csv.writer(_Echo())

        def rows():
            yield "﻿" + writer.writerow([h for h, _ in EXPORT_COLUMNS])
            for c in qs.iterator(chunk_size=500):
                yield writer.writerow([_csv_safe(fn(c)) for _, fn in EXPORT_COLUMNS])

        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="complaints-{stamp}.csv"'
        return response


def _is_uuid(value) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


class DashboardParams(drf_serializers.Serializer):
    date_from = drf_serializers.DateField(required=False)
    date_to = drf_serializers.DateField(required=False)


class DashboardView(APIView):
    permission_classes = [HasCompanyPermission]
    required_permission = "complaints.view"

    @extend_schema(parameters=[DashboardParams], responses={200: dict})
    def get(self, request, company_slug):
        p = DashboardParams(data=request.query_params)
        p.is_valid(raise_exception=True)
        return Response(selectors.dashboard_stats(
            request.company, request.membership, p.validated_data.get("date_from"), p.validated_data.get("date_to")
        ))


class ComplaintStatusViewSet(TenantViewMixin, viewsets.ModelViewSet):
    """Company workflow statuses. Everyone may read (dropdowns); changing needs settings.manage."""

    model = ComplaintStatus
    apply_scope = False
    permission_map = {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER, "create": "settings.manage", "update": "settings.manage",
        "partial_update": "settings.manage", "destroy": "settings.manage",
    }
    serializer_class = ComplaintStatusSerializer
    pagination_class = None
    filterset_fields = ["category", "is_active"]
    ordering_fields = ["sort_order", "name"]

    def get_queryset(self):
        return super().get_queryset().prefetch_related("transitions_out")

    def perform_create(self, serializer):
        serializer.instance = services.create_status(
            company=self.request.company, user=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_status(
            serializer.instance, serializer.validated_data, user=self.request.user
        )

    def perform_destroy(self, instance):
        services.delete_status(instance, user=self.request.user)


class DefectCategoryViewSet(TenantViewMixin, viewsets.ModelViewSet):
    model = DefectCategory
    apply_scope = False
    permission_map = {
        "list": ANY_MEMBER, "retrieve": ANY_MEMBER, "create": "settings.manage", "update": "settings.manage",
        "partial_update": "settings.manage", "destroy": "settings.manage",
    }
    serializer_class = DefectCategorySerializer
    pagination_class = None
    filterset_fields = ["is_active"]

    def perform_create(self, serializer):
        serializer.instance = services.save_defect_category(
            company=self.request.company, user=self.request.user, data=serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.save_defect_category(
            company=self.request.company, user=self.request.user, data=serializer.validated_data,
            instance=serializer.instance,
        )

    def perform_destroy(self, instance):
        services.delete_defect_category(instance)
