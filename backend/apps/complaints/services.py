from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.core.services import next_sequence_value
from apps.core.utils import company_now, company_today
from apps.rbac.authorization import can

from . import defaults
from .closure import run_closure_checks
from .models import (
    Complaint, ComplaintAssignee, ComplaintStatus, ComplaintStatusTransition, DefectCategory,
)

NUMBER_KEY = "complaint"
UNSET = object()  # "field not supplied" (None is a real value: unassign)
AUDITED_FIELDS = {
    "customer", "customer_reference_number", "title", "description", "product_name", "part_number",
    "batch_number", "quantity_affected", "defect_category", "severity", "source", "reported_date", "due_date",
    "plant", "department", "closure_comment",
}


# --- company defaults --------------------------------------------------------------------------

def seed_company_config(company) -> None:
    """Default statuses and defect categories for a new company (idempotent)."""
    for order, (key, name, category, is_default) in enumerate(defaults.DEFAULT_STATUSES):
        ComplaintStatus.objects.get_or_create(
            company=company, system_key=key,
            defaults={"name": name, "category": category, "is_default": is_default, "sort_order": order * 10},
        )
    for name in defaults.DEFAULT_DEFECT_CATEGORIES:
        DefectCategory.objects.get_or_create(company=company, name=name)


def default_status(company) -> ComplaintStatus:
    status = ComplaintStatus.objects.for_company(company).filter(is_default=True, is_active=True).first()
    if status is None:
        raise ValidationError({"status": "This workspace has no default complaint status configured."})
    return status


# --- permissions / workflow rules --------------------------------------------------------------

def _require(membership, permission, message):
    if membership is not None and not can(membership, permission):
        raise PermissionDenied(message)


def _check_transition(old: ComplaintStatus | None, new: ComplaintStatus) -> None:
    if old is None or old.pk == new.pk:
        return
    limits = list(ComplaintStatusTransition.objects.filter(from_status=old).values_list("to_status_id", flat=True))
    if limits and new.pk not in limits:
        raise ValidationError({"status": f"Moving from '{old.name}' to '{new.name}' is not allowed by the workflow."})


def _apply_status(complaint: Complaint, new: ComplaintStatus, *, closure_comment, membership,
                  check_transition=True) -> dict:
    """Move `complaint` to `new` (not saved). Enforces workflow rules; returns audit changes + action."""
    old = complaint.status if complaint.status_id else None
    if new.company_id != complaint.company_id or not new.is_active or new.deleted_at:
        raise ValidationError({"status": "Unknown or inactive status."})
    if old is not None and old.pk == new.pk:
        return {}
    if check_transition:
        _check_transition(old, new)

    reopening = old is not None and old.is_finished and not new.is_finished
    if new.is_finished:
        _require(membership, "complaints.close", "You do not have permission to resolve or close complaints.")
    if reopening:
        _require(membership, "complaints.close", "You do not have permission to reopen complaints.")
    if new.category == ComplaintStatus.Category.CLOSED:
        comment = (closure_comment if closure_comment is not None else complaint.closure_comment).strip()
        if not comment:
            raise ValidationError({"closure_comment": "A closure comment is required to close a complaint."})
        findings = run_closure_checks(complaint)
        blockers = [f for f in findings if f["blocking"]]
        if blockers:
            raise ValidationError({"detail": " ".join(f["message"] for f in blockers)})
        complaint._closure_warnings = [f for f in findings if not f["blocking"]]
        complaint.closure_comment = comment
        complaint.closed_at = timezone.now()
    elif not new.is_finished:
        complaint.closed_at = None

    complaint.status = new
    action = "complaint.reopened" if reopening else (
        "complaint.closed" if new.category == ComplaintStatus.Category.CLOSED else "complaint.status_changed"
    )
    changes = {"status": {"from": old.name if old else None, "to": new.name}}
    warnings = getattr(complaint, "_closure_warnings", [])
    if warnings:
        changes["warnings"] = [w["code"] for w in warnings]
    return {"action": action, "changes": changes}


# --- create / update / delete ------------------------------------------------------------------

@transaction.atomic
def create_complaint(*, company, user, data, membership=None) -> Complaint:
    data = dict(data)
    if data.get("owner") is not None:
        _require(membership, "complaints.assign", "You do not have permission to assign complaint owners.")
    status = data.pop("status", None) or default_status(company)
    closure_comment = data.get("closure_comment")
    year = company_now(company).year
    seq = next_sequence_value(company, NUMBER_KEY, year)
    data.setdefault("reported_date", company_today(company))
    if data["reported_date"] is None:
        data["reported_date"] = company_today(company)
    complaint = Complaint(company=company, created_by=user, number=f"CMP-{year}-{seq:05d}", status=status, **data)
    if status.is_finished:  # created already resolved/closed (imports, demo data): same rules as a transition
        complaint.status = default_status(company)
        _apply_status(complaint, status, closure_comment=closure_comment, membership=membership,
                      check_transition=False)
    complaint.save()
    audit.log(company=company, user=user, action="complaint.created", target=complaint,
              changes={"status": {"to": complaint.status.name}, "severity": {"to": complaint.severity}})
    return complaint


@transaction.atomic
def update_complaint(complaint: Complaint, data, *, user=None, membership=None) -> Complaint:
    data = dict(data)
    new_status = data.pop("status", UNSET)
    new_owner = data.pop("owner", UNSET)
    closure_comment = data.get("closure_comment")

    changes = audit.diff(complaint, data, AUDITED_FIELDS)
    status_change = {}
    if new_status is not UNSET and new_status is not None:
        status_change = _apply_status(
            complaint, new_status, closure_comment=closure_comment, membership=membership
        )
    for k, v in data.items():
        setattr(complaint, k, v)
    owner_changes = {}
    if new_owner is not UNSET:
        owner_changes = _set_owner(complaint, new_owner, user=user, membership=membership)
    complaint.save()

    if changes:
        audit.log(company=complaint.company, user=user, action="complaint.updated", target=complaint, changes=changes)
    if owner_changes:
        audit.log(company=complaint.company, user=user, action="complaint.assigned", target=complaint,
                  changes=owner_changes)
    if status_change:
        audit.log(company=complaint.company, user=user, action=status_change["action"], target=complaint,
                  changes=status_change["changes"])
    return complaint


@transaction.atomic
def change_status(complaint: Complaint, status: ComplaintStatus, *, user=None, membership=None,
                  closure_comment=None) -> Complaint:
    result = _apply_status(complaint, status, closure_comment=closure_comment, membership=membership)
    if result:
        complaint.save()
        audit.log(company=complaint.company, user=user, action=result["action"], target=complaint,
                  changes=result["changes"])
    return complaint


def delete_complaint(complaint: Complaint, *, user=None) -> None:
    complaint.deleted_at = timezone.now()
    complaint.save(update_fields=["deleted_at", "updated_at"])
    audit.log(company=complaint.company, user=user, action="complaint.deleted", target=complaint)


# --- assignment --------------------------------------------------------------------------------

def _set_owner(complaint: Complaint, owner, *, user, membership) -> dict:
    """Change the primary owner (not saved). Permission-checked; moves New -> Assigned automatically."""
    if (owner.id if owner else None) == complaint.owner_id:
        return {}
    _require(membership, "complaints.assign", "You do not have permission to assign complaint owners.")
    before = complaint.owner.display_name if complaint.owner_id else None
    complaint.owner = owner
    changes = {"owner": {"from": before, "to": owner.display_name if owner else None}}
    if owner is not None and complaint.status.system_key == "new":
        assigned = ComplaintStatus.objects.for_company(complaint.company).filter(
            system_key="assigned", is_active=True
        ).first()
        if assigned is not None:
            changes["status"] = {"from": complaint.status.name, "to": assigned.name}
            complaint.status = assigned
    return changes


@transaction.atomic
def assign_complaint(complaint: Complaint, *, owner=UNSET, assignees=UNSET, user=None, membership=None) -> Complaint:
    """Set the primary owner and/or the additional assignee list in one audited step."""
    _require(membership, "complaints.assign", "You do not have permission to assign complaint owners.")
    changes = {}
    if owner is not UNSET:
        changes.update(_set_owner(complaint, owner, user=user, membership=membership))
    if assignees is not UNSET:
        wanted = {m.id: m for m in assignees}
        if complaint.owner_id in wanted:
            wanted.pop(complaint.owner_id)  # the owner is never also an additional assignee
        current = {a.membership_id: a for a in complaint.assignees.select_related("membership__user")}
        removed = [a for mid, a in current.items() if mid not in wanted]
        added = [m for mid, m in wanted.items() if mid not in current]
        for a in removed:
            a.delete()
        ComplaintAssignee.objects.bulk_create(ComplaintAssignee(complaint=complaint, membership=m) for m in added)
        if added or removed:
            changes["assignees"] = {
                "added": [m.display_name for m in added],
                "removed": [a.membership.display_name for a in removed],
            }
    if changes:
        complaint.save()
        audit.log(company=complaint.company, user=user, action="complaint.assigned", target=complaint, changes=changes)
    return complaint


# --- duplicates --------------------------------------------------------------------------------

def find_possible_duplicates(company, *, customer, part_number, batch_number, exclude_id=None):
    """Open complaints for the same customer + part number + batch (soft warning, never blocks)."""
    if not part_number:
        return Complaint.objects.none()
    qs = (
        Complaint.objects.for_company(company)
        .filter(customer=customer, part_number__iexact=part_number, batch_number__iexact=batch_number or "")
        .exclude(status__category__in=ComplaintStatus.FINISHED)
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs.order_by("-created_at")[:5]


# --- status configuration ----------------------------------------------------------------------

def _closed_statuses(company, exclude_id=None):
    qs = ComplaintStatus.objects.for_company(company).filter(category="closed", is_active=True)
    return qs.exclude(id=exclude_id) if exclude_id else qs


def _check_status_name(company, name, exclude_id=None):
    qs = ComplaintStatus.objects.for_company(company).filter(name__iexact=name)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    if qs.exists():
        raise ValidationError({"name": "A status with this name already exists."})


def _set_transitions(status: ComplaintStatus, targets):
    ComplaintStatusTransition.objects.filter(from_status=status).delete()
    ComplaintStatusTransition.objects.bulk_create(
        ComplaintStatusTransition(from_status=status, to_status=t) for t in targets if t.pk != status.pk
    )


@transaction.atomic
def create_status(*, company, user, data) -> ComplaintStatus:
    data = dict(data)
    targets = data.pop("allowed_next", None)
    _check_status_name(company, data["name"])
    if "sort_order" not in data:
        last = ComplaintStatus.objects.for_company(company).order_by("-sort_order").first()
        data["sort_order"] = (last.sort_order + 10) if last else 0
    if data.get("is_default"):
        ComplaintStatus.objects.for_company(company).filter(is_default=True).update(is_default=False)
    status = ComplaintStatus.objects.create(company=company, created_by=user, **data)
    if targets:
        _set_transitions(status, targets)
    audit.log(company=company, user=user, action="complaint_status.created", target_type="complaint_status",
              label=status.name, changes={"category": {"to": status.category}})
    return status


@transaction.atomic
def update_status(status: ComplaintStatus, data, *, user=None) -> ComplaintStatus:
    data = dict(data)
    targets = data.pop("allowed_next", None)
    company = status.company
    if "name" in data:
        _check_status_name(company, data["name"], exclude_id=status.id)
    if status.category == "closed" and data.get("category", "closed") != "closed" and not _closed_statuses(
        company, exclude_id=status.id
    ).exists():
        raise ValidationError({"category": "At least one active 'closed' status must remain."})
    if data.get("is_active") is False:
        if status.is_default and not data.get("is_default") is False:
            raise ValidationError({"is_active": "The default status cannot be deactivated."})
        if status.category == "closed" and not _closed_statuses(company, exclude_id=status.id).exists():
            raise ValidationError({"is_active": "At least one active 'closed' status must remain."})
    if data.get("is_default") is False and status.is_default:
        raise ValidationError({"is_default": "Pick another status as the default instead."})
    if data.get("is_default"):
        if data.get("is_active") is False or not status.is_active:
            raise ValidationError({"is_default": "An inactive status cannot be the default."})
        ComplaintStatus.objects.for_company(company).filter(is_default=True).exclude(id=status.id).update(
            is_default=False
        )
    changes = audit.diff(status, data)
    for k, v in data.items():
        setattr(status, k, v)
    status.save()
    if targets is not None:
        _set_transitions(status, targets)
        changes["allowed_next"] = {"to": [t.name for t in targets]}
    if changes:
        audit.log(company=company, user=user, action="complaint_status.updated", target_type="complaint_status",
                  label=status.name, changes=changes)
    return status


@transaction.atomic
def delete_status(status: ComplaintStatus, *, user=None) -> None:
    company = status.company
    if status.is_default:
        raise ValidationError({"detail": "The default status cannot be deleted. Choose another default first."})
    if Complaint.objects.for_company(company, include_deleted=True).filter(status=status).exists():
        raise ValidationError({"detail": "This status is in use by complaints. Deactivate it instead."})
    if status.category == "closed" and not _closed_statuses(company, exclude_id=status.id).exists():
        raise ValidationError({"detail": "At least one active 'closed' status must remain."})
    status.deleted_at = timezone.now()
    status.save(update_fields=["deleted_at", "updated_at"])
    ComplaintStatusTransition.objects.filter(from_status=status).delete()
    ComplaintStatusTransition.objects.filter(to_status=status).delete()
    audit.log(company=company, user=user, action="complaint_status.deleted", target_type="complaint_status",
              label=status.name)


# --- defect categories -------------------------------------------------------------------------

def save_defect_category(*, company, user, data, instance=None) -> DefectCategory:
    name = data.get("name", instance.name if instance else "")
    qs = DefectCategory.objects.for_company(company).filter(name__iexact=name)
    if instance:
        qs = qs.exclude(id=instance.id)
    if qs.exists():
        raise ValidationError({"name": "A defect category with this name already exists."})
    try:
        with transaction.atomic():
            if instance is None:
                return DefectCategory.objects.create(company=company, created_by=user, **data)
            for k, v in data.items():
                setattr(instance, k, v)
            instance.save()
            return instance
    except IntegrityError:
        raise ValidationError({"name": "A defect category with this name already exists."})


def delete_defect_category(category: DefectCategory) -> None:
    if Complaint.objects.for_company(category.company, include_deleted=True).filter(defect_category=category).exists():
        raise ValidationError({"detail": "This category is used by complaints. Deactivate it instead."})
    category.deleted_at = timezone.now()
    category.save(update_fields=["deleted_at", "updated_at"])
