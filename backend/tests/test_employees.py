"""Employee onboarding: invitations, username-only employees, lifecycle. Security-sensitive paths."""
import hashlib
from datetime import timedelta

import pytest
from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.rbac import services as rbac_services
from apps.tenants.models import Department, Invitation, Membership, Plant

from .conftest import PASSWORD, add_member, client_for, make_tenant, role_of, tenant_url

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "Another-Str0ng-Pass-4417"


@pytest.fixture(autouse=True)
def _dev_mode(settings):
    settings.DEBUG = True  # API echoes dev_invite_url so tests can obtain the one-time token
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


def token_from(resp) -> str:
    return resp.json()["dev_invite_url"].split("token=")[1]


def invite(client, company, email="new@hire.test", role_key="viewer", **extra):
    return client.post(tenant_url(company.slug, "employees", action="invite"), {
        "email": email, "first_name": "New", "last_name": "Hire", "role": str(role_of(company, role_key).id), **extra,
    }, format="json")


def accept(token, password=PASSWORD, client=None):
    return (client or APIClient()).post("/api/v1/auth/invitations/accept/", {"token": token, "password": password}, format="json")


# --- email invitations -------------------------------------------------------------------------

def test_invite_creates_pending_membership_and_sends_email(client_a, tenant_a, django_capture_on_commit_callbacks, mailoutbox):
    company = tenant_a[0].company
    with django_capture_on_commit_callbacks(execute=True):
        r = invite(client_a, company)
    assert r.status_code == 201, r.content
    body = r.json()
    assert body["status"] == "invited" and body["email"] == "new@hire.test" and body["invitation_expires_at"]
    assert len(mailoutbox) == 1 and token_from(r) in mailoutbox[0].body and mailoutbox[0].to == ["new@hire.test"]
    user = User.objects.get(email="new@hire.test")
    assert not user.has_usable_password()  # cannot sign in until the invitation is accepted


def test_token_is_hashed_at_rest_and_expires_in_seven_days(client_a, tenant_a):
    token = token_from(invite(client_a, tenant_a[0].company))
    inv = Invitation.objects.get()
    assert inv.token_hash == hashlib.sha256(token.encode()).hexdigest() and token not in inv.token_hash
    assert timedelta(days=6, hours=23) < inv.expires_at - timezone.now() <= timedelta(days=7)


def test_accept_activates_membership_signs_in_and_is_single_use(client_a, tenant_a):
    company = tenant_a[0].company
    token = token_from(invite(client_a, company))
    anon = APIClient()
    pre = anon.get(f"/api/v1/auth/invitations/preview/?token={token}")
    assert pre.status_code == 200 and pre.json()["company_name"] == company.name and pre.json()["requires_password"] is True
    assert accept(token, "123").status_code == 400  # password policy applies
    assert accept(token, "").status_code == 400
    r = accept(token, client=anon)
    assert r.status_code == 200, r.content
    assert anon.get("/api/v1/auth/me/").json()["memberships"][0]["role"]["system_key"] == "viewer"
    assert Membership.objects.get(user__email="new@hire.test").status == "active"
    assert accept(token).status_code == 400  # single use
    assert APIClient().get(f"/api/v1/auth/invitations/preview/?token={token}").status_code == 400


def test_bad_and_expired_tokens_are_rejected(client_a, tenant_a):
    token = token_from(invite(client_a, tenant_a[0].company))
    assert accept("garbage").status_code == 400
    assert APIClient().get("/api/v1/auth/invitations/preview/?token=").status_code == 400
    Invitation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert accept(token).status_code == 400
    assert Membership.objects.get(user__email="new@hire.test").status == "invited"


def test_resend_invalidates_old_token_and_revoke_withdraws_invitation(client_a, tenant_a):
    company = tenant_a[0].company
    first = invite(client_a, company)
    old, mid = token_from(first), first.json()["id"]
    r = client_a.post(tenant_url(company.slug, "employees", mid, "resend-invitation"))
    assert r.status_code == 200
    new = token_from(r)
    assert new != old and accept(old).status_code == 400
    assert client_a.post(tenant_url(company.slug, "employees", mid, "revoke-invitation")).status_code == 204
    assert accept(new).status_code == 400
    assert not Membership.objects.filter(pk=mid).exists()
    assert not User.objects.filter(email="new@hire.test").exists()  # throwaway invited-only account removed


def test_duplicate_invites_are_rejected(client_a, tenant_a):
    company = tenant_a[0].company
    assert invite(client_a, company).status_code == 201
    assert invite(client_a, company).status_code == 400  # already invited
    assert invite(client_a, company, email="A@example.com").status_code == 400  # the admin themself


def test_inviting_an_existing_user_attaches_a_membership_after_they_sign_in(client_a, tenant_a, tenant_b):
    company_a, user_b = tenant_a[0].company, tenant_b[0].user
    token = token_from(invite(client_a, company_a, email="b@example.com"))
    assert user_b.memberships.count() == 2
    assert accept(token, password="").status_code == 400  # anonymous: must sign in as that user first
    assert accept(token, client=client_for(tenant_a[0])).status_code == 400  # signed in as someone else
    assert Membership.objects.get(user=user_b, company=company_a).status == "invited"
    cb = client_for(tenant_b[0])
    assert cb.get(tenant_url("company-a", "customers")).status_code == 404  # pending => no access
    assert accept(token, password="", client=cb).status_code == 200
    assert cb.get(tenant_url("company-a", "customers")).status_code == 200
    assert user_b.check_password(PASSWORD)  # their password is untouched


def test_cannot_invite_with_another_tenants_role_department_or_plant(client_a, tenant_a, tenant_b):
    company_b = tenant_b[0].company
    base = {"email": "x@y.test", "first_name": "X", "role": str(role_of(tenant_a[0].company, "viewer").id)}
    url = tenant_url("company-a", "employees", action="invite")
    assert client_a.post(url, {**base, "role": str(role_of(company_b, "viewer").id)}, format="json").status_code == 400
    assert client_a.post(url, {**base, "department": str(Department.objects.filter(company=company_b).first().id)}, format="json").status_code == 400
    assert client_a.post(url, {**base, "plant": str(Plant.objects.filter(company=company_b).first().id)}, format="json").status_code == 400
    assert not User.objects.filter(email="x@y.test").exists()


# --- username-only employees -------------------------------------------------------------------

def create_username(client, company, username="jdoe", **extra):
    return client.post(tenant_url(company.slug, "employees", action="create-username"), {
        "first_name": "Jo", "last_name": "Doe", "username": username,
        "role": str(role_of(company, "quality_engineer").id), **extra,
    }, format="json")


def login_username(slug, username, password, client=None):
    return (client or APIClient()).post("/api/v1/auth/login/", {"workspace": slug, "username": username, "password": password}, format="json")


def test_username_employee_gets_one_time_temp_password_and_must_change_it(client_a, tenant_a):
    r = create_username(client_a, tenant_a[0].company, phone="555-0100")
    assert r.status_code == 201, r.content
    temp = r.json()["temporary_password"]
    assert r.json()["email"] is None and r.json()["must_change_password"] is True
    assert "temporary_password" not in client_a.get(tenant_url("company-a", "employees", r.json()["id"])).json()
    assert User.objects.get(memberships__username="jdoe").password.startswith("argon2")  # hashed, never stored plain

    c = APIClient()
    assert login_username("Company-A", "JDoe", temp, c).status_code == 200  # case-insensitive workspace + username
    assert c.get("/api/v1/auth/me/").json()["must_change_password"] is True
    blocked = c.get(tenant_url("company-a", "customers"))
    assert blocked.status_code == 403 and blocked.json()["code"] == "password_change_required"
    assert c.post("/api/v1/auth/change-password/", {"current_password": temp, "new_password": temp}, format="json").status_code == 400
    assert c.post("/api/v1/auth/change-password/", {"current_password": "wrong", "new_password": NEW_PASSWORD}, format="json").status_code == 400
    assert c.post("/api/v1/auth/change-password/", {"current_password": temp, "new_password": "123"}, format="json").status_code == 400
    ok = c.post("/api/v1/auth/change-password/", {"current_password": temp, "new_password": NEW_PASSWORD}, format="json")
    assert ok.status_code == 200 and ok.json()["must_change_password"] is False
    assert c.get(tenant_url("company-a", "customers")).status_code == 200  # same session survives the change
    assert login_username("company-a", "jdoe", temp).status_code == 400


def test_admin_may_type_a_password_but_policy_still_applies(client_a, tenant_a):
    company = tenant_a[0].company
    assert create_username(client_a, company, password="123").status_code == 400
    r = create_username(client_a, company, password=NEW_PASSWORD)
    assert r.status_code == 201 and "temporary_password" not in r.json()
    assert login_username("company-a", "jdoe", NEW_PASSWORD).status_code == 200


@pytest.mark.parametrize("bad", ["ab", "has space", "UPPER!", "-start"])
def test_username_format(client_a, tenant_a, bad):
    assert create_username(client_a, tenant_a[0].company, username=bad).status_code == 400


def test_usernames_are_unique_per_company_not_globally(client_a, tenant_a, tenant_b):
    assert create_username(client_a, tenant_a[0].company, "shared").status_code == 201
    assert create_username(client_a, tenant_a[0].company, "SHARED").status_code == 400
    assert create_username(client_for(tenant_b[0]), tenant_b[0].company, "shared").status_code == 201


def test_username_login_is_scoped_to_the_workspace_and_generic_on_failure(client_a, tenant_a, tenant_b):
    temp = create_username(client_a, tenant_a[0].company).json()["temporary_password"]
    bad_pw = login_username("company-a", "jdoe", "nope")
    wrong_ws = login_username("company-b", "jdoe", temp)
    no_such = login_username("company-a", "ghost", temp)
    assert bad_pw.status_code == wrong_ws.status_code == no_such.status_code == 400
    assert bad_pw.json() == wrong_ws.json() == no_such.json()  # no user/workspace enumeration
    assert APIClient().post("/api/v1/auth/login/", {"username": "jdoe", "password": temp}, format="json").status_code == 400


def test_admin_password_reset_for_username_users(client_a, tenant_a):
    company = tenant_a[0].company
    created = create_username(client_a, company).json()
    employee = Membership.objects.get(pk=created["id"])
    User.objects.filter(pk=employee.user_id).update(must_change_password=False)
    live = APIClient()
    assert login_username("company-a", "jdoe", created["temporary_password"], live).status_code == 200
    r = client_a.post(tenant_url("company-a", "employees", created["id"], "reset-password"))
    assert r.status_code == 200
    new_temp = r.json()["temporary_password"]
    assert live.get("/api/v1/auth/me/").status_code == 403  # their old session was revoked
    assert login_username("company-a", "jdoe", created["temporary_password"]).status_code == 400
    assert login_username("company-a", "jdoe", new_temp).status_code == 200
    assert User.objects.get(pk=employee.user_id).must_change_password is True
    # email accounts reset themselves; an admin never sets someone else's global password
    assert client_a.post(tenant_url("company-a", "employees", tenant_a[0].id, "reset-password")).status_code == 400


# --- lifecycle ---------------------------------------------------------------------------------

def test_deactivation_blocks_access_immediately_and_kills_sessions(client_a, tenant_a):
    company = tenant_a[0].company
    m = add_member(company, "viewer")
    c = client_for(m)
    assert c.get(tenant_url("company-a", "customers")).status_code == 200
    r = client_a.post(tenant_url("company-a", "employees", m.id, "deactivate"))
    assert r.status_code == 200 and r.json()["status"] == "inactive"
    assert c.get(tenant_url("company-a", "customers")).status_code in (401, 403)  # session already revoked
    assert login_username("company-a", m.username, PASSWORD).status_code == 400
    assert not any(s.get_decoded().get("_auth_user_id") == str(m.user_id) for s in Session.objects.all())
    assert client_a.post(tenant_url("company-a", "employees", m.id, "reactivate")).status_code == 200
    assert login_username("company-a", m.username, PASSWORD).status_code == 200


def test_cannot_deactivate_yourself_or_the_last_company_admin(client_a, tenant_a):
    company = tenant_a[0].company
    assert client_a.post(tenant_url("company-a", "employees", tenant_a[0].id, "deactivate")).status_code == 400
    helper_role = rbac_services.create_role(
        company=company, name="HR", grants=[{"code": "users.view"}, {"code": "users.deactivate"}, {"code": "users.update"}])
    hr = client_for(add_member(company, "viewer", role=helper_role))
    assert hr.post(tenant_url("company-a", "employees", tenant_a[0].id, "deactivate")).status_code == 400  # only admin
    assert hr.patch(tenant_url("company-a", "employees", tenant_a[0].id), {"role": str(role_of(company, "viewer").id)}, format="json").status_code == 400
    second = add_member(company, "company_admin")
    assert hr.post(tenant_url("company-a", "employees", second.id, "deactivate")).status_code == 200  # now fine
    assert hr.post(tenant_url("company-a", "employees", tenant_a[0].id, "deactivate")).status_code == 400  # last one again


def test_update_employee_role_department_plant(client_a, tenant_a):
    company = tenant_a[0].company
    m = add_member(company, "viewer")
    quality = Department.objects.get(company=company, name="Quality")
    r = client_a.patch(tenant_url("company-a", "employees", m.id), {
        "role": str(role_of(company, "quality_engineer").id), "department": str(quality.id),
        "employee_id": "E-100", "first_name": "Renamed", "phone": "555",
    }, format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["role"]["system_key"] == "quality_engineer" and body["department"]["name"] == "Quality"
    assert body["employee_id"] == "E-100" and body["first_name"] == "Renamed"
    other = add_member(company, "viewer")
    assert client_a.patch(tenant_url("company-a", "employees", other.id), {"employee_id": "e-100"}, format="json").status_code == 400


def test_admin_cannot_rename_a_user_who_belongs_to_other_companies(client_a, tenant_a, tenant_b):
    token = token_from(invite(client_a, tenant_a[0].company, email="b@example.com"))
    accept(token, password="", client=client_for(tenant_b[0]))
    m = Membership.objects.get(user=tenant_b[0].user, company=tenant_a[0].company)
    r = client_a.patch(tenant_url("company-a", "employees", m.id), {"first_name": "Hacked"}, format="json")
    assert r.status_code == 400
    assert User.objects.get(pk=tenant_b[0].user_id).first_name != "Hacked"


def test_employee_list_search_filter_and_pagination_shape(client_a, tenant_a):
    company = tenant_a[0].company
    add_member(company, "viewer", username="zed.viewer")
    invite(client_a, company)
    body = client_a.get(tenant_url("company-a", "employees")).json()
    assert body["count"] == 3
    assert client_a.get(tenant_url("company-a", "employees") + "?status=invited").json()["count"] == 1
    assert client_a.get(tenant_url("company-a", "employees") + "?search=zed").json()["count"] == 1


# --- permissions and tenant isolation ----------------------------------------------------------

@pytest.mark.parametrize("role_key,can_list,can_write", [
    ("viewer", False, False), ("quality_engineer", False, False), ("quality_manager", True, False), ("company_admin", True, True),
])
def test_employee_endpoints_require_user_permissions(tenant_a, role_key, can_list, can_write):
    company = tenant_a[0].company
    c = client_for(add_member(company, role_key))
    assert (c.get(tenant_url("company-a", "employees")).status_code == 200) is can_list
    assert (invite(c, company).status_code == 201) is can_write
    assert (create_username(c, company).status_code == 201) is can_write


def test_employees_are_tenant_isolated(client_a, tenant_a, tenant_b):
    mb = add_member(tenant_b[0].company, "viewer")
    assert str(mb.id) not in {e["id"] for e in client_a.get(tenant_url("company-a", "employees")).json()["results"]}
    for action in (None, "deactivate", "reactivate", "reset-password", "resend-invitation", "revoke-invitation"):
        method = client_a.get if action is None else client_a.post
        assert method(tenant_url("company-a", "employees", mb.id, action)).status_code == 404, action
    assert client_a.patch(tenant_url("company-a", "employees", mb.id), {"employee_id": "x"}, format="json").status_code == 404
    assert Membership.objects.get(pk=mb.pk).status == "active"
    assert client_a.get(tenant_url("company-b", "employees")).status_code == 404  # not a member of B


def test_client_supplied_company_is_rejected_on_employee_endpoints(client_a, tenant_a, tenant_b):
    r = client_a.post(tenant_url("company-a", "employees", action="invite"), {
        "email": "z@z.test", "first_name": "Z", "role": str(role_of(tenant_a[0].company, "viewer").id),
        "company": str(tenant_b[0].company_id)}, format="json")
    assert r.status_code == 400
