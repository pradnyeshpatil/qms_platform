import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenants.models import Company, Membership

from .conftest import PASSWORD

REGISTER = {
    "company_name": "Acme Machining", "company_slug": "acme", "first_name": "Ann",
    "last_name": "Admin", "email": "Ann@Acme.test", "password": PASSWORD,
}


@pytest.mark.django_db
def test_register_creates_company_user_membership_and_logs_in(api):
    r = api.post("/api/v1/auth/register/", REGISTER, format="json")
    assert r.status_code == 201, r.content
    assert Company.objects.get(slug="acme").name == "Acme Machining"
    user = User.objects.get(email="ann@acme.test")
    m = Membership.objects.get(user=user)
    assert m.role.system_key == "company_admin" and m.status == "active"
    assert api.get("/api/v1/auth/me/").json()["memberships"][0]["company"]["slug"] == "acme"


@pytest.mark.django_db
@pytest.mark.parametrize("override", [{"company_slug": "admin"}, {"company_slug": "A"}, {"password": "123"}])
def test_register_validation(api, override):
    assert api.post("/api/v1/auth/register/", {**REGISTER, **override}, format="json").status_code == 400
    assert not Company.objects.exists()


@pytest.mark.django_db
def test_register_duplicate_email_and_slug_rolls_back(api):
    assert api.post("/api/v1/auth/register/", REGISTER, format="json").status_code == 201
    dup = {**REGISTER, "company_slug": "other", "email": "ANN@acme.test"}
    assert APIClient().post("/api/v1/auth/register/", dup, format="json").status_code == 400
    assert Company.objects.count() == 1 and User.objects.count() == 1


@pytest.mark.django_db
def test_login_logout(api):
    api.post("/api/v1/auth/register/", REGISTER, format="json")
    c = APIClient()
    bad = c.post("/api/v1/auth/login/", {"email": "ann@acme.test", "password": "wrong"}, format="json")
    assert bad.status_code == 400
    assert c.get("/api/v1/auth/me/").status_code == 403
    ok = c.post("/api/v1/auth/login/", {"email": "ANN@acme.test", "password": PASSWORD}, format="json")
    assert ok.status_code == 200 and ok.json()["email"] == "ann@acme.test"
    assert c.get("/api/v1/auth/me/").status_code == 200
    assert c.post("/api/v1/auth/logout/").status_code == 204
    assert c.get("/api/v1/auth/me/").status_code == 403


@pytest.mark.django_db
def test_login_requires_csrf_token():
    c = APIClient(enforce_csrf_checks=True)
    r = c.post("/api/v1/auth/login/", {"email": "x@y.test", "password": "p"}, format="json")
    assert r.status_code == 403
    token = c.get("/api/v1/auth/csrf/").json()["csrfToken"]
    r = c.post("/api/v1/auth/login/", {"email": "x@y.test", "password": "p"}, format="json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 400  # CSRF passed; bad credentials


@pytest.mark.django_db
def test_nullable_email_allows_multiple_null_users():
    User.objects.create_user(email=None, password="x")
    User.objects.create_user(email=None, password="x")


@pytest.mark.django_db
def test_health_check_is_public():
    r = APIClient().get("/api/v1/health/")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_me_exposes_role_and_permissions_for_the_ui(client_a):
    m = client_a.get("/api/v1/auth/me/").json()["memberships"][0]
    assert m["role"]["system_key"] == "company_admin"
    assert m["permissions"]["roles.manage"] == "all" and "complaints.view" in m["permissions"]


@pytest.mark.django_db
def test_login_requires_email_or_workspace_and_username(api):
    assert api.post("/api/v1/auth/login/", {"password": "x"}, format="json").status_code == 400
    assert api.post("/api/v1/auth/login/", {"workspace": "acme", "password": "x"}, format="json").status_code == 400


@pytest.mark.django_db
def test_suspended_company_is_blocked(client_a, tenant_a):
    Company.objects.filter(pk=tenant_a[0].company_id).update(status="suspended")
    r = client_a.get("/api/v1/c/company-a/customers/")
    assert r.status_code == 403 and r.json()["code"] == "company_inactive"
