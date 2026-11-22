import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.employees import services as employee_services
from apps.rbac.models import Role
from apps.complaints import services as complaint_services
from apps.customers import services as customer_services
from apps.tenants import services as tenant_services

PASSWORD = "Str0ng-Pass-9271"


def make_tenant(slug, email):
    m = tenant_services.register_company(
        company_name=f"Company {slug}", slug=slug, email=email, password=PASSWORD, first_name="Ann"
    )
    customer = customer_services.create_customer(
        company=m.company, user=m.user, data={"name": f"Customer of {slug}"}
    )
    complaint = complaint_services.create_complaint(
        company=m.company, user=m.user, data={"customer": customer, "title": f"Issue at {slug}"}
    )
    return m, customer, complaint


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def tenant_a(db):
    return make_tenant("company-a", "a@example.com")


@pytest.fixture
def tenant_b(db):
    return make_tenant("company-b", "b@example.com")


@pytest.fixture
def client_a(tenant_a):
    c = APIClient()
    c.force_login(tenant_a[0].user)
    return c


# --- helpers for RBAC / employee tests ---------------------------------------------------------

def role_of(company, key):
    return Role.objects.get(company=company, system_key=key)


def add_member(company, role_key, *, department=None, plant=None, username=None, role=None):
    """An active username-only employee with a known password and no forced change."""
    m, _ = employee_services.create_username_employee(
        company=company, first_name="Test", last_name=role_key, role=role or role_of(company, role_key),
        username=username or f"{role_key.replace('_', '-')}-{uuid.uuid4().hex[:6]}",
        password=PASSWORD, department=department, plant=plant,
    )
    User.objects.filter(pk=m.user_id).update(must_change_password=False)
    m.refresh_from_db()
    return m


def client_for(membership):
    c = APIClient()
    c.force_login(membership.user)
    return c


def tenant_url(slug, resource, pk=None, action=None):
    u = f"/api/v1/c/{slug}/{resource}/"
    if pk:
        u += f"{pk}/"
    if action:
        u += f"{action}/"
    return u
