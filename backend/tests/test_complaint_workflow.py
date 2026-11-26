"""Phase 2: configurable statuses, workflow rules, assignment, duplicates, dashboard, CSV export."""
from datetime import timedelta

import pytest

from apps.audit.models import ActivityLog
from apps.complaints import services
from apps.complaints.models import Complaint, ComplaintStatus, ComplaintStatusTransition
from apps.core.utils import company_today
from apps.tenants import services as tenant_services

from .conftest import PASSWORD, add_member, client_for, make_tenant, tenant_url

pytestmark = pytest.mark.django_db


def st(company, key):
    return ComplaintStatus.objects.get(company=company, system_key=key)


def url(*a, **k):
    return tenant_url("company-a", *a, **k)


def actions(complaint):
    return list(ActivityLog.objects.filter(target_id=complaint.id).values_list("action", flat=True))


# --- seeding & status configuration ------------------------------------------------------------

def test_registration_seeds_nine_statuses_one_default_and_defect_categories(tenant_a):
    company = tenant_a[0].company
    names = list(ComplaintStatus.objects.for_company(company).values_list("name", flat=True))
    assert names == ["New", "Assigned", "Under Investigation", "Containment", "Root Cause Analysis",
                     "Corrective Action", "Awaiting Customer", "Resolved", "Closed"]
    assert ComplaintStatus.objects.for_company(company).filter(is_default=True).count() == 1
    assert tenant_a[2].status.system_key == "new"
    c = client_for(add_member(company, "viewer"))
    r = c.get(url("defect-categories"))
    assert r.status_code == 200 and {d["name"] for d in r.json()} >= {"Dimensional", "Surface finish"}


def test_everyone_reads_statuses_but_only_settings_managers_write(tenant_a):
    company = tenant_a[0].company
    viewer = client_for(add_member(company, "viewer"))
    assert viewer.get(url("complaint-statuses")).status_code == 200
    body = {"name": "Customer Testing", "category": "waiting"}
    assert viewer.post(url("complaint-statuses"), body, format="json").status_code == 403
    admin = client_for(tenant_a[0])
    r = admin.post(url("complaint-statuses"), body, format="json")
    assert r.status_code == 201 and r.json()["sort_order"] > 80
    assert admin.post(url("complaint-statuses"), {**body, "name": "customer testing"}, format="json").status_code == 400
    assert "complaint_status.created" in ActivityLog.objects.filter(company=company).values_list("action", flat=True)


def test_status_guards_default_closed_and_in_use(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    admin = client_for(tenant_a[0])
    new, closed = st(company, "new"), st(company, "closed")
    assert admin.delete(url("complaint-statuses", new.id)).status_code == 400          # default
    assert admin.patch(url("complaint-statuses", new.id), {"is_active": False}, format="json").status_code == 400
    assert admin.delete(url("complaint-statuses", closed.id)).status_code == 400       # last 'closed'
    assert admin.patch(url("complaint-statuses", closed.id), {"category": "open"}, format="json").status_code == 400
    extra = admin.post(url("complaint-statuses"), {"name": "Archived", "category": "closed"}, format="json").json()
    assert admin.patch(url("complaint-statuses", closed.id), {"category": "resolved"}, format="json").status_code == 200
    # in use -> cannot delete, can deactivate
    assigned = st(company, "assigned")
    services.change_status(complaint, assigned)
    assert admin.delete(url("complaint-statuses", assigned.id)).status_code == 400
    unused = st(company, "containment")
    assert admin.delete(url("complaint-statuses", unused.id)).status_code == 204
    assert not ComplaintStatus.objects.for_company(company).filter(id=unused.id).exists()
    assert extra["id"]


def test_changing_the_default_moves_it(tenant_a):
    company = tenant_a[0].company
    admin = client_for(tenant_a[0])
    assigned = st(company, "assigned")
    assert admin.patch(url("complaint-statuses", assigned.id), {"is_default": True}, format="json").status_code == 200
    assert ComplaintStatus.objects.for_company(company).get(is_default=True).id == assigned.id
    r = admin.post(url("complaints"), {"customer": str(tenant_a[1].id), "title": "t"}, format="json")
    assert r.json()["status_name"] == "Assigned"


def test_statuses_are_isolated_per_company(tenant_a, tenant_b):
    foreign = st(tenant_b[0].company, "closed")
    admin = client_for(tenant_a[0])
    assert admin.get(url("complaint-statuses", foreign.id)).status_code == 404
    r = admin.patch(url("complaints", tenant_a[2].id), {"status": str(foreign.id)}, format="json")
    assert r.status_code == 400
    assert Complaint.objects.get(pk=tenant_a[2].pk).status.company_id == tenant_a[0].company_id


# --- workflow rules ----------------------------------------------------------------------------

def test_closing_needs_permission_and_a_comment_and_stamps_closed_at(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    closed = st(company, "closed")
    engineer = client_for(add_member(company, "quality_engineer"))
    body = {"status": str(closed.id), "closure_comment": "Fixed"}
    assert engineer.post(url("complaints", complaint.id, "change-status"), body, format="json").status_code == 403

    admin = client_for(tenant_a[0])
    no_comment = admin.post(url("complaints", complaint.id, "change-status"), {"status": str(closed.id)}, format="json")
    assert no_comment.status_code == 400 and "closure_comment" in no_comment.json()["fields"]
    ok = admin.post(url("complaints", complaint.id, "change-status"), body, format="json")
    assert ok.status_code == 200 and ok.json()["status_category"] == "closed" and ok.json()["closed_at"]
    assert "complaint.closed" in actions(complaint)


def test_resolving_via_patch_also_needs_close_permission(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    resolved = st(company, "resolved")
    engineer = client_for(add_member(company, "quality_engineer"))
    r = engineer.patch(url("complaints", complaint.id), {"status": str(resolved.id)}, format="json")
    assert r.status_code == 403
    r = client_for(tenant_a[0]).patch(url("complaints", complaint.id), {"status": str(resolved.id)}, format="json")
    assert r.status_code == 200  # resolving needs no comment, closing does


def test_reopening_needs_permission_and_is_audited(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    admin = client_for(tenant_a[0])
    services.change_status(complaint, st(company, "closed"), closure_comment="done")
    engineer = client_for(add_member(company, "quality_engineer"))
    body = {"status": str(st(company, "under_investigation").id)}
    assert engineer.post(url("complaints", complaint.id, "change-status"), body, format="json").status_code == 403
    r = admin.post(url("complaints", complaint.id, "change-status"), body, format="json")
    assert r.status_code == 200 and r.json()["closed_at"] is None
    assert "complaint.reopened" in actions(complaint)


def test_transition_table_limits_moves_when_configured(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    new, inv, ca = st(company, "new"), st(company, "under_investigation"), st(company, "corrective_action")
    ComplaintStatusTransition.objects.create(from_status=new, to_status=inv)
    admin = client_for(tenant_a[0])
    blocked = admin.post(url("complaints", complaint.id, "change-status"), {"status": str(ca.id)}, format="json")
    assert blocked.status_code == 400 and "not allowed" in str(blocked.json())
    assert admin.post(url("complaints", complaint.id, "change-status"), {"status": str(inv.id)}, format="json").status_code == 200
    # a status with no configured transitions stays free
    assert admin.post(url("complaints", complaint.id, "change-status"), {"status": str(ca.id)}, format="json").status_code == 200


def test_transitions_can_be_configured_through_the_api(tenant_a):
    company = tenant_a[0].company
    new, inv = st(company, "new"), st(company, "under_investigation")
    admin = client_for(tenant_a[0])
    r = admin.patch(url("complaint-statuses", new.id), {"allowed_next": [str(inv.id)]}, format="json")
    assert r.status_code == 200 and r.json()["allowed_next"] == [str(inv.id)]


def test_overdue_and_open_follow_category_not_label(tenant_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    admin = client_for(tenant_a[0])
    yesterday = company_today(company) - timedelta(days=1)
    custom = admin.post(url("complaint-statuses"), {"name": "Shipped Fix", "category": "resolved"}, format="json").json()
    c = services.create_complaint(company=company, user=tenant_a[0].user,
                                  data={"customer": customer, "title": "Late", "due_date": yesterday})
    assert admin.get(url("complaints", c.id)).json()["is_overdue"] is True
    stats = admin.get(url("dashboard")).json()
    assert stats["overdue"] == 1 and stats["open"] == 2
    admin.patch(url("complaints", c.id), {"status": custom["id"]}, format="json")
    assert admin.get(url("complaints", c.id)).json()["is_overdue"] is False
    stats = admin.get(url("dashboard")).json()
    assert stats["overdue"] == 0 and stats["open"] == 1
    assert admin.get(url("complaints") + "?overdue=true").json()["count"] == 0
    assert admin.get(url("complaints") + "?open=false").json()["count"] == 1


# --- creation ----------------------------------------------------------------------------------

def test_create_sets_defaults_and_new_fields(tenant_a):
    company = tenant_a[0].company
    admin = client_for(tenant_a[0])
    cat = admin.get(url("defect-categories")).json()[0]["id"]
    r = admin.post(url("complaints"), {
        "customer": str(tenant_a[1].id), "title": "Cracked housing", "batch_number": "LOT-9",
        "quantity_affected": 40, "source": "phone", "customer_reference_number": "CUST-77",
        "defect_category": cat,
    }, format="json")
    assert r.status_code == 201
    d = r.json()
    assert d["status_name"] == "New" and d["reported_date"] == company_today(company).isoformat()
    assert d["quantity_affected"] == 40 and d["batch_number"] == "LOT-9" and d["warnings"] == []
    assert "complaint.created" in ActivityLog.objects.filter(target_id=d["id"]).values_list("action", flat=True)


def test_creating_with_an_owner_needs_assign_permission(tenant_a):
    company = tenant_a[0].company
    engineer_m = add_member(company, "quality_engineer")
    c = client_for(engineer_m)
    r = c.post(url("complaints"), {"customer": str(tenant_a[1].id), "title": "t", "owner": str(engineer_m.id)}, format="json")
    assert r.status_code == 403


def test_duplicate_warning_is_soft_and_only_for_open_complaints(tenant_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    admin = client_for(tenant_a[0])
    payload = {"customer": str(customer.id), "title": "A", "part_number": "P-1", "batch_number": "B-1"}
    first = admin.post(url("complaints"), payload, format="json").json()
    assert first["warnings"] == []
    second = admin.post(url("complaints"), {**payload, "title": "B"}, format="json")
    assert second.status_code == 201
    w = second.json()["warnings"][0]
    assert w["code"] == "possible_duplicate" and w["complaints"][0]["id"] == first["id"]
    other_batch = admin.post(url("complaints"), {**payload, "batch_number": "B-2"}, format="json").json()
    assert other_batch["warnings"] == []
    probe = admin.get(url("complaints", action="duplicates") + f"?customer={customer.id}&part_number=P-1&batch_number=B-1")
    assert len(probe.json()["results"]) == 2
    services.change_status(Complaint.objects.get(pk=first["id"]), st(company, "closed"), closure_comment="x")
    assert len(admin.get(url("complaints", action="duplicates") + f"?customer={customer.id}&part_number=P-1&batch_number=B-1").json()["results"]) == 1


# --- assignment --------------------------------------------------------------------------------

def test_assign_requires_permission_moves_new_to_assigned_and_audits(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    engineer_m = add_member(company, "quality_engineer")
    assert client_for(engineer_m).post(url("complaints", complaint.id, "assign"), {"owner": str(engineer_m.id)},
                                       format="json").status_code == 403
    admin = client_for(tenant_a[0])
    r = admin.post(url("complaints", complaint.id, "assign"), {"owner": str(engineer_m.id)}, format="json")
    assert r.status_code == 200 and r.json()["owner"] == str(engineer_m.id) and r.json()["status_name"] == "Assigned"
    entry = ActivityLog.objects.get(target_id=complaint.id, action="complaint.assigned")
    assert entry.changes["owner"]["to"] == engineer_m.display_name and entry.changes["status"]["to"] == "Assigned"
    assert admin.post(url("complaints", complaint.id, "assign"), {}, format="json").status_code == 400


def test_additional_assignees_grant_assigned_scope_access(tenant_a):
    company, complaint = tenant_a[0].company, tenant_a[2]
    operator_m = add_member(company, "production_operator")
    op = client_for(operator_m)
    assert op.get(url("complaints", complaint.id)).status_code == 404
    admin = client_for(tenant_a[0])
    r = admin.post(url("complaints", complaint.id, "assign"), {"assignees": [str(operator_m.id)]}, format="json")
    assert r.status_code == 200 and r.json()["assignees"][0]["id"] == str(operator_m.id)
    assert op.get(url("complaints", complaint.id)).status_code == 200
    assert op.get(url("complaints") + "?mine=true").json()["count"] == 1
    admin.post(url("complaints", complaint.id, "assign"), {"assignees": []}, format="json")
    assert op.get(url("complaints", complaint.id)).status_code == 404


def test_owner_is_never_also_an_additional_assignee_and_cannot_assign_across_companies(tenant_a, tenant_b):
    company, complaint = tenant_a[0].company, tenant_a[2]
    admin = client_for(tenant_a[0])
    me = tenant_a[0]
    r = admin.post(url("complaints", complaint.id, "assign"), {"owner": str(me.id), "assignees": [str(me.id)]}, format="json")
    assert r.status_code == 200 and r.json()["assignees"] == []
    foreign = tenant_b[0]
    assert admin.post(url("complaints", complaint.id, "assign"), {"owner": str(foreign.id)}, format="json").status_code == 400


# --- dashboard, filters, export ----------------------------------------------------------------

def test_dashboard_breakdowns_and_date_range(tenant_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    today = company_today(company)
    services.create_complaint(company=company, user=tenant_a[0].user, data={
        "customer": customer, "title": "Soon", "severity": "critical", "due_date": today + timedelta(days=3),
        "owner": tenant_a[0], "department": tenant_a[0].department,
    })
    old = services.create_complaint(company=company, user=tenant_a[0].user,
                                    data={"customer": customer, "title": "Old", "reported_date": today - timedelta(days=60)})
    admin = client_for(tenant_a[0])
    d = admin.get(url("dashboard")).json()
    assert d["total"] == 3 and d["by_severity"]["critical"] == 1
    assert d["by_customer"][0]["count"] == 3 and d["by_employee"][0]["count"] == 1
    assert {s["name"] for s in d["by_status"]} == {"New"}
    assert d["upcoming_deadlines"][0]["title"] == "Soon" and len(d["recent"]) == 3
    ranged = admin.get(url("dashboard") + f"?date_from={today - timedelta(days=7)}").json()
    assert ranged["total"] == 2
    assert admin.get(url("dashboard") + "?date_from=garbage").status_code == 400
    assert old.id


def test_filters_by_category_dates_and_search_by_batch(tenant_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    admin = client_for(tenant_a[0])
    c = services.create_complaint(company=company, user=tenant_a[0].user,
                                  data={"customer": customer, "title": "X", "batch_number": "LOT-ZZ-9"})
    services.change_status(c, st(company, "awaiting_customer"))
    assert admin.get(url("complaints") + "?status_category=waiting").json()["count"] == 1
    assert admin.get(url("complaints") + "?search=LOT-ZZ").json()["count"] == 1
    future = company_today(company) + timedelta(days=1)
    assert admin.get(url("complaints") + f"?reported_from={future}").json()["count"] == 0


def test_csv_export_respects_filters_scope_and_neutralises_formulas(tenant_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    services.create_complaint(company=company, user=tenant_a[0].user, data={
        "customer": customer, "title": '=HYPERLINK("http://evil","x")', "severity": "major"})
    admin = client_for(tenant_a[0])
    r = admin.get(url("complaints", action="export") + "?severity=major")
    assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
    text = b"".join(r.streaming_content).decode("utf-8-sig")
    lines = text.strip().splitlines()
    assert lines[0].startswith("Number,Title,Customer") and len(lines) == 2
    assert "'=HYPERLINK" in lines[1]
    assert ActivityLog.objects.filter(company=company, action="complaints.exported").exists()
    # an assigned-scope operator only exports their own (none here)
    op = client_for(add_member(company, "production_operator"))
    rows = b"".join(op.get(url("complaints", action="export")).streaming_content).decode("utf-8-sig").strip().splitlines()
    assert len(rows) == 1


def test_new_registration_company_is_fully_seeded_and_works(db):
    m = tenant_services.register_company(company_name="Fresh", slug="fresh-co", email="f@example.com", password=PASSWORD)
    assert ComplaintStatus.objects.for_company(m.company).count() == 9
    assert services.default_status(m.company).name == "New"
