from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import catalog, services
from .models import Role
from .permissions import HasCompanyPermission
from .serializers import RoleSerializer


class RoleViewSet(viewsets.ModelViewSet):
    """Company roles. Reading needs users.view (role pickers); changing needs roles.manage."""

    permission_classes = [HasCompanyPermission]
    permission_map = {
        "list": "users.view", "retrieve": "users.view",
        "create": "roles.manage", "update": "roles.manage",
        "partial_update": "roles.manage", "destroy": "roles.manage",
    }
    serializer_class = RoleSerializer
    pagination_class = None
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Role.objects.none()
        return Role.objects.filter(company=self.request.company).order_by("-is_system", "name")

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        role = services.create_role(
            company=request.company, name=d["name"], description=d.get("description", ""),
            grants=d.get("grant_list", []),
        )
        return Response(self.get_serializer(role).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        role = self.get_object()
        s = self.get_serializer(role, data=request.data, partial=partial)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        role = services.update_role(
            role, name=d.get("name"), description=d.get("description"),
            grants=d.get("grant_list"), is_active=d.get("is_active"),
        )
        return Response(self.get_serializer(role).data)

    def perform_destroy(self, instance):
        services.delete_role(instance)


class PermissionCatalogView(APIView):
    permission_classes = [HasCompanyPermission]
    required_permission = "roles.manage"

    @extend_schema(responses={200: dict})
    def get(self, request, company_slug):
        return Response([
            {"code": code, "module": catalog.module_of(code), "description": desc,
             "scopable": catalog.is_scopable(code)}
            for code, desc in catalog.PERMISSIONS.items()
        ])
