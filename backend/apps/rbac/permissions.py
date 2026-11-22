from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import IsActiveCompanyMember

from .authorization import can

# Explicit marker for "any active member of the company may call this" (e.g. reference data).
ANY_MEMBER = "__any_member__"


def resolve_permission(view, request) -> str | None:
    """The permission a view declares for this request, or None (=> denied: fail closed).

    A view declares either `required_permission = "x.y"` or
    `permission_map = {action_or_method: "x.y" | ANY_MEMBER}`.
    """
    mapping = getattr(view, "permission_map", None)
    if mapping is not None:
        key = getattr(view, "action", None) or request.method.lower()
        return mapping.get(key)
    return getattr(view, "required_permission", None)


class HasCompanyPermission(IsActiveCompanyMember):
    """Active membership (404 otherwise) + the permission the view declares (403 otherwise)."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):  # anonymous: let DRF answer 401/403
            return False
        permission = resolve_permission(view, request)
        if permission is None:
            raise PermissionDenied("This endpoint declares no permission.")
        if permission == ANY_MEMBER:
            return True
        if not can(request.membership, permission):
            raise PermissionDenied("You do not have permission to perform this action.")
        return True
