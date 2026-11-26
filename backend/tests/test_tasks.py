"""Phase 3: tasks - permissions, scope, links, 8D action rows -> tasks, isolation."""
import pytest

from apps.audit.models import ActivityLog
from apps.rbac import services as rbac

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db
S = "company-a"


def u(*a, **k):
    return tenant_url(S, *a, **k)


@pytest.fixture
def admin(tenant_a):
    return client_for(tenant_a[0])


def new_task(c, **body):
    r = c.post(u("tasks"), {"title": "Check gauge", **body}, format="json")
    assert r.status_code == 201, r.json()
    return r.json()


def test_create_links_complaint_and_derives_fields(tenant_a, admin):
    t = new_task(admin, complaint=str(tenant_a[2].id), priority="high", due_date="2030-01-01")
    assert t["status"] == "todo" and t["complaint_number"] == tenant_a[2].number and not t["is_overdue"]
    assert "task.created" in ActivityLog.objects.filter(target_id=t["id"]).values_list("action", flat=True)
    old = new_task(admin, due_date="2000-01-01")
    assert old["is_overdue"]
    assert admin.get(u("tasks"), {"overdue": "true"}).json()["count"] == 1


def test_section_needs_report_and_report_must_match_complaint(tenant_a, admin):
    assert admin.post(u("tasks"), {"title": "x", "eight_d_section": "D3"}, format="json").status_code == 400
    r = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()
    t = new_task(admin, eight_d_report=r["id"], eight_d_section="D4")
    assert t["complaint"] == str(tenant_a[2].id)  # derived from the report
    assert admin.post(u("tasks"), {"title": "x", "eight_d_report": r["id"], "eight_d_section": "D9"},
                      format="json").status_code == 400


def test_assigning_others_needs_permission_and_is_audited(tenant_a):
    company = tenant_a[0].company
    engineer = add_member(company, "quality_engineer")
    other = add_member(company, "production_operator")
    ec = client_for(engineer)
    assert ec.post(u("tasks"), {"title": "x", "assignee": str(other.id)}, format="json").status_code == 403
    t = ec.post(u("tasks"), {"title": "mine", "assignee": str(engineer.id)}, format="json")
    assert t.status_code == 201  # self-assignment is always fine
    boss = client_for(tenant_a[0])
    r = boss.patch(u("tasks", t.json()["id"]), {"assignee": str(other.id)}, format="json")
    assert r.status_code == 200 and r.json()["assignee"] == str(other.id)
    assert "task.reassigned" in ActivityLog.objects.filter(target_id=t.json()["id"]).values_list("action", flat=True)


def test_status_rules_complete_and_reopen(tenant_a, admin):
    company = tenant_a[0].company
    viewer = add_member(company, "viewer")
    t = new_task(admin)
    assert client_for(viewer).post(u("tasks", t["id"], "complete"), {}, format="json").status_code in (403, 404)
    r = admin.post(u("tasks", t["id"], "complete"), {"completion_notes": "Gauge OK"}, format="json")
    assert r.json()["status"] == "done" and r.json()["completed_at"] and r.json()["completion_notes"] == "Gauge OK"
    r = admin.post(u("tasks", t["id"], "change-status"), {"status": "in_progress"}, format="json")
    assert r.json()["status"] == "in_progress" and r.json()["completed_at"] is None
    assert admin.post(u("tasks", t["id"], "change-status"), {"status": "bogus"}, format="json").status_code == 400


def test_assigned_scope_only_sees_own_tasks(tenant_a, admin):
    company = tenant_a[0].company
    operator = add_member(company, "production_operator")  # tasks.* scoped to assigned
    mine = new_task(admin, assignee=str(operator.id))
    new_task(admin)
    oc = client_for(operator)
    ids = [t["id"] for t in oc.get(u("tasks")).json()["results"]]
    assert ids == [mine["id"]]
    assert oc.post(u("tasks", mine["id"], "complete"), {}, format="json").json()["status"] == "done"
    assert oc.get(u("tasks"), {"mine": "true"}).json()["count"] == 1


def test_department_scope_inherited_from_complaint(tenant_a, admin):
    from apps.tenants.models import Department
    company = tenant_a[0].company
    dept = Department.objects.filter(company=company).first()
    role = rbac.create_role(company=company, name="Dept tasks", grants=[{"code": "tasks.view", "scope": "department"}])
    member = add_member(company, "viewer", role=role, department=dept)
    complaint = tenant_a[2]
    complaint.department = dept
    complaint.save()
    t = new_task(admin, complaint=str(complaint.id))
    assert [x["id"] for x in client_for(member).get(u("tasks")).json()["results"]] == [t["id"]]


def test_action_rows_create_linked_tasks_and_sync_completion(tenant_a, admin):
    report = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()
    member = add_member(tenant_a[0].company, "quality_engineer")
    row = admin.post(u("eight-d-containment-actions"), {
        "report": report["id"], "description": "Sort stock\nall pallets", "responsible": str(member.id),
        "due_date": "2031-05-01"}, format="json").json()
    r = admin.post(u("eight-d-containment-actions", row["id"], "create-task"), {}, format="json")
    assert r.status_code == 201
    task = r.json()
    assert task["title"] == "Sort stock" and task["assignee"] == str(member.id) and task["due_date"] == "2031-05-01"
    assert task["eight_d_section"] == "D3" and task["eight_d_report"] == report["id"] and task["task_type"] == "containment"
    assert admin.post(u("eight-d-containment-actions", row["id"], "create-task"), {}, format="json").status_code == 400
    shown = admin.get(u("eight-d-containment-actions", row["id"])).json()
    assert shown["task"] == {"id": task["id"], "status": "todo"} and shown["completed_date"] is None

    admin.post(u("tasks", task["id"], "complete"), {}, format="json")
    shown = admin.get(u("eight-d-containment-actions", row["id"])).json()
    assert shown["completed_date"] is not None and shown["task"]["status"] == "done"
    admin.post(u("tasks", task["id"], "change-status"), {"status": "todo"}, format="json")
    assert admin.get(u("eight-d-containment-actions", row["id"])).json()["completed_date"] is None
    # rows that are not actions cannot spawn tasks
    team = admin.get(u("eight-d-team-members"), {"report": report["id"]}).json()["results"][0]
    assert admin.post(u("eight-d-team-members", team["id"], "create-task"), {}, format="json").status_code == 404


def test_task_completion_does_not_rewrite_a_locked_report(tenant_a, admin):
    from apps.eight_d_reports.models import D3ContainmentAction, EightDReport
    report = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()
    row = admin.post(u("eight-d-containment-actions"), {"report": report["id"], "description": "x"},
                     format="json").json()
    task = admin.post(u("eight-d-containment-actions", row["id"], "create-task"), {}, format="json").json()
    EightDReport.objects.filter(pk=report["id"]).update(status="approved")
    admin.post(u("tasks", task["id"], "complete"), {}, format="json")
    assert D3ContainmentAction.objects.get(pk=row["id"]).completed_date is None


def test_cross_tenant_isolation(tenant_a, tenant_b, admin):
    t = new_task(admin)
    b = client_for(tenant_b[0])
    base = tenant_url("company-b", "tasks")
    assert b.get(f"{base}{t['id']}/").status_code == 404
    assert b.get(base).json()["count"] == 0
    # B cannot link a task to A's complaint
    assert b.post(base, {"title": "x", "complaint": str(tenant_a[2].id)}, format="json").status_code == 400
