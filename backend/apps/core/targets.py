"""Registry of things that comments / attachments / activity can attach to (PROJECT_SPEC §13).

(target_type, target_id) pairs have no DB foreign key, so every write goes through `resolve_target`,
which checks the type is registered, the object belongs to the active company, and the caller may see it.
"""
import uuid
from dataclasses import dataclass

from django.http import Http404
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.rbac.authorization import can, scope_for


@dataclass(frozen=True)
class TargetSpec:
    key: str
    model: type
    view_permission: str
    label_field: str = "id"


_REGISTRY: dict[str, TargetSpec] = {}


def register(key: str, model, view_permission: str, label_field: str = "id") -> None:
    _REGISTRY[key] = TargetSpec(key, model, view_permission, label_field)


def target_types() -> list[str]:
    return sorted(_REGISTRY)


def get_spec(key: str) -> TargetSpec:
    spec = _REGISTRY.get(key)
    if spec is None:
        raise ValidationError({"target_type": f"Unknown target type. Allowed: {', '.join(target_types())}."})
    return spec


def spec_for(obj) -> TargetSpec | None:
    return next((s for s in _REGISTRY.values() if isinstance(obj, s.model)), None)


def target_label(obj, spec: TargetSpec | None = None) -> str:
    spec = spec or spec_for(obj)
    return str(getattr(obj, spec.label_field, obj.pk)) if spec else str(obj.pk)


def resolve_target(company, membership, target_type: str, target_id):
    """The target object, if it is in `company` and `membership` may view it.

    No view permission at all -> 403. Permission exists but the record is out of scope or missing -> 404
    (no existence leak across companies or scopes).
    """
    spec = get_spec(target_type)
    try:
        target_id = uuid.UUID(str(target_id))
    except (ValueError, TypeError):
        raise ValidationError({"target_id": "Not a valid id."})
    if scope_for(membership, spec.view_permission) is None:
        raise PermissionDenied("You do not have permission to access this record.")
    obj = spec.model.objects.for_company(company).filter(pk=target_id).first()
    if obj is None or not can(membership, spec.view_permission, obj):
        raise Http404
    return obj
