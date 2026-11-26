"""Phase 3: 8D reports - structure, section rules, approval workflow, snapshots, locking, scope, isolation."""
import pytest

from apps.audit.models import ActivityLog
from apps.eight_d_reports.models import EightDReport, ReportRevision
from apps.tenants.models import Department

from .conftest import add_member, client_for, make_tenant, tenant_url

pytestmark = pytest.mark.django_db
S = "company-a"


def u(*a, **k):
    return tenant_url(S, *a, **k)


@pytest.fixture
def admin(tenant_a):
    return client_for(tenant_a[0])


@pytest.fixture
def report(tenant_a, admin):
    r = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json")
    assert r.status_code == 201, r.json()
    return r.json()


def patch_data(c, rid, key, **fields):
    cur = c.get(u("eight-d-reports", rid, f"data/{key}")).json()
    return c.patch(u("eight-d-reports", rid, f"data/{key}"), {"version": cur["version"], **fields}, format="json")


def add(c, resource, rid, **fields):
    r = c.post(u(f"eight-d-{resource}"), {"report": rid, **fields}, format="json")
    assert r.status_code == 201, r.json()
    return r.json()


def set_status(c, rid, code, status="complete"):
    return c.post(u("eight_d_reports".replace("_", "-"), rid, f"sections/{code}/status"), {"status": status}, format="json")


def fill_all(c, rid):
    """Content + 'complete' for every required section."""
    add(c, "containment-actions", rid, description="Sort suspect stock")
    patch_data(c, rid, "d4", root_cause="Worn tool")
    ca = add(c, "corrective-actions", rid, description="Replace tool", decision="selected")
    add(c, "validations", rid, description="Run 100 parts", corrective_action=ca["id"], is_effective=True)
    patch_data(c, rid, "d8", closure_summary="Fixed and verified")
    for code in ("D1", "D2", "D3", "D4", "D5", "D6", "D8"):
        r = set_status(c, rid, code)
        assert r.status_code == 200, (code, r.json())


# --- creation ----------------------------------------------------------------------------------

def test_create_seeds_structure_numbers_and_prefills_d2(tenant_a, admin, report):
    complaint = tenant_a[2]
    assert report["number"].startswith("8D-") and report["number"].endswith("00001")
    assert report["status"] == "draft" and report["revision"] == 1 and report["title"] == complaint.title
    assert [s["code"] for s in report["sections"]] == [f"D{i}" for i in range(9)]
    assert all(s["status"] == "not_started" for s in report["sections"])
    assert report["d2"]["problem_statement"] == complaint.title
    assert len(report["team_members"]) == 1 and report["team_members"][0]["is_leader"]
    assert report["completion"]["percent"] == 0 and not report["completion"]["ready_for_approval"]
    second = admin.post(u("eight-d-reports"), {"complaint": str(complaint.id)}, format="json").json()
    assert second["number"].endswith("00002")  # a complaint may have several reports
    assert "eight_d.created" in ActivityLog.objects.filter(target_id=report["id"]).values_list("action", flat=True)


def test_first_edit_moves_draft_to_in_progress(admin, report):
    assert patch_data(admin, report["id"], "d2", what="Scratches on housing").status_code == 200
    assert admin.get(u("eight-d-reports", report["id"])).json()["status"] == "in_progress"


# --- optimistic locking ------------------------------------------------------------------------

def test_stale_version_returns_409_and_missing_version_400(admin, report):
    rid = report["id"]
    v = admin.get(u("eight-d-reports", rid, "data/d2")).json()["version"]
    assert admin.patch(u("eight-d-reports", rid, "data/d2"), {"version": v, "what": "A"}, format="json").status_code == 200
    stale = admin.patch(u("eight-d-reports", rid, "data/d2"), {"version": v, "what": "B"}, format="json")
    assert stale.status_code == 409 and stale.json()["code"] == "edit_conflict"
    assert admin.patch(u("eight-d-reports", rid, "data/d2"), {"what": "C"}, format="json").status_code == 400
    row = add(admin, "containment-actions", rid, description="x")
    assert admin.patch(u("eight-d-containment-actions", row["id"]), {"version": row["version"], "scope": "WIP"},
                       format="json").status_code == 200
    assert admin.patch(u("eight-d-containment-actions", row["id"]), {"version": row["version"], "scope": "WIP2"},
                       format="json").status_code == 409


# --- section completion rules ------------------------------------------------------------------

def test_section_cannot_complete_without_minimum_content(admin, report):
    rid = report["id"]
    for code in ("D3", "D4", "D5", "D6", "D8"):
        assert set_status(admin, rid, code).status_code == 400, code
    add(admin, "containment-actions", rid, description="Contain")
    assert set_status(admin, rid, "D3").status_code == 200
    patch_data(admin, rid, "d0", formal_8d_required=False)
    assert set_status(admin, rid, "D0").status_code == 400  # needs a rationale
    patch_data(admin, rid, "d0", rationale="Minor cosmetic issue, handled by rework")
    assert set_status(admin, rid, "D0").status_code == 200


def test_d5_needs_selected_action_and_d6_needs_assessed_validation(admin, report):
    rid = report["id"]
    add(admin, "corrective-actions", rid, description="Maybe")
    assert set_status(admin, rid, "D5").status_code == 400
    add(admin, "validations", rid, description="Not assessed yet")
    assert set_status(admin, rid, "D6").status_code == 400


def test_fishbone_parent_must_be_same_report(tenant_a, admin, report):
    other = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()
    parent = add(admin, "fishbone-causes", other["id"], category="machine", cause="Spindle")
    r = admin.post(u("eight-d-fishbone-causes"),
                   {"report": report["id"], "category": "machine", "cause": "Bearing", "parent": parent["id"]},
                   format="json")
    assert r.status_code == 400
    child = add(admin, "fishbone-causes", other["id"], category="machine", cause="Bearing", parent=parent["id"])
    assert child["parent"] == parent["id"]


# --- approval workflow -------------------------------------------------------------------------

def test_request_approval_requires_required_sections(admin, report):
    r = admin.post(u("eight-d-reports", report["id"], "request-approval"), {}, format="json")
    assert r.status_code == 400 and "D1" in r.json()["message"]


def test_full_lifecycle_snapshots_locking_and_reopen(tenant_a, admin, report):
    rid = report["id"]
    fill_all(admin, rid)
    assert admin.get(u("eight-d-reports", rid)).json()["completion"]["ready_for_approval"]

    r = admin.post(u("eight-d-reports", rid, "request-approval"), {}, format="json")
    assert r.status_code == 400 and "approver" in r.json()["fields"]  # nobody designated and no Quality Manager seeded
    r = admin.post(u("eight-d-reports", rid, "request-approval"), {"approver": str(tenant_a[0].id)}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "pending_approval" and r.json()["is_locked"]
    assert patch_data(admin, rid, "d2", what="late edit").status_code == 400  # read-only while pending
    assert admin.post(u("eight-d-containment-actions"), {"report": rid, "description": "x"}, format="json").status_code == 400

    # rejection needs a comment and returns to in_progress (editable again)
    assert admin.post(u("eight-d-reports", rid, "decide"), {"decision": "rejected"}, format="json").status_code == 400
    r = admin.post(u("eight-d-reports", rid, "decide"), {"decision": "rejected", "comment": "Need more evidence"},
                   format="json")
    assert r.json()["status"] == "in_progress" and r.json()["approvals"][0]["decision"] == "rejected"
    assert patch_data(admin, rid, "d2", what="more evidence").status_code == 200

    admin.post(u("eight-d-reports", rid, "request-approval"), {}, format="json")  # approver remembered from before
    assert admin.post(u("eight-d-reports", rid, "decide"), {"decision": "approved"}, format="json").status_code == 400
    r = admin.post(u("eight-d-reports", rid, "decide"), {"decision": "approved", "signed_name": "Ann Admin"},
                   format="json")
    assert r.status_code == 200 and r.json()["status"] == "approved"
    revs = admin.get(u("eight-d-reports", rid, "revisions")).json()
    assert [(x["revision"], x["kind"]) for x in revs] == [(1, "approved")]
    snap = admin.get(u("eight-d-reports", rid, f"revisions/{revs[0]['id']}")).json()["snapshot"]
    assert snap["d4"]["root_cause"] == "Worn tool" and snap["report"]["number"] == report["number"]
    assert snap["corrective_actions"][0]["description"] == "Replace tool" and len(snap["approvals"]) == 2

    # submit -> second snapshot, then close
    assert admin.post(u("eight-d-reports", rid, "close"), {}, format="json").status_code == 400  # not submitted yet
    assert admin.post(u("eight-d-reports", rid, "submit"), {"method": "email"}, format="json").status_code == 400
    r = admin.post(u("eight-d-reports", rid, "submit"), {"method": "email", "recipient": "q@oem.example"}, format="json")
    assert r.json()["status"] == "submitted" and r.json()["submitted_to"] == "q@oem.example"
    assert admin.post(u("eight-d-reports", rid, "close"), {}, format="json").json()["status"] == "closed"
    assert ReportRevision.objects.filter(report_id=rid).count() == 2

    # the approved snapshot never changes, even after the live report is reopened and edited
    assert admin.post(u("eight-d-reports", rid, "reopen"), {}, format="json").status_code == 400  # reason required
    r = admin.post(u("eight-d-reports", rid, "reopen"), {"reason": "Customer found a recurrence"}, format="json")
    assert r.json()["status"] == "in_progress" and r.json()["revision"] == 2
    patch_data(admin, rid, "d4", root_cause="Different root cause")
    first = ReportRevision.objects.filter(report_id=rid, kind="approved").get()
    assert first.snapshot["d4"]["root_cause"] == "Worn tool"
    with pytest.raises(RuntimeError):
        first.save()
    with pytest.raises(RuntimeError):
        first.delete()
    actions = set(ActivityLog.objects.filter(target_id=rid).values_list("action", flat=True))
    assert {"eight_d.approval_requested", "eight_d.rejected", "eight_d.approved", "eight_d.submitted",
            "eight_d.closed", "eight_d.reopened"} <= actions


def test_approval_permissions_and_designated_approver(tenant_a, admin, report):
    company = tenant_a[0].company
    fill_all(admin, report["id"])
    engineer = add_member(company, "quality_engineer")
    manager = add_member(company, "quality_manager")
    admin.post(u("eight-d-reports", report["id"], "request-approval"), {"approver": str(manager.id)}, format="json")
    body = {"decision": "approved", "signed_name": "X"}
    assert client_for(engineer).post(u("eight-d-reports", report["id"], "decide"), body, format="json").status_code == 403
    # an approver is designated: even another approve-holder (the admin) cannot decide in their place
    assert admin.post(u("eight-d-reports", report["id"], "decide"), body, format="json").status_code == 403
    assert client_for(manager).post(u("eight-d-reports", report["id"], "decide"),
                                    {**body, "signed_name": "Quality Manager"}, format="json").status_code == 200
    # engineers cannot reopen; managers can
    assert client_for(engineer).post(u("eight-d-reports", report["id"], "reopen"), {"reason": "r"},
                                     format="json").status_code == 403
    assert client_for(manager).post(u("eight-d-reports", report["id"], "reopen"), {"reason": "r"},
                                    format="json").status_code == 200


def test_only_drafts_can_be_deleted(admin, report, tenant_a):
    other = admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()
    assert admin.delete(u("eight-d-reports", other["id"])).status_code == 204
    patch_data(admin, report["id"], "d2", what="started")
    assert admin.delete(u("eight-d-reports", report["id"])).status_code == 400


# --- section ownership, scope -------------------------------------------------------------------

def test_section_owner_and_assigned_scope(tenant_a, admin, report):
    company = tenant_a[0].company
    operator = add_member(company, "production_operator")
    oc = client_for(operator)
    assert oc.get(u("eight-d-reports")).status_code == 403  # operators hold no 8D permission
    # give a viewer-like 'assigned' scope via a custom role
    from apps.rbac import services as rbac
    role = rbac.create_role(company=company, name="Assigned 8D", grants=[
        {"code": "eight_d_reports.view", "scope": "assigned"}, {"code": "eight_d_reports.update", "scope": "assigned"}])
    member = add_member(company, "viewer", role=role)
    mc = client_for(member)
    assert mc.get(u("eight-d-reports")).json()["count"] == 0
    r = admin.post(u("eight-d-reports", report["id"], "sections/D3/owner"), {"owner": str(member.id)}, format="json")
    assert r.status_code == 200 and r.json()["owner_name"]
    assert mc.get(u("eight-d-reports")).json()["count"] == 1
    assert mc.get(u("eight-d-reports", report["id"])).status_code == 200
    assert add(mc, "containment-actions", report["id"], description="mine")  # may edit what they are assigned to


def test_department_scope(tenant_a, admin, report):
    company = tenant_a[0].company
    dept = Department.objects.filter(company=company).first()
    from apps.rbac import services as rbac
    role = rbac.create_role(company=company, name="Dept 8D", grants=[{"code": "eight_d_reports.view", "scope": "department"}])
    in_dept = add_member(company, "viewer", role=role, department=dept)
    assert client_for(in_dept).get(u("eight-d-reports")).json()["count"] == 0
    EightDReport.objects.filter(pk=report["id"]).update(department=dept)
    assert client_for(in_dept).get(u("eight-d-reports")).json()["count"] == 1


def test_viewer_reads_but_cannot_write(tenant_a, report):
    viewer = client_for(add_member(tenant_a[0].company, "viewer"))
    assert viewer.get(u("eight-d-reports", report["id"])).status_code == 200
    assert viewer.post(u("eight-d-containment-actions"), {"report": report["id"], "description": "x"},
                       format="json").status_code == 403
    assert viewer.patch(u("eight-d-reports", report["id"], "data/d2"), {"version": 1, "what": "x"},
                        format="json").status_code == 403
    assert viewer.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").status_code == 403


# --- comments / attachments on 8D records -------------------------------------------------------

def test_comments_on_report_and_section(admin, report):
    sec = next(s for s in report["sections"] if s["code"] == "D4")
    for target_type, target_id in (("eight_d_report", report["id"]), ("eight_d_section", sec["id"])):
        r = admin.post(u("comments"), {"target_type": target_type, "target_id": target_id, "body": "Check this"},
                       format="json")
        assert r.status_code == 201, r.json()
    assert admin.get(u("comments"), {"target_type": "eight_d_section", "target_id": sec["id"]}).json()["count"] == 1


# --- complaint closure check --------------------------------------------------------------------

def test_closing_complaint_warns_about_open_report_and_tasks(tenant_a, admin, report, settings):
    complaint = tenant_a[2]
    admin.post(u("tasks"), {"title": "Follow up", "complaint": str(complaint.id)}, format="json")
    closed = next(s for s in admin.get(u("complaint-statuses")).json() if s["category"] == "closed")
    r = admin.post(u("complaints", complaint.id, "change-status"),
                   {"status": closed["id"], "closure_comment": "done"}, format="json")
    assert r.status_code == 200
    assert {w["code"] for w in r.json()["warnings"]} == {"open_eight_d_reports", "open_tasks"}

    admin.post(u("complaints", complaint.id, "change-status"),
               {"status": next(s["id"] for s in admin.get(u("complaint-statuses")).json() if s["system_key"] == "new")},
               format="json")
    settings.EIGHT_D_BLOCKS_COMPLAINT_CLOSURE = True
    r = admin.post(u("complaints", complaint.id, "change-status"),
                   {"status": closed["id"], "closure_comment": "done"}, format="json")
    assert r.status_code == 400 and "8D" in r.json()["message"]


# --- tenant isolation ---------------------------------------------------------------------------

def test_cross_tenant_access_is_404(tenant_a, tenant_b, report):
    b = client_for(tenant_b[0])
    base = tenant_url("company-b", "eight-d-reports")
    assert b.get(f"{base}{report['id']}/").status_code == 404
    assert b.patch(f"{base}{report['id']}/data/d2/", {"version": 1}, format="json").status_code == 404
    # B cannot create a report on A's complaint, nor add rows to A's report
    assert b.post(base, {"complaint": str(tenant_a[2].id)}, format="json").status_code == 400
    r = b.post(tenant_url("company-b", "eight-d-containment-actions"),
               {"report": report["id"], "description": "x"}, format="json")
    assert r.status_code == 400
    # A's URL with B's session is not a membership
    assert b.get(u("eight-d-reports", report["id"])).status_code == 404
    assert b.get(tenant_url("company-b", "eight-d-reports")).json()["count"] == 0
