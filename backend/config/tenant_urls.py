"""All tenant-scoped routes. Mounted at /api/v1/c/{company_slug}/."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.attachments.views import AttachmentViewSet
from apps.audit.views import AuditLogViewSet, TargetActivityViewSet
from apps.comments.views import CommentViewSet
from apps.complaints.views import (
    ComplaintStatusViewSet, ComplaintViewSet, DashboardView, DefectCategoryViewSet,
)
from apps.custom_fields.views import CustomFieldViewSet
from apps.customers.views import CustomerViewSet
from apps.eight_d_reports.models import ROW_MODELS
from apps.eight_d_reports.views import EightDReportViewSet, make_row_viewset
from apps.employees.views import EmployeeViewSet
from apps.rbac.views import PermissionCatalogView, RoleViewSet
from apps.tasks.views import TaskViewSet
from apps.tenants.org import DepartmentViewSet, PlantViewSet

router = DefaultRouter()
router.include_root_view = False
router.register("customers", CustomerViewSet, basename="customer")
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("complaint-statuses", ComplaintStatusViewSet, basename="complaint-status")
router.register("defect-categories", DefectCategoryViewSet, basename="defect-category")
router.register("comments", CommentViewSet, basename="comment")
router.register("attachments", AttachmentViewSet, basename="attachment")
router.register("activity", TargetActivityViewSet, basename="activity")
router.register("audit-log", AuditLogViewSet, basename="audit-log")
router.register("eight-d-reports", EightDReportViewSet, basename="eight-d-report")
for _key in ROW_MODELS:
    router.register(f"eight-d-{_key}", make_row_viewset(_key), basename=f"eight-d-{_key}")
router.register("custom-fields", CustomFieldViewSet, basename="custom-field")
router.register("tasks", TaskViewSet, basename="task")
router.register("plants", PlantViewSet, basename="plant")
router.register("departments", DepartmentViewSet, basename="department")
router.register("roles", RoleViewSet, basename="role")
router.register("employees", EmployeeViewSet, basename="employee")

urlpatterns = [
    path("permissions/", PermissionCatalogView.as_view(), name="permission-catalog"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
