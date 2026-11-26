"""Every error response uses {code, message, detail, fields, request_id}."""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db
KEYS = {"code", "message", "detail", "fields", "request_id"}


def check(r, status, code):
    assert r.status_code == status, r.content
    body = r.json()
    assert set(body) == KEYS and body["code"] == code and body["detail"] == body["message"] and body["message"]
    return body


def test_validation_errors_put_field_messages_in_fields(tenant_a, client_a):
    r = client_a.post(tenant_url("company-a", "complaints"), {"title": ""}, format="json", HTTP_X_REQUEST_ID="rid-1")
    body = check(r, 400, "validation_error")
    assert body["fields"]["title"] and body["fields"]["customer"] and isinstance(body["fields"]["title"], list)
    assert body["message"] == "Please correct the highlighted fields." and body["request_id"] == "rid-1"


def test_service_level_validation_has_message_and_no_fields(tenant_a, client_a):
    r = client_a.delete(tenant_url("company-a", "complaint-statuses", tenant_a[2].status_id))  # the default status
    body = check(r, 400, "validation_error")
    assert body["fields"] == {} and "default" in body["message"].lower()


def test_permission_denied_not_found_and_method_not_allowed(tenant_a, tenant_b):
    viewer = client_for(add_member(tenant_a[0].company, "viewer"))
    check(viewer.post(tenant_url("company-a", "customers"), {"name": "x"}, format="json"), 403, "permission_denied")
    check(viewer.get(tenant_url("company-b", "complaints")), 404, "not_found")
    check(viewer.get(tenant_url("company-a", "complaints", "00000000-0000-0000-0000-000000000000")), 404, "not_found")
    check(client_for(tenant_a[0]).put(tenant_url("company-a", "comments", "00000000-0000-0000-0000-000000000000"), {}, format="json"),
          405, "method_not_allowed")


def test_unauthenticated_and_forced_password_change_keep_their_codes(tenant_a):
    r = APIClient().get(tenant_url("company-a", "complaints"))
    assert r.status_code in (401, 403) and set(r.json()) == KEYS
    User.objects.filter(pk=tenant_a[0].user_id).update(must_change_password=True)
    body = check(client_for(tenant_a[0]).get(tenant_url("company-a", "complaints")), 403, "password_change_required")
    assert "password" in body["message"].lower()
