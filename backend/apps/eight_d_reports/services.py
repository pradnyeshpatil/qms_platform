import datetime
import decimal
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.core.context import get_request_context
from apps.core.exceptions import EditConflict
from apps.core.services import next_sequence_value
from apps.core.utils import company_now, company_today
from apps.custom_fields import services as custom_fields
from apps.custom_fields.models import CustomFieldDefinition
from apps.rbac.authorization import can

from .models import (
    ROW_MODELS, SECTION_CODES, SINGLETONS, D0Assessment, D1TeamMember, D2ProblemDescription, D4RootCauseAnalysis,
    D8Closure, EightDReport, EightDSection, ReportApproval, ReportRevision,
)

ENTITY = CustomFieldDefinition.EntityType.EIGHT_D_REPORT
NUMBER_KEY = "eight_d"
UNSET = object()
REQUIRED_SECTIONS = ("D1", "D2", "D3", "D4", "D5", "D6", "D8")  # PROJECT_SPEC §9 defaults; D0 / D7 recommended
HEADER_FIELDS = {"title", "team_leader", "approver", "plant", "department", "opened_date", "target_close_date",
                 "template_key"}


# --- helpers -----------------------------------------------------------------------------------

def _require(membership, permission, message, obj=None):
    if membership is not None and not can(membership, permission, obj):
        raise PermissionDenied(message)


def require_editable(report: EightDReport) -> None:
    if not report.is_editable:
        raise ValidationError({"detail": f"This report is {report.get_status_display()} and cannot be edited. "
                                         "Reject it or reopen it first."})


def check_version(obj, version) -> None:
    if version is None:
        raise ValidationError({"version": "The version you loaded is required (optimistic locking)."})
    if obj.version != version:
        raise EditConflict()


def _bump(obj, **fields) -> None:
    """Save with version+1 under a conditional UPDATE so two concurrent saves cannot both win."""
    version = obj.version
    columns = {}
    for name, value in fields.items():
        setattr(obj, name, value)
        if _is_fk(obj, name):
            columns[f"{name}_id"] = value.pk if value is not None else None
        else:
            columns[name] = value
    updated = type(obj).objects.filter(pk=obj.pk, version=version).update(
        version=F("version") + 1, updated_at=timezone.now(), **columns
    )
    if not updated:
        raise EditConflict()
    obj.version = version + 1


def _is_fk(obj, name) -> bool:
    f = obj._meta.get_field(name)
    return f.is_relation and f.many_to_one


def _touch(report: EightDReport, user) -> None:
    """First edit moves a Draft report to In Progress."""
    if report.status == EightDReport.Status.DRAFT:
        report.status = EightDReport.Status.IN_PROGRESS
        report.save(update_fields=["status", "updated_at"])


def _name(m) -> str | None:
    return m.display_name if m is not None else None


def _plain(value):
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, decimal.Decimal)):
        return str(value)
    return value


# --- creation ----------------------------------------------------------------------------------

def _default_approver(company):
    from apps.tenants.models import Membership

    return Membership.objects.filter(
        company=company, status="active", role__system_key="quality_manager", role__is_active=True
    ).order_by("joined_at").first()


@transaction.atomic
def create_report(*, company, user, membership, complaint, data) -> EightDReport:
    data = dict(data)
    leader = data.pop("team_leader", None) or membership
    custom, schema = custom_fields.apply_values(company, ENTITY, "", {}, {}, data.pop("custom_data", None) or {})
    year = company_now(company).year
    number = f"8D-{year}-{next_sequence_value(company, NUMBER_KEY, year):05d}"
    report = EightDReport.objects.create(
        company=company, created_by=user, number=number, complaint=complaint,
        title=data.pop("title", None) or complaint.title,
        team_leader=leader, approver=data.pop("approver", None) or _default_approver(company),
        plant=data.pop("plant", None) or complaint.plant, department=data.pop("department", None) or complaint.department,
        opened_date=data.pop("opened_date", None) or company_today(company), custom_data=custom, custom_schema=schema, **data,
    )
    base = {"company": company, "report": report, "created_by": user}
    for code in SECTION_CODES:
        EightDSection.objects.create(code=code, **base)
    D0Assessment.objects.create(**base)
    D2ProblemDescription.objects.create(
        problem_statement=complaint.title, what=complaint.description, part_number=complaint.part_number,
        batch_number=complaint.batch_number, product_name=complaint.product_name,
        quantity_affected=complaint.quantity_affected, detected_date=complaint.reported_date, **base,
    )
    D4RootCauseAnalysis.objects.create(**base)
    D8Closure.objects.create(**base)
    if leader is not None:
        D1TeamMember.objects.create(membership=leader, name=leader.display_name, role="Team leader", is_leader=True,
                                    department_name=leader.department.name if leader.department_id else "", **base)
    audit.log(company=company, user=user, action="eight_d.created", target=report,
              changes={"complaint": {"to": complaint.number}})
    return report


@transaction.atomic
def update_header(report: EightDReport, data, *, version, user=None, membership=None) -> EightDReport:
    require_editable(report)
    check_version(report, version)
    incoming_custom = data.get("custom_data")
    data = {k: v for k, v in data.items() if k in HEADER_FIELDS}
    changes = audit.diff(report, data)
    if incoming_custom:
        custom, schema = custom_fields.apply_values(report.company, ENTITY, "", report.custom_data, report.custom_schema,
                                                    incoming_custom)
        changes.update({f"custom:{k}": {"from": report.custom_data.get(k), "to": custom.get(k)}
                        for k in set(custom) | set(report.custom_data) if custom.get(k) != report.custom_data.get(k)})
        data.update(custom_data=custom, custom_schema=schema)
    _bump(report, **data)
    if changes:
        audit.log(company=report.company, user=user, action="eight_d.updated", target=report, changes=changes)
    _touch(report, user)
    return report


@transaction.atomic
def delete_report(report: EightDReport, *, user=None) -> None:
    if report.status != EightDReport.Status.DRAFT:
        raise ValidationError({"detail": "Only draft reports can be deleted. Later reports are part of the quality record."})
    report.deleted_at = timezone.now()
    report.save(update_fields=["deleted_at", "updated_at"])
    audit.log(company=report.company, user=user, action="eight_d.deleted", target=report)


# --- section data (singletons and rows) --------------------------------------------------------

@transaction.atomic
def update_singleton(report: EightDReport, key: str, data, *, version, user=None) -> object:
    require_editable(report)
    obj = SINGLETONS[key].objects.get(report=report)
    check_version(obj, version)
    data = dict(data)
    changes = audit.diff(obj, data)
    _bump(obj, **data)
    if changes:
        audit.log(company=report.company, user=user, action="eight_d.section_updated", target=report,
                  changes={"section": obj.SECTION, **changes})
    _touch(report, user)
    return obj


@transaction.atomic
def add_row(report: EightDReport, key: str, data, *, user=None):
    require_editable(report)
    model = ROW_MODELS[key]
    row = model.objects.create(company=report.company, report=report, created_by=user, **data)
    audit.log(company=report.company, user=user, action="eight_d.row_added", target=report,
              changes={"section": model.SECTION, "item": key})
    _touch(report, user)
    return row


@transaction.atomic
def update_row(row, data, *, version, user=None):
    report = row.report
    require_editable(report)
    check_version(row, version)
    data = dict(data)
    changes = audit.diff(row, data)
    _bump(row, **data)
    if changes:
        audit.log(company=report.company, user=user, action="eight_d.row_updated", target=report,
                  changes={"section": row.SECTION, "item": type(row).__name__, **changes})
    _touch(report, user)
    return row


@transaction.atomic
def delete_row(row, *, user=None) -> None:
    report = row.report
    require_editable(report)
    if isinstance(row, D1TeamMember) and row.is_leader and report.team_leader_id == row.membership_id:
        raise ValidationError({"detail": "Change the team leader on the report before removing them from the team."})
    section, label = row.SECTION, type(row).__name__
    row.delete()
    audit.log(company=report.company, user=user, action="eight_d.row_removed", target=report,
              changes={"section": section, "item": label})
    _touch(report, user)


# --- section tracking --------------------------------------------------------------------------

def _section_problems(report: EightDReport, code: str) -> list[str]:
    """Why a section cannot be marked complete yet (empty list = ok)."""
    problems = _core_section_problems(report, code)
    missing = custom_fields.missing_required(report.company, ENTITY, code, report.sections.get(code=code).custom_data)
    if missing:
        problems.append("Fill in the required fields: " + ", ".join(missing) + ".")
    return problems


def _core_section_problems(report: EightDReport, code: str) -> list[str]:
    text = lambda v: bool((v or "").strip())
    if code == "D0":
        d0 = report.d0
        return [] if d0.formal_8d_required or text(d0.rationale) else ["Explain why a formal 8D is not required."]
    if code == "D1":
        has_leader = report.team_leader_id is not None or report.team_members.filter(is_leader=True).exists()
        out = [] if report.team_members.exists() else ["Add at least one team member."]
        return out + ([] if has_leader else ["Name a team leader."])
    if code == "D2":
        return [] if text(report.d2.problem_statement) else ["Write the problem statement."]
    if code == "D3":
        return [] if report.containment_actions.exists() else ["Record at least one containment action."]
    if code == "D4":
        return [] if text(report.d4.root_cause) else ["State the root cause."]
    if code == "D5":
        return [] if report.corrective_actions.filter(decision="selected").exists() else [
            "Select at least one permanent corrective action."]
    if code == "D6":
        return [] if report.validations.exclude(is_effective__isnull=True).exists() else [
            "Record at least one validation result."]
    if code == "D7":
        return [] if report.preventive_actions.exists() else ["Record at least one preventive action."]
    if code == "D8":
        return [] if text(report.d8.closure_summary) else ["Write the closure summary."]
    return []


@transaction.atomic
def set_section_status(report: EightDReport, code: str, status: str, *, version=None, user=None, membership=None):
    require_editable(report)
    if code not in SECTION_CODES:
        raise ValidationError({"code": "Use D0 to D8."})
    if status not in EightDSection.Status.values:
        raise ValidationError({"status": "Unknown status."})
    section = report.sections.get(code=code)
    if version is not None:
        check_version(section, version)
    if status == EightDSection.Status.COMPLETE:
        problems = _section_problems(report, code)
        if problems:
            raise ValidationError({"detail": f"{code} is not ready to complete: " + " ".join(problems)})
    fields = {"status": status}
    if status == EightDSection.Status.COMPLETE:
        fields.update(completed_at=timezone.now(), completed_by=membership)
    else:
        fields.update(completed_at=None, completed_by=None)
    old = section.status
    _bump(section, **fields)
    if old != status:
        audit.log(company=report.company, user=user,
                  action="eight_d.section_completed" if status == "complete" else "eight_d.section_status_changed",
                  target=report, changes={"section": code, "status": {"from": old, "to": status}})
    _touch(report, user)
    return section


@transaction.atomic
def set_section_owner(report: EightDReport, code: str, owner, *, user=None):
    require_editable(report)
    section = report.sections.get(code=code)
    before = _name(section.owner) if section.owner_id else None
    _bump(section, owner=owner)
    audit.log(company=report.company, user=user, action="eight_d.section_owner_changed", target=report,
              changes={"section": code, "owner": {"from": before, "to": _name(owner)}})
    return section


@transaction.atomic
def update_section_custom(report: EightDReport, code: str, incoming, *, version, user=None):
    """Set company-defined field values for one section (D0..D8). Optimistic-locked on the section row."""
    require_editable(report)
    if code not in SECTION_CODES:
        raise ValidationError({"code": "Use D0 to D8."})
    section = report.sections.get(code=code)
    check_version(section, version)
    custom, schema = custom_fields.apply_values(report.company, ENTITY, code, section.custom_data, section.custom_schema,
                                                incoming)
    changed = sorted(k for k in set(custom) | set(section.custom_data) if custom.get(k) != section.custom_data.get(k))
    _bump(section, custom_data=custom, custom_schema=schema)
    if changed:
        audit.log(company=report.company, user=user, action="eight_d.custom_fields_updated", target=report,
                  changes={"section": code, "fields": changed})
    _touch(report, user)
    return section


def completion(report: EightDReport) -> dict:
    statuses = dict(report.sections.values_list("code", "status"))
    done = [c for c in SECTION_CODES if statuses.get(c) == "complete"]
    missing = [c for c in REQUIRED_SECTIONS if statuses.get(c) != "complete"]
    return {"complete": len(done), "total": len(SECTION_CODES), "percent": round(100 * len(done) / len(SECTION_CODES)),
            "required_sections": list(REQUIRED_SECTIONS), "missing_required": missing, "ready_for_approval": not missing}


# --- snapshot ----------------------------------------------------------------------------------

def _dump(obj) -> dict:
    out = {}
    skip = {"company", "created_by", "deleted_at", "report"}
    for f in obj._meta.concrete_fields:
        if f.name in skip:
            continue
        if f.is_relation:
            related = getattr(obj, f.name)
            out[f"{f.name}_id"] = str(related.pk) if related is not None else None
            if related is not None and hasattr(related, "display_name"):
                out[f"{f.name}_name"] = related.display_name
            continue
        out[f.name] = _plain(getattr(obj, f.name))
    return out


def build_snapshot(report: EightDReport) -> dict:
    complaint = report.complaint
    return {
        "report": {**_dump(report), "complaint_number": complaint.number, "complaint_title": complaint.title,
                   "customer_name": complaint.customer.name},
        "sections": [_dump(s) for s in report.sections.select_related("owner__user").order_by("code")],
        "d0": _dump(report.d0), "d2": _dump(report.d2), "d4": _dump(report.d4), "d8": _dump(report.d8),
        "team_members": [_dump(r) for r in report.team_members.all()],
        "containment_actions": [_dump(r) for r in report.containment_actions.select_related("responsible__user")],
        "why_steps": [_dump(r) for r in report.why_steps.all()],
        "fishbone_causes": [_dump(r) for r in report.fishbone_causes.all()],
        "corrective_actions": [_dump(r) for r in report.corrective_actions.select_related("responsible__user")],
        "validations": [_dump(r) for r in report.validations.select_related("responsible__user")],
        "preventive_actions": [_dump(r) for r in report.preventive_actions.select_related("responsible__user")],
        "approvals": [_dump(a) for a in report.approvals.all()],
        "custom_data": {  # values + the definitions they were saved under, so old revisions print identically
            "report": {"values": report.custom_data, "schema": report.custom_schema},
            "sections": {s.code: {"values": s.custom_data, "schema": s.custom_schema} for s in report.sections.all() if s.custom_data},
        },
    }


def _take_snapshot(report, kind, user) -> ReportRevision:
    return ReportRevision.objects.create(
        company=report.company, report=report, revision=report.revision, kind=kind, created_by=user,
        snapshot=build_snapshot(report),
    )


# --- workflow ----------------------------------------------------------------------------------

def _move(report, new_status, **extra):
    report.status = new_status
    for k, v in extra.items():
        setattr(report, k, v)
    report.version += 1
    report.save()


def _expect(report, *allowed, verb):
    if report.status not in allowed:
        raise ValidationError({"detail": f"A {report.get_status_display()} report cannot be {verb}."})


@transaction.atomic
def request_approval(report: EightDReport, *, approver=None, user=None, membership=None) -> EightDReport:
    _expect(report, "draft", "in_progress", verb="sent for approval")
    c = completion(report)
    if not c["ready_for_approval"]:
        raise ValidationError({"detail": "Complete these sections first: " + ", ".join(c["missing_required"]) + "."})
    missing = custom_fields.missing_required(report.company, ENTITY, "", report.custom_data)
    if missing:
        raise ValidationError({"detail": "Fill in the required report fields first: " + ", ".join(missing) + "."})
    if approver is not None:
        report.approver = approver
    if report.approver_id is None:
        raise ValidationError({"approver": "Choose who will approve this report."})
    _move(report, EightDReport.Status.PENDING_APPROVAL)
    audit.log(company=report.company, user=user, action="eight_d.approval_requested", target=report,
              changes={"approver": _name(report.approver), "revision": report.revision})
    return report


@transaction.atomic
def decide_approval(report: EightDReport, *, decision, comment="", signed_name="", user=None, membership=None):
    _expect(report, "pending_approval", verb="approved or rejected")
    _require(membership, "eight_d_reports.approve", "You do not have permission to approve 8D reports.", report)
    if report.approver_id and membership is not None and report.approver_id != membership.id:
        raise PermissionDenied("Only the approver selected for this report can decide.")
    comment, signed_name = (comment or "").strip(), (signed_name or "").strip()
    if decision == "approved":
        if not signed_name:
            raise ValidationError({"signed_name": "Type your full name to sign the approval."})
    elif decision == "rejected":
        if not comment:
            raise ValidationError({"comment": "A comment is required when rejecting a report."})
    else:
        raise ValidationError({"decision": "Use approved or rejected."})
    ReportApproval.objects.create(
        company=report.company, report=report, revision=report.revision, approver=membership, created_by=user,
        approver_name=_name(membership) or "", decision=decision, comment=comment, signed_name=signed_name,
        ip_address=get_request_context().get("ip_address"),
    )
    if decision == "approved":
        _move(report, EightDReport.Status.APPROVED)
        _take_snapshot(report, ReportRevision.Kind.APPROVED, user)
    else:
        _move(report, EightDReport.Status.IN_PROGRESS)
    audit.log(company=report.company, user=user, action=f"eight_d.{decision}", target=report,
              changes={"revision": report.revision, "comment": comment})
    return report


@transaction.atomic
def submit_report(report: EightDReport, *, method, recipient, user=None, membership=None):
    _expect(report, "approved", verb="submitted to the customer")
    if not (method or "").strip() or not (recipient or "").strip():
        raise ValidationError({"method": "Say how and to whom the report was sent."} if not (method or "").strip()
                              else {"recipient": "Say who the report was sent to."})
    _move(report, EightDReport.Status.SUBMITTED, submitted_at=timezone.now(), submitted_method=method.strip(),
          submitted_to=recipient.strip())
    _take_snapshot(report, ReportRevision.Kind.SUBMITTED, user)
    audit.log(company=report.company, user=user, action="eight_d.submitted", target=report,
              changes={"method": method, "recipient": recipient, "revision": report.revision})
    return report


@transaction.atomic
def close_report(report: EightDReport, *, user=None, membership=None):
    _expect(report, "submitted", verb="closed")
    _move(report, EightDReport.Status.CLOSED, closed_at=timezone.now())
    audit.log(company=report.company, user=user, action="eight_d.closed", target=report)
    return report


@transaction.atomic
def reopen_report(report: EightDReport, *, reason, user=None, membership=None):
    _expect(report, "approved", "submitted", "closed", verb="reopened")
    _require(membership, "eight_d_reports.reopen", "You do not have permission to reopen 8D reports.", report)
    if not (reason or "").strip():
        raise ValidationError({"reason": "A reason is required to reopen a report."})
    old_revision = report.revision
    _move(report, EightDReport.Status.IN_PROGRESS, revision=old_revision + 1, reopen_reason=reason.strip(),
          closed_at=None, submitted_at=None, submitted_method="", submitted_to="")
    audit.log(company=report.company, user=user, action="eight_d.reopened", target=report,
              changes={"revision": {"from": old_revision, "to": report.revision}, "reason": reason.strip()})
    return report


# --- tasks from action rows --------------------------------------------------------------------

TASKABLE = {  # row key -> (task type, row field stamped when the task finishes or None)
    "containment-actions": ("containment", "completed_date"),
    "corrective-actions": ("corrective", None),
    "validations": ("validation", None),
    "preventive-actions": ("preventive", "completed_date"),
}


def source_type_for(key: str) -> str:
    return "eight_d_" + key.replace("-", "_")


@transaction.atomic
def create_task_for_row(row, key: str, *, user, membership, overrides=None):
    from apps.tasks import services as task_services
    from apps.tasks.models import Task

    if key not in TASKABLE:
        raise ValidationError({"detail": "Tasks can only be created from action rows (D3, D5, D6, D7)."})
    report = row.report
    source = source_type_for(key)
    if Task.objects.for_company(report.company).filter(source_type=source, source_id=row.id).exclude(
        status="cancelled"
    ).exists():
        raise ValidationError({"detail": "A task already exists for this action."})
    data = {
        "title": (row.description.strip().splitlines() or ["Action"])[0][:255],
        "description": row.description, "task_type": TASKABLE[key][0], "eight_d_report": report,
        "eight_d_section": row.SECTION, "assignee": getattr(row, "responsible", None),
        "due_date": getattr(row, "due_date", None), **(overrides or {}),
    }
    task = task_services.create_task(
        company=report.company, user=user, membership=membership, data=data, source_type=source, source_id=row.id
    )
    audit.log(company=report.company, user=user, action="eight_d.task_created", target=report,
              changes={"section": row.SECTION, "task": task.title})
    return task


def _make_task_hook(key):
    field = TASKABLE[key][1]
    model = ROW_MODELS[key]

    def hook(task):
        if field is None:
            return
        row = model.objects.select_related("report").filter(pk=task.source_id, company=task.company).first()
        if row is None or not row.report.is_editable:
            return  # never rewrite an approved / locked report from a task update
        done = task.status == "done"
        model.objects.filter(pk=row.pk).update(
            **{field: company_today(task.company) if done else None}, version=F("version") + 1)

    return hook


def register_task_hooks() -> None:
    from apps.tasks.hooks import register_source

    for key in TASKABLE:
        register_source(source_type_for(key), _make_task_hook(key))


# --- complaint closure check -------------------------------------------------------------------

def complaint_closure_check(complaint) -> list[dict]:
    open_reports = EightDReport.objects.for_company(complaint.company).filter(complaint=complaint).exclude(
        status=EightDReport.Status.CLOSED)
    n = open_reports.count()
    if not n:
        return []
    return [{"code": "open_eight_d_reports", "blocking": settings.EIGHT_D_BLOCKS_COMPLAINT_CLOSURE,
             "message": f"{n} 8D report{'s are' if n != 1 else ' is'} not closed yet."}]
