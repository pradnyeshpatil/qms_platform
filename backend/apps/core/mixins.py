from rest_framework import serializers

from apps.rbac.authorization import scope_queryset
from apps.rbac.permissions import ANY_MEMBER, HasCompanyPermission, resolve_permission


class TenantViewMixin:
    """Tenant views: membership + RBAC check, and a company- and scope-restricted queryset.

    Subclasses declare `permission_map = {action: "module.permission"}` (fail closed otherwise).
    Set `apply_scope = False` for reference data that is not record-scoped (plants, departments).
    """

    permission_classes = [HasCompanyPermission]
    model = None  # TenantModel subclass
    apply_scope = True

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.model.objects.none()
        qs = self.model.objects.for_company(self.request.company)
        if not self.apply_scope:
            return qs
        permission = resolve_permission(self, self.request)
        if permission is None or permission == ANY_MEMBER:
            return qs
        return scope_queryset(self.request.membership, permission, qs)


class CompanyScopedPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    """FK field that only accepts objects belonging to the active company."""

    def get_queryset(self):
        return super().get_queryset().filter(company=self.context["request"].company)
