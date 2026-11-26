from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.rbac.authorization import can

from .hooks import notify_source
from .models import Task

UNSET = object()
AUDITED_FIELDS = {"title", "description", "task_type", "priority", "due_date", "complaint", "eight_d_report",
                  "eight_d_section"}
SECTION_CODES = {f"D{i}" for i in range(9)}


def _require(membership, permission, message):
    if membership is not None and not can(membership, permission):
        raise PermissionDenied(message)


def _resolve_links(company, data: dict) -> dict:
    """Validate/derive complaint, report, section and department so a task never straddles records."""
    report, complaint = data.get("eight_d_report"), data.get("complaint")
    if report is not None:
        if complaint is not None and complaint.pk != report.complaint_id:
            raise ValidationError({"eight_d_report": "This report belongs to a different complaint."})
        data["complaint"] = complaint = report.complaint
    section = data.get("eight_d_section", "")
    if section:
        if report is None:
            raise ValidationError({"eight_d_section": "A section needs an 8D report."})
        if section not in SECTION_CODES:
            raise ValidationError({"eight_d_section": "Use D0 to D8."})
    data["department"] = (report.department if report is not None else None) or (
        complaint.department if complaint is not None else None
    )
    return data


@transaction.atomic
def create_task(*, company, user, membership=None, data, source_type="", source_id=None) -> Task:
    data = _resolve_links(company, dict(data))
    assignee = data.get("assignee")
    if assignee is not None and (membership is None or assignee.pk != membership.pk):
        _require(membership, "tasks.assign", "You do not have permission to assign tasks to others.")
    task = Task.objects.create(company=company, created_by=user, source_type=source_type, source_id=source_id, **data)
    audit.log(company=company, user=user, action="task.created", target=task,
              changes={"assignee": {"to": assignee.display_name if assignee else None},
                       "complaint": {"to": str(task.complaint) if task.complaint_id else None}})
    return task


@transaction.atomic
def update_task(task: Task, data, *, user=None, membership=None) -> Task:
    data = dict(data)
    new_assignee = data.pop("assignee", UNSET)
    link_keys = {"complaint", "eight_d_report", "eight_d_section"} & data.keys()
    if link_keys:
        merged = {"complaint": task.complaint, "eight_d_report": task.eight_d_report,
                  "eight_d_section": task.eight_d_section, **data}
        data.update(_resolve_links(task.company, merged))
    changes = audit.diff(task, data, AUDITED_FIELDS)
    for k, v in data.items():
        setattr(task, k, v)
    reassigned = None
    if new_assignee is not UNSET and (new_assignee.pk if new_assignee else None) != task.assignee_id:
        _require(membership, "tasks.assign", "You do not have permission to assign tasks.")
        reassigned = {"assignee": {"from": task.assignee.display_name if task.assignee_id else None,
                                   "to": new_assignee.display_name if new_assignee else None}}
        task.assignee = new_assignee
    task.save()
    if changes:
        audit.log(company=task.company, user=user, action="task.updated", target=task, changes=changes)
    if reassigned:
        audit.log(company=task.company, user=user, action="task.reassigned", target=task, changes=reassigned)
    return task


@transaction.atomic
def change_status(task: Task, status: str, *, notes=None, user=None, membership=None) -> Task:
    if status not in Task.Status.values:
        raise ValidationError({"status": "Unknown status."})
    old = task.status
    if old == status:
        return task
    finishing, reopening = status in Task.FINISHED, old in Task.FINISHED and status not in Task.FINISHED
    if status == Task.Status.DONE:
        _require(membership, "tasks.complete", "You do not have permission to complete tasks.")
    if reopening:
        _require(membership, "tasks.update", "You do not have permission to reopen tasks.")
    task.status = status
    if finishing:
        task.completed_at = timezone.now()
        if notes is not None:
            task.completion_notes = notes
    elif reopening:
        task.completed_at = None
    task.save()
    action = "task.completed" if status == Task.Status.DONE else "task.reopened" if reopening else "task.status_changed"
    audit.log(company=task.company, user=user, action=action, target=task,
              changes={"status": {"from": old, "to": status}})
    notify_source(task)
    return task


@transaction.atomic
def delete_task(task: Task, *, user=None) -> None:
    task.deleted_at = timezone.now()
    task.save(update_fields=["deleted_at", "updated_at"])
    audit.log(company=task.company, user=user, action="task.deleted", target=task)


# --- complaint closure check -------------------------------------------------------------------

def complaint_closure_check(complaint) -> list[dict]:
    open_count = Task.objects.for_company(complaint.company).filter(complaint=complaint).exclude(
        status__in=Task.FINISHED).count()
    if not open_count:
        return []
    return [{"code": "open_tasks", "blocking": settings.TASKS_BLOCK_COMPLAINT_CLOSURE,
             "message": f"{open_count} task{'s are' if open_count != 1 else ' is'} still open."}]
