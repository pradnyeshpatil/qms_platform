from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from . import catalog
from .models import Permission, Role, RolePermission


def sync_permissions() -> None:
    """Make the global Permission table match catalog.py (idempotent, cheap)."""
    existing = dict(Permission.objects.values_list("code", "description"))
    missing = [
        Permission(code=c, module=catalog.module_of(c), description=d)
        for c, d in catalog.PERMISSIONS.items() if c not in existing
    ]
    if missing:
        Permission.objects.bulk_create(missing, ignore_conflicts=True)
    for code, desc in catalog.PERMISSIONS.items():
        if code in existing and existing[code] != desc:
            Permission.objects.filter(code=code).update(description=desc)


def _permission_ids() -> dict[str, int]:
    return dict(Permission.objects.values_list("code", "id"))


@transaction.atomic
def seed_company_roles(company) -> dict[str, Role]:
    """Create the six default system roles (and their grants) for a new company."""
    sync_permissions()
    ids = _permission_ids()
    roles = {}
    for spec in catalog.DEFAULT_ROLES:
        role = Role.objects.create(
            company=company, name=spec["name"], description=spec["description"],
            is_system=True, system_key=spec["key"],
        )
        RolePermission.objects.bulk_create(
            RolePermission(role=role, permission_id=ids[code], scope=scope)
            for code, scope in spec["grants"].items()
        )
        roles[spec["key"]] = role
    return roles


def normalize_grants(grants) -> dict[str, str]:
    """Validate [{code, scope}] against the catalog. Returns {code: scope}."""
    out: dict[str, str] = {}
    for g in grants:
        code, scope = g["code"], g.get("scope", catalog.ALL)
        if code not in catalog.PERMISSIONS:
            raise ValidationError({"permissions": f"Unknown permission '{code}'."})
        if scope not in catalog.SCOPES:
            raise ValidationError({"permissions": f"Unknown scope '{scope}'."})
        if scope != catalog.ALL and not catalog.is_scopable(code):
            raise ValidationError({"permissions": f"'{code}' cannot be limited to {scope} records."})
        if code in out:
            raise ValidationError({"permissions": f"Duplicate permission '{code}'."})
        out[code] = scope
    return out


def _set_grants(role: Role, grants: dict[str, str]) -> None:
    ids = _permission_ids()
    role.grants.all().delete()
    RolePermission.objects.bulk_create(
        RolePermission(role=role, permission_id=ids[code], scope=scope) for code, scope in grants.items()
    )


def _name_free(company, name, exclude_id=None):
    qs = Role.objects.filter(company=company, name__iexact=name)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    if qs.exists():
        raise ValidationError({"name": "A role with this name already exists."})


@transaction.atomic
def create_role(*, company, name, description="", grants=()) -> Role:
    _name_free(company, name)
    normalized = normalize_grants(grants)
    try:
        role = Role.objects.create(company=company, name=name, description=description)
    except IntegrityError:
        raise ValidationError({"name": "A role with this name already exists."})
    _set_grants(role, normalized)
    return role


def _members_using(role: Role):
    return role.memberships.exclude(status="inactive")


@transaction.atomic
def update_role(role: Role, *, name=None, description=None, grants=None, is_active=None) -> Role:
    if name is not None and name != role.name:
        _name_free(role.company, name, exclude_id=role.id)
        role.name = name
    if description is not None:
        role.description = description
    if is_active is not None and is_active != role.is_active:
        if not is_active:
            if role.system_key == catalog.ADMIN_ROLE_KEY:
                raise ValidationError({"detail": "The Company Admin role cannot be deactivated."})
            if _members_using(role).exists():
                raise ValidationError({"detail": "Reassign this role's employees before deactivating it."})
        role.is_active = is_active
    if grants is not None:
        normalized = normalize_grants(grants)
        if role.system_key == catalog.ADMIN_ROLE_KEY:
            for code in catalog.ADMIN_LOCKOUT_PROTECTED:
                if normalized.get(code) != catalog.ALL:
                    raise ValidationError(
                        {"permissions": f"Company Admin must keep '{code}' (company-wide) so the company cannot lock itself out."}
                    )
        _set_grants(role, normalized)
    role.save()
    return role


@transaction.atomic
def delete_role(role: Role) -> None:
    if role.is_system:
        raise ValidationError({"detail": "System roles cannot be deleted."})
    if role.memberships.exists():
        raise ValidationError({"detail": "This role is assigned to employees. Reassign them first."})
    role.delete()
