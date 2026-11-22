"""All tenant-scoped routes. Mounted at /api/v1/c/{company_slug}/."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.complaints.views import ComplaintViewSet, DashboardView
from apps.customers.views import CustomerViewSet
from apps.employees.views import EmployeeViewSet
from apps.rbac.views import PermissionCatalogView, RoleViewSet
from apps.tenants.org import DepartmentViewSet, PlantViewSet

router = DefaultRouter()
router.include_root_view = False
router.register("customers", CustomerViewSet, basename="customer")
router.register("complaints", ComplaintViewSet, basename="complaint")
router.register("plants", PlantViewSet, basename="plant")
router.register("departments", DepartmentViewSet, basename="department")
router.register("roles", RoleViewSet, basename="role")
router.register("employees", EmployeeViewSet, basename="employee")

urlpatterns = [
    path("permissions/", PermissionCatalogView.as_view(), name="permission-catalog"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
