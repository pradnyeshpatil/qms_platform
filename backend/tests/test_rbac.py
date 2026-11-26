"""RBAC: seeded roles, backend enforcement, scopes, role management and lockout protection."""
import pytest
from django.urls import get_resolver

from rest_framework.exceptions import ValidationError

from apps.complaints import services as complaint_services
from apps.complaints.models import Complaint, ComplaintStatus
from apps.rbac import catalog, services as rbac_services
from apps.rbac.authorization import can, scope_queryset
from apps.rbac.models import Role
from apps.rbac.permissions import ANY_MEMBER
from apps.tenants.models import Department, Membership

from .conftest import add_member, client_for, make_tenant, role_of, tenant_url

pytestmark = pytest.mark.django_db


def dept(company, name):
    return Department.objects.get(company=company, name=name)


# --- seeding -----------------------------------------------------------------------------------

def test_registration_seeds_six_system_roles_plant_and_departments(tenant_a):
    company = tenant_a[0].company
    keys = set(Role.objects.filter(company=company, is_system=True).values_list("system_key", flat=True))
    assert keys == {"company_admin", "quality_manager", "quality_engineer", "production_supervisor",
                    "production_operator", "viewer"}
    assert set(Department.objects.filter(company=company).values_list("name", flat=True)) >= {"Quality", "Production"}
    assert tenant_a[0].plant.name == "Main Plant"
    admin_grants = role_of(company, "company_admin").grants.count()
    assert admin_grants == len(catalog.PERMISSIONS)


def test_roles_are_per_company(tenant_a, tenant_b):
    assert role_of(tenant_a[0].company, "viewer").id != role_of(tenant_b[0].company, "viewer").id


# --- backend enforcement -----------------------------------------------------------------------

def test_viewer_can_read_but_not_write(tenant_a):
    company = tenant_a[0].company
    c = client_for(add_member(company, "viewer"))
    assert c.get(tenant_url("company-a", "customers")).status_code == 200
    assert c.get(tenant_url("company-a", "complaints")).status_code == 200
    assert c.post(tenant_url("company-a", "customers"), {"name": "N"}, format="json").status_code == 403
    cust, comp = tenant_a[1], tenant_a[2]
    assert c.post(tenant_url("company-a", "complaints"), {"customer": str(cust.id), "title": "t"}, format="json").status_code == 403
    assert c.patch(tenant_url("company-a", "complaints", comp.id), {"title": "x"}, format="json").status_code == 403
    assert c.delete(tenant_url("company-a", "complaints", comp.id)).status_code == 403
    assert c.delete(tenant_url("company-a", "customers", cust.id)).status_code == 403


def test_member_without_permission_gets_403_but_non_member_gets_404(tenant_a, tenant_b):
    role = rbac_services.create_role(company=tenant_a[0].company, name="Nothing", grants=[])
    c = client_for(add_member(tenant_a[0].company, "viewer", role=role))
    assert c.get(tenant_url("company-a", "complaints")).status_code == 403
    assert c.get(tenant_url("company-a", "dashboard")).status_code == 403
    assert c.get(tenant_url("company-b", "complaints")).status_code == 404


def test_changing_a_roles_grants_takes_effect_immediately(tenant_a):
    company = tenant_a[0].company
    role = rbac_services.create_role(company=company, name="Custom", grants=[{"code": "customers.view"}])
    c = client_for(add_member(company, "viewer", role=role))
    assert c.get(tenant_url("company-a", "customers")).status_code == 200
    rbac_services.update_role(role, grants=[])
    assert c.get(tenant_url("company-a", "customers")).status_code == 403


def test_inactive_role_grants_nothing(tenant_a):
    company = tenant_a[0].company
    role = rbac_services.create_role(company=company, name="Temp", grants=[{"code": "customers.view"}])
    m = add_member(company, "viewer", role=role)
    Role.objects.filter(pk=role.pk).update(is_active=False)
    assert client_for(m).get(tenant_url("company-a", "customers")).status_code == 403


def test_assign_and_close_are_separate_permissions(tenant_a):
    company, customer, complaint = tenant_a[0].company, tenant_a[1], tenant_a[2]
    qe = add_member(company, "quality_engineer")  # has update, but not assign/close
    c = client_for(qe)
    url = tenant_url("company-a", "complaints", complaint.id)
    assert c.patch(url, {"title": "Renamed"}, format="json").status_code == 200
    assert c.patch(url, {"owner": str(qe.id)}, format="json").status_code == 403
    closed = ComplaintStatus.objects.get(company=company, system_key="closed")
    assert c.patch(url, {"status": str(closed.id), "closure_comment": "done"}, format="json").status_code == 403
    assert c.patch(url, {"status": str(ComplaintStatus.objects.get(company=company, system_key="under_investigation").id)}, format="json").status_code == 200
    qm = client_for(add_member(company, "quality_manager"))
    assert qm.patch(url, {"owner": str(qe.id)}, format="json").status_code == 200
    assert qm.patch(url, {"status": str(closed.id), "closure_comment": "done"}, format="json").status_code == 200


# --- scopes ------------------------------------------------------------------------------------

@pytest.fixture
def scoped(tenant_a):
    m_admin, customer, _ = tenant_a
    company = m_admin.company
    q, p = dept(company, "Quality"), dept(company, "Production")
    mk = lambda title, d, owner=None: complaint_services.create_complaint(
        company=company, user=m_admin.user, data={"customer": customer, "title": title, "department": d, "owner": owner})
    supervisor = add_member(company, "production_supervisor", department=p)
    operator = add_member(company, "production_operator", department=p)
    return {
        "company": company, "supervisor": supervisor, "operator": operator,
        "prod": mk("Production issue", p), "quality": mk("Quality issue", q),
        "mine": mk("Assigned to operator", p, owner=operator),
    }


def titles(resp):
    return {r["title"] for r in resp.json()["results"]}


def test_department_scope_filters_list_and_hides_other_departments(scoped):
    c = client_for(scoped["supervisor"])
    assert titles(c.get(tenant_url("company-a", "complaints"))) == {"Production issue", "Assigned to operator"}
    assert c.get(tenant_url("company-a", "complaints", scoped["prod"].id)).status_code == 200
    assert c.get(tenant_url("company-a", "complaints", scoped["quality"].id)).status_code == 404
    assert client_for(scoped["supervisor"]).get(tenant_url("company-a", "dashboard")).json()["total"] == 2


def test_assigned_scope_only_shows_own_records(scoped):
    c = client_for(scoped["operator"])
    assert titles(c.get(tenant_url("company-a", "complaints"))) == {"Assigned to operator"}
    assert c.get(tenant_url("company-a", "complaints", scoped["prod"].id)).status_code == 404
    assert c.get(tenant_url("company-a", "dashboard")).json()["total"] == 1


def test_can_with_object_honours_scope(scoped):
    sup, op = scoped["supervisor"], scoped["operator"]
    assert can(sup, "complaints.view", scoped["prod"]) is True
    assert can(sup, "complaints.view", scoped["quality"]) is False
    assert can(op, "complaints.view", scoped["mine"]) is True
    assert can(op, "complaints.view", scoped["prod"]) is False
    assert can(op, "complaints.delete") is False  # never granted


def test_non_scopable_permissions_cannot_be_department_scoped(scoped):
    role = rbac_services.create_role(company=scoped["company"], name="Custom", grants=[])
    with pytest.raises(ValidationError):
        rbac_services.update_role(role, grants=[{"code": "customers.view", "scope": "department"}])


def test_scope_fails_closed_without_a_department(scoped):
    no_dept = add_member(scoped["company"], "production_supervisor", department=None)
    qs = Complaint.objects.for_company(scoped["company"])
    assert scope_queryset(no_dept, "complaints.view", qs).count() == 0  # nothing, not everything
    assert scope_queryset(no_dept, "complaints.delete", qs).count() == 0  # permission not held


# --- role management ---------------------------------------------------------------------------

def test_only_roles_manage_can_change_roles(tenant_a):
    company = tenant_a[0].company
    manager = client_for(add_member(company, "quality_manager"))
    assert manager.get(tenant_url("company-a", "roles")).status_code == 200  # users.view
    assert manager.post(tenant_url("company-a", "roles"), {"name": "X"}, format="json").status_code == 403
    assert manager.get(tenant_url("company-a", "permissions")).status_code == 403
    viewer = client_for(add_member(company, "viewer"))
    assert viewer.get(tenant_url("company-a", "roles")).status_code == 403


def test_admin_creates_edits_and_deletes_custom_role(client_a, tenant_a):
    r = client_a.post(tenant_url("company-a", "roles"), {
        "name": "Auditor", "description": "Reads",
        "permissions": [{"code": "complaints.view", "scope": "department"}, {"code": "audit.view"}],
    }, format="json")
    assert r.status_code == 201, r.content
    rid = r.json()["id"]
    assert {(p["code"], p["scope"]) for p in r.json()["permissions"]} == {("complaints.view", "department"), ("audit.view", "all")}
    r = client_a.patch(tenant_url("company-a", "roles", rid), {"name": "Auditors", "permissions": [{"code": "audit.view"}]}, format="json")
    assert r.status_code == 200 and r.json()["name"] == "Auditors" and len(r.json()["permissions"]) == 1
    assert client_a.delete(tenant_url("company-a", "roles", rid)).status_code == 204


@pytest.mark.parametrize("payload", [
    {"name": "Bad", "permissions": [{"code": "nope.nothing"}]},
    {"name": "Bad", "permissions": [{"code": "complaints.view", "scope": "galaxy"}]},
    {"name": "Bad", "permissions": [{"code": "users.view", "scope": "department"}]},  # not scopable
    {"name": "Bad", "permissions": [{"code": "audit.view"}, {"code": "audit.view"}]},
    {"name": "viewer", "permissions": []},  # duplicate (case-insensitive) of a system role
])
def test_role_validation(client_a, payload):
    assert client_a.post(tenant_url("company-a", "roles"), payload, format="json").status_code == 400


def test_system_roles_cannot_be_deleted_and_roles_in_use_cannot_be_deleted(client_a, tenant_a):
    company = tenant_a[0].company
    viewer_role = role_of(company, "viewer")
    assert client_a.delete(tenant_url("company-a", "roles", viewer_role.id)).status_code == 400
    custom = rbac_services.create_role(company=company, name="Custom", grants=[])
    add_member(company, "viewer", role=custom)
    assert client_a.delete(tenant_url("company-a", "roles", custom.id)).status_code == 400
    assert client_a.patch(tenant_url("company-a", "roles", custom.id), {"is_active": False}, format="json").status_code == 400


def test_company_admin_role_cannot_lose_lockout_protected_permissions(client_a, tenant_a):
    admin_role = role_of(tenant_a[0].company, "company_admin")
    url = tenant_url("company-a", "roles", admin_role.id)
    without = [{"code": c} for c in catalog.PERMISSIONS if c != "roles.manage"]
    assert client_a.patch(url, {"permissions": without}, format="json").status_code == 400
    narrowed = [{"code": c, "scope": "assigned" if c == "complaints.view" else "all"} for c in catalog.PERMISSIONS]
    assert client_a.patch(url, {"permissions": narrowed}, format="json").status_code == 200  # complaints may narrow
    assert client_a.patch(url, {"is_active": False}, format="json").status_code == 400
    assert admin_role.grants.filter(permission__code="roles.manage", scope="all").exists()


def test_roles_are_tenant_isolated(client_a, tenant_a, tenant_b):
    role_b = role_of(tenant_b[0].company, "viewer")
    assert client_a.get(tenant_url("company-a", "roles", role_b.id)).status_code == 404
    assert client_a.patch(tenant_url("company-a", "roles", role_b.id), {"name": "pwn"}, format="json").status_code == 404
    assert client_a.delete(tenant_url("company-a", "roles", role_b.id)).status_code == 404
    ids = {r["id"] for r in client_a.get(tenant_url("company-a", "roles")).json()}
    assert str(role_b.id) not in ids
    Role.objects.get(pk=role_b.pk)  # untouched


# --- every endpoint declares its authorization -------------------------------------------------

def _iter_callbacks(patterns, prefix=""):
    for p in patterns:
        route = prefix + str(p.pattern)
        if hasattr(p, "url_patterns"):
            yield from _iter_callbacks(p.url_patterns, route)
        else:
            yield route, p.callback


def test_every_endpoint_declares_authorization():
    from apps.rbac.permissions import HasCompanyPermission

    checked = 0
    for route, cb in _iter_callbacks(get_resolver().url_patterns):
        cls = getattr(cb, "cls", None)
        if cls is None or not cls.__module__.startswith("apps."):
            continue
        checked += 1
        uses_rbac = HasCompanyPermission in getattr(cls, "permission_classes", [])
        if route.startswith("api/v1/c/"):
            assert uses_rbac, f"{route} ({cls.__name__}) is a tenant route without HasCompanyPermission"
        if uses_rbac:
            mapping, single = getattr(cls, "permission_map", None), getattr(cls, "required_permission", None)
            assert (mapping is None) != (single is None), f"{cls.__name__} must declare exactly one of permission_map/required_permission"
            declared = list(mapping.values()) if mapping else [single]
            for perm in declared:
                assert perm == ANY_MEMBER or perm in catalog.PERMISSIONS, f"{cls.__name__}: unknown permission {perm!r}"
            actions = getattr(cb, "actions", None)  # viewsets: every routed action needs a mapping
            if actions and mapping is not None:
                missing = set(actions.values()) - set(mapping)
                assert not missing, f"{cls.__name__} routes {missing} without a permission"
        else:
            assert getattr(cls, "authz_exempt", None), f"{route} ({cls.__name__}) is neither RBAC-protected nor marked authz_exempt"
    assert checked > 20  # guard against the walk silently finding nothing
