import datetime
import decimal
import uuid

from apps.core.context import get_request_context

from .models import ActivityLog


def _plain(value):
    """JSON-safe value for a change diff."""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, decimal.Decimal)):
        return str(value)
    if hasattr(value, "pk"):  # model instance -> readable label
        return str(value)
    return value


def diff(instance, data: dict, fields=None) -> dict:
    """{field: {"from", "to"}} for the fields in `data` that differ from `instance`."""
    out = {}
    for field, new in data.items():
        if fields is not None and field not in fields:
            continue
        old = getattr(instance, field, None)
        if old != new:
            out[field] = {"from": _plain(old), "to": _plain(new)}
    return out


def log(*, company, action, user=None, target=None, target_type="", label="", changes=None) -> ActivityLog:
    """Append one audit entry. `target` is any registered model instance (or pass target_type/label)."""
    ctx = get_request_context()
    if target is not None:
        from apps.core.targets import spec_for, target_label

        target_id = target.pk
        spec = spec_for(target)
        target_type = target_type or (spec.key if spec else "")
        label = label or target_label(target, spec)
    else:
        target_id = None
    return ActivityLog.objects.create(
        company=company,
        actor_user_id=getattr(user, "pk", None),
        actor_name=(user.full_name or user.email or "") if user is not None else "",
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_label=label[:255],
        changes=changes or {},
        ip_address=ctx.get("ip_address"),
        user_agent=ctx.get("user_agent", ""),
        request_id=ctx.get("request_id", ""),
    )
