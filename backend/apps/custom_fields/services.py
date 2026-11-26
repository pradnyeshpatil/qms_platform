from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit import services as audit

from .models import MAX_ACTIVE_PER_SCOPE, CustomFieldDefinition as D, CustomFieldDefinitionVersion
from .validators import clean_value, is_blank, validate_definition

IMMUTABLE_AFTER_CREATE = ("entity_type", "section", "key")


def definitions_for(company, entity_type, section="", *, active_only=True):
    qs = D.objects.for_company(company).filter(entity_type=entity_type, section=section)
    return qs.filter(is_active=True) if active_only else qs


def _scope_errors(e: ValueError):
    return ValidationError(e.args[0] if e.args and isinstance(e.args[0], dict) else {"detail": str(e)})


def _used(defn: D) -> bool:
    """Has any record stored a value for this field? (Blocks changing its type.)"""
    from apps.eight_d_reports.models import EightDReport, EightDSection

    if defn.entity_type == D.EntityType.EIGHT_D_REPORT:
        model = EightDSection if defn.section else EightDReport
        return model.objects.for_company(defn.company).filter(**{"custom_data__has_key": defn.key}).exists()
    return False


@transaction.atomic
def create_definition(*, company, user, data) -> D:
    data = dict(data)
    scope = {"entity_type": data["entity_type"], "section": data.get("section", "")}
    if D.objects.for_company(company).filter(**scope, key=data["key"]).exists():
        raise ValidationError({"key": "A field with this key already exists here."})
    if definitions_for(company, **scope).count() >= MAX_ACTIVE_PER_SCOPE and data.get("is_active", True):
        raise ValidationError({"detail": f"At most {MAX_ACTIVE_PER_SCOPE} active fields are allowed per section."})
    try:
        validate_definition(field_type=data["field_type"], options=data.get("options") or [],
                            validation=data.get("validation") or {}, default=data.get("default"))
    except ValueError as e:
        raise _scope_errors(e)
    defn = D(company=company, created_by=user, **data)
    if defn.default is not None:
        _check_default(defn)
    if "sort_order" not in data:
        last = definitions_for(company, **scope, active_only=False).order_by("-sort_order").first()
        defn.sort_order = (last.sort_order + 10) if last else 0
    defn.save()
    CustomFieldDefinitionVersion.objects.create(definition=defn, version=1, snapshot=defn.snapshot(), created_by=user)
    audit.log(company=company, user=user, action="custom_field.created", target_type="custom_field", label=defn.label,
              changes={"entity": defn.entity_type, "section": defn.section, "type": defn.field_type})
    return defn


def _check_default(defn: D) -> None:
    try:
        defn.default = clean_value(defn, defn.default)
    except ValueError as e:
        raise ValidationError({"default": str(e)})


@transaction.atomic
def update_definition(defn: D, data, *, user=None) -> D:
    data = dict(data)
    for k in IMMUTABLE_AFTER_CREATE:
        if k in data and data[k] != getattr(defn, k):
            raise ValidationError({k: "Cannot be changed after the field is created."})
        data.pop(k, None)
    if "field_type" in data and data["field_type"] != defn.field_type and _used(defn):
        raise ValidationError({"field_type": "Records already hold values for this field. Create a new field instead."})
    if data.get("is_active") and not defn.is_active:
        scope = {"entity_type": defn.entity_type, "section": defn.section}
        if definitions_for(defn.company, **scope).count() >= MAX_ACTIVE_PER_SCOPE:
            raise ValidationError({"detail": f"At most {MAX_ACTIVE_PER_SCOPE} active fields are allowed per section."})
    merged = {f: data.get(f, getattr(defn, f)) for f in ("field_type", "options", "validation", "default")}
    try:
        validate_definition(field_type=merged["field_type"], options=merged["options"] or [],
                            validation=merged["validation"] or {}, default=merged["default"])
    except ValueError as e:
        raise _scope_errors(e)
    changes = audit.diff(defn, data)
    if not changes:
        return defn
    for k, v in data.items():
        setattr(defn, k, v)
    if defn.default is not None:
        _check_default(defn)
    defn.version += 1
    defn.save()
    CustomFieldDefinitionVersion.objects.create(definition=defn, version=defn.version, snapshot=defn.snapshot(), created_by=user)
    audit.log(company=defn.company, user=user, action="custom_field.updated", target_type="custom_field",
              label=defn.label, changes=changes)
    return defn


# --- values ------------------------------------------------------------------------------------

def apply_values(company, entity_type: str, section: str, current: dict, schema: dict, incoming: dict):
    """Merge `incoming` into `current` after validating against the active definitions.

    `None` clears a value. Returns (new_data, new_schema). The schema remembers each stored key's definition as it was
    when the record was saved, so old records stay readable and printable if the field is later edited or deactivated.
    """
    if not isinstance(incoming, dict):
        raise ValidationError({"custom_data": "Must be an object of {field key: value}."})
    defs = {d.key: d for d in definitions_for(company, entity_type, section, active_only=False)}
    data, errors = dict(current or {}), {}
    for key, raw in incoming.items():
        defn = defs.get(key)
        if defn is None or not defn.is_active:
            errors[f"custom_data.{key}"] = "Unknown or inactive field."
            continue
        try:
            value = clean_value(defn, raw)
        except ValueError as e:
            errors[f"custom_data.{key}"] = str(e)
            continue
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    if errors:
        raise ValidationError(errors)
    new_schema = {k: (defs[k].snapshot() if k in defs and (k in incoming or k not in (schema or {})) else (schema or {}).get(k))
                  for k in data}
    return data, {k: v for k, v in new_schema.items() if v is not None}


def missing_required(company, entity_type: str, section: str, data: dict) -> list[str]:
    """Labels of required active fields that have no answer yet."""
    return [d.label for d in definitions_for(company, entity_type, section)
            if d.required and is_blank(d, (data or {}).get(d.key, d.default if d.field_type == D.FieldType.CHECKBOX else None))]
