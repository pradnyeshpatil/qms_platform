"""Central authorization (PROJECT_SPEC §5.2). Every permission decision goes through here.

Fail closed: no grant, inactive membership/role, or an unsupported scope on a model => denied.
"""
from django.core.exceptions import FieldDoesNotExist
from django.db.models import Q

from .catalog import ALL, ASSIGNED, DEPARTMENT
from .models import RolePermission


def get_grants(membership) -> dict[str, str]:
    """{permission_code: scope} for a membership. Cached on the instance (per request)."""
    cached = getattr(membership, "_grants", None)
    if cached is None:
        role = membership.role if membership.role_id else None
        if membership.status != "active" or role is None or not role.is_active:
            cached = {}
        else:
            cached = dict(
                RolePermission.objects.filter(role_id=role.id).values_list("permission__code", "scope")
            )
        membership._grants = cached
    return cached


def scope_for(membership, permission: str) -> str | None:
    return get_grants(membership).get(permission)


def can(membership, permission: str, obj=None) -> bool:
    """Does the membership hold `permission`? With `obj`, also honour department/assigned scope."""
    scope = scope_for(membership, permission)
    if scope is None:
        return False
    if obj is None or scope == ALL:
        return True
    if scope == DEPARTMENT:
        dept_id = getattr(obj, "department_id", None)
        return dept_id is not None and dept_id == membership.department_id
    if scope == ASSIGNED:
        hook = getattr(obj, "is_assigned_to", None)
        if hook is not None:
            return bool(hook(membership))
        return getattr(obj, "owner_id", None) == membership.id
    return False


def _has_field(model, name) -> bool:
    try:
        model._meta.get_field(name)
        return True
    except FieldDoesNotExist:
        return False


def scope_queryset(membership, permission: str, qs):
    """Restrict `qs` to the records the membership may touch under `permission`."""
    scope = scope_for(membership, permission)
    if scope is None:
        return qs.none()
    if scope == ALL:
        return qs
    model = qs.model
    if scope == DEPARTMENT:
        if membership.department_id is None or not _has_field(model, "department"):
            return qs.none()
        return qs.filter(department_id=membership.department_id)
    if scope == ASSIGNED:
        hook = getattr(model, "assigned_q", None)
        if hook is not None:
            return qs.filter(hook(membership))
        if _has_field(model, "owner"):
            return qs.filter(Q(owner_id=membership.id))
    return qs.none()
