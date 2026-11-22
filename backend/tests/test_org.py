import pytest

from apps.tenants.models import Department, Plant

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db


def test_plants_and_departments_crud(client_a, tenant_a):
    r = client_a.post(tenant_url("company-a", "plants"), {"name": "North Works", "code": "NW"}, format="json")
    assert r.status_code == 201, r.content
    plant_id = r.json()["id"]
    assert client_a.post(tenant_url("company-a", "plants"), {"name": "north works"}, format="json").status_code == 400
    r = client_a.post(tenant_url("company-a", "departments"), {"name": "Paint Shop", "plant": plant_id}, format="json")
    assert r.status_code == 201 and r.json()["plant"] == plant_id
    assert client_a.post(tenant_url("company-a", "departments"), {"name": "QUALITY"}, format="json").status_code == 400
    dep_id = r.json()["id"]
    assert client_a.patch(tenant_url("company-a", "departments", dep_id), {"is_active": False}, format="json").json()["is_active"] is False
    assert client_a.delete(tenant_url("company-a", "plants", plant_id)).status_code == 400  # a department still uses it
    assert client_a.delete(tenant_url("company-a", "departments", dep_id)).status_code == 204
    assert client_a.delete(tenant_url("company-a", "plants", plant_id)).status_code == 204


def test_in_use_department_cannot_be_deleted(client_a, tenant_a):
    company = tenant_a[0].company
    quality = Department.objects.get(company=company, name="Quality")
    add_member(company, "viewer", department=quality)
    assert client_a.delete(tenant_url("company-a", "departments", quality.id)).status_code == 400


def test_any_member_reads_reference_data_but_only_managers_write(tenant_a):
    c = client_for(add_member(tenant_a[0].company, "viewer"))
    assert c.get(tenant_url("company-a", "plants")).status_code == 200
    assert c.get(tenant_url("company-a", "departments")).status_code == 200
    assert c.post(tenant_url("company-a", "plants"), {"name": "X"}, format="json").status_code == 403
    assert c.post(tenant_url("company-a", "departments"), {"name": "X"}, format="json").status_code == 403


def test_org_data_is_tenant_isolated(client_a, tenant_a, tenant_b):
    pb = Plant.objects.get(company=tenant_b[0].company)
    db = Department.objects.filter(company=tenant_b[0].company).first()
    assert client_a.get(tenant_url("company-a", "plants", pb.id)).status_code == 404
    assert client_a.patch(tenant_url("company-a", "plants", pb.id), {"name": "x"}, format="json").status_code == 404
    assert client_a.delete(tenant_url("company-a", "departments", db.id)).status_code == 404
    ids = {d["id"] for d in client_a.get(tenant_url("company-a", "departments")).json()}
    assert str(db.id) not in ids
    # cannot hang a department off another tenant's plant, nor tag a complaint with their department
    assert client_a.post(tenant_url("company-a", "departments"), {"name": "Sneaky", "plant": str(pb.id)}, format="json").status_code == 400
    cust, _ = tenant_a[1], None
    r = client_a.post(tenant_url("company-a", "complaints"), {"customer": str(cust.id), "title": "t", "department": str(db.id)}, format="json")
    assert r.status_code == 400


def test_complaint_can_be_tagged_with_own_plant_and_department(client_a, tenant_a):
    company, cust = tenant_a[0].company, tenant_a[1]
    q = Department.objects.get(company=company, name="Quality")
    r = client_a.post(tenant_url("company-a", "complaints"), {
        "customer": str(cust.id), "title": "Tagged", "department": str(q.id), "plant": str(tenant_a[0].plant_id)}, format="json")
    assert r.status_code == 201 and r.json()["department"] == str(q.id)
