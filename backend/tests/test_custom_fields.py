"""Custom fields on 8D reports: definitions, validation, section/report values, required rules, snapshots, isolation."""
import pytest

from apps.audit.models import ActivityLog
from apps.custom_fields.models import CustomFieldDefinition, CustomFieldDefinitionVersion

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db
S = "company-a"


def u(*a, **k):
    return tenant_url(S, *a, **k)


@pytest.fixture
def admin(tenant_a):
    return client_for(tenant_a[0])


@pytest.fixture
def report(tenant_a, admin):
    return admin.post(u("eight-d-reports"), {"complaint": str(tenant_a[2].id)}, format="json").json()


def define(c, **body):
    payload = {"entity_type": "eight_d_report", "key": "po_number", "label": "PO number", "field_type": "text", **body}
    return c.post(u("custom-fields"), payload, format="json")


def section(c, rid, code):
    return next(s for s in c.get(u("eight-d-reports", rid)).json()["sections"] if s["code"] == code)


def set_custom(c, rid, code, values, version=None):
    version = version if version is not None else section(c, rid, code)["version"]
    return c.post(u("eight-d-reports", rid, f"sections/{code}/custom"), {"custom_data": values, "version": version}, format="json")


# --- definitions -------------------------------------------------------------------------------

def test_admin_defines_everyone_reads_nobody_deletes(tenant_a, admin):
    r = define(admin, label="PO number")
    assert r.status_code == 201 and r.json()["version"] == 1 and r.json()["section"] == ""
    assert CustomFieldDefinitionVersion.objects.filter(definition_id=r.json()["id"]).count() == 1
    viewer = client_for(add_member(tenant_a[0].company, "viewer"))
    assert viewer.get(u("custom-fields")).json()[0]["key"] == "po_number"
    assert define(viewer, key="x1", label="X").status_code == 403
    assert admin.delete(u("custom-fields", r.json()["id"])).status_code in (403, 405)  # no delete route; fails closed
    assert "custom_field.created" in ActivityLog.objects.filter(company=tenant_a[0].company).values_list("action", flat=True)


def test_key_rules_and_uniqueness(admin):
    assert define(admin, key="Bad Key").status_code == 400
    assert define(admin, key="1abc").status_code == 400
    assert define(admin).status_code == 201
    assert define(admin).status_code == 400  # same scope + key
    assert define(admin, section="D3").status_code == 201  # same key in another section is fine


def test_choice_fields_need_valid_options(admin):
    assert define(admin, key="line", field_type="dropdown").status_code == 400
    bad = define(admin, key="line", field_type="dropdown", options=[{"value": "a", "label": "A"}, {"value": "a", "label": "B"}])
    assert bad.status_code == 400
    ok = define(admin, key="line", field_type="dropdown", options=[{"value": "l1", "label": "Line 1"}, {"value": "l2", "label": "Line 2"}])
    assert ok.status_code == 201
    assert define(admin, key="note", options=[{"value": "a", "label": "A"}]).status_code == 400  # text has no options


def test_edit_bumps_version_keeps_key_and_blocks_type_change_once_used(admin, report):
    d = define(admin).json()
    r = admin.patch(u("custom-fields", d["id"]), {"label": "Purchase order"}, format="json")
    assert r.json()["version"] == 2 and r.json()["label"] == "Purchase order"
    assert [v.version for v in CustomFieldDefinitionVersion.objects.filter(definition_id=d["id"])] == [1, 2]
    assert admin.patch(u("custom-fields", d["id"]), {"key": "other"}, format="json").status_code == 400
    assert admin.patch(u("custom-fields", d["id"]), {"section": "D2"}, format="json").status_code == 400
    assert admin.patch(u("custom-fields", d["id"]), {"field_type": "integer"}, format="json").status_code == 200  # unused yet
    admin.patch(u("custom-fields", d["id"]), {"field_type": "text"}, format="json")
    admin.patch(u("eight-d-reports", report["id"]), {"version": report["version"], "custom_data": {"po_number": "PO-1"}}, format="json")
    assert admin.patch(u("custom-fields", d["id"]), {"field_type": "integer"}, format="json").status_code == 400


# --- values: report level ----------------------------------------------------------------------

def test_report_level_values_validate_and_clear(admin, report):
    define(admin, key="po_number", field_type="text", validation={"regex": r"PO-\d+", "regex_message": "Use PO-123"})
    define(admin, key="qty", label="Qty", field_type="integer", validation={"min": 1, "max": 100})
    rid = report["id"]

    def patch(values, version):
        return admin.patch(u("eight-d-reports", rid), {"version": version, "custom_data": values}, format="json")

    bad = patch({"po_number": "nope", "qty": 0}, report["version"])
    assert bad.status_code == 400 and set(bad.json()["fields"]) == {"custom_data.po_number", "custom_data.qty"}
    assert patch({"unknown": 1}, report["version"]).status_code == 400
    ok = patch({"po_number": "PO-42", "qty": "7"}, report["version"])
    assert ok.status_code == 200 and ok.json()["custom_data"] == {"po_number": "PO-42", "qty": 7}
    assert ok.json()["custom_schema"]["po_number"]["label"] == "PO number"
    cleared = patch({"po_number": None}, ok.json()["version"])
    assert cleared.json()["custom_data"] == {"qty": 7}


def test_all_value_types(admin, report):
    opts = [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]
    for key, t, extra in [("note", "textarea", {}), ("price", "decimal", {}), ("due", "date", {}), ("pick", "dropdown", {"options": opts}),
                          ("many", "multiselect", {"options": opts}), ("flag", "checkbox", {}), ("ok", "yes_no", {})]:
        assert define(admin, key=key, label=key, field_type=t, **extra).status_code == 201, key
    good = {"note": "multi\nline", "price": "12.50", "due": "2030-02-01", "pick": "a", "many": ["a", "b", "a"], "flag": True, "ok": False}
    r = admin.patch(u("eight-d-reports", report["id"]), {"version": report["version"], "custom_data": good}, format="json")
    assert r.status_code == 200, r.json()
    assert r.json()["custom_data"] == {**good, "many": ["a", "b"]}
    for key, bad in [("price", "abc"), ("due", "31/12/2030"), ("pick", "zzz"), ("many", ["zzz"]), ("flag", "yes"), ("ok", "maybe")]:
        r2 = admin.patch(u("eight-d-reports", report["id"]), {"version": r.json()["version"], "custom_data": {key: bad}}, format="json")
        assert r2.status_code == 400, key


def test_inactive_field_keeps_old_values_but_rejects_new_ones(admin, report):
    d = define(admin).json()
    r = admin.patch(u("eight-d-reports", report["id"]), {"version": report["version"], "custom_data": {"po_number": "PO-1"}}, format="json")
    admin.patch(u("custom-fields", d["id"]), {"is_active": False}, format="json")
    again = admin.patch(u("eight-d-reports", report["id"]), {"version": r.json()["version"], "custom_data": {"po_number": "PO-2"}}, format="json")
    assert again.status_code == 400
    shown = admin.get(u("eight-d-reports", report["id"])).json()
    assert shown["custom_data"] == {"po_number": "PO-1"} and shown["custom_schema"]["po_number"]["label"] == "PO number"


# --- values: sections, required rules, snapshots -----------------------------------------------

def test_section_values_optimistic_locking_and_audit(admin, report):
    define(admin, key="line", label="Production line", section="D3")
    rid = report["id"]
    v = section(admin, rid, "D3")["version"]
    assert set_custom(admin, rid, "D3", {"line": "Line 2"}, v).status_code == 200
    assert section(admin, rid, "D3")["custom_data"] == {"line": "Line 2"}
    assert set_custom(admin, rid, "D3", {"line": "Line 3"}, v).status_code == 409  # stale
    assert set_custom(admin, rid, "D2", {"line": "x"}).status_code == 400  # field belongs to D3, not D2
    assert "eight_d.custom_fields_updated" in ActivityLog.objects.filter(target_id=rid).values_list("action", flat=True)


def test_required_section_field_blocks_completion_and_report_field_blocks_approval(tenant_a, admin, report):
    from .test_eight_d import fill_all
    rid = report["id"]
    define(admin, key="line", label="Production line", section="D3", required=True)
    define(admin, key="po_number", label="PO number", required=True)
    fill_all_resp = admin.post(u("eight-d-containment-actions"), {"report": rid, "description": "x"}, format="json")
    assert fill_all_resp.status_code == 201
    blocked = admin.post(u("eight-d-reports", rid, "sections/D3/status"), {"status": "complete"}, format="json")
    assert blocked.status_code == 400 and "Production line" in blocked.json()["message"]
    set_custom(admin, rid, "D3", {"line": "L1"})
    assert admin.post(u("eight-d-reports", rid, "sections/D3/status"), {"status": "complete"}, format="json").status_code == 200

    # finish everything else, then the report-level required field stops the approval request
    admin.patch(u("eight-d-reports", rid, "data/d4"), {"version": admin.get(u("eight-d-reports", rid, "data/d4")).json()["version"], "root_cause": "rc"}, format="json")
    admin.patch(u("eight-d-reports", rid, "data/d8"), {"version": admin.get(u("eight-d-reports", rid, "data/d8")).json()["version"], "closure_summary": "ok"}, format="json")
    ca = admin.post(u("eight-d-corrective-actions"), {"report": rid, "description": "fix", "decision": "selected"}, format="json").json()
    admin.post(u("eight-d-validations"), {"report": rid, "description": "v", "is_effective": True, "corrective_action": ca["id"]}, format="json")
    for code in ("D1", "D2", "D4", "D5", "D6", "D8"):
        assert admin.post(u("eight-d-reports", rid, f"sections/{code}/status"), {"status": "complete"}, format="json").status_code == 200, code
    r = admin.post(u("eight-d-reports", rid, "request-approval"), {"approver": str(tenant_a[0].id)}, format="json")
    assert r.status_code == 400 and "PO number" in r.json()["message"]
    cur = admin.get(u("eight-d-reports", rid)).json()
    admin.patch(u("eight-d-reports", rid), {"version": cur["version"], "custom_data": {"po_number": "PO-9"}}, format="json")
    assert admin.post(u("eight-d-reports", rid, "request-approval"), {"approver": str(tenant_a[0].id)}, format="json").status_code == 200

    # approval snapshot carries values AND the definitions they were saved under
    approved = admin.post(u("eight-d-reports", rid, "decide"), {"decision": "approved", "signed_name": "Ann"}, format="json")
    assert approved.status_code == 200
    rev = admin.get(u("eight-d-reports", rid, "revisions")).json()[0]
    snap = admin.get(u("eight-d-reports", rid, f"revisions/{rev['id']}")).json()["snapshot"]["custom_data"]
    assert snap["report"]["values"] == {"po_number": "PO-9"} and snap["report"]["schema"]["po_number"]["label"] == "PO number"
    assert snap["sections"]["D3"]["values"] == {"line": "L1"} and snap["sections"]["D3"]["schema"]["line"]["version"] == 1


def test_values_are_read_only_on_locked_reports(admin, report):
    define(admin, key="line", section="D3")
    from apps.eight_d_reports.models import EightDReport
    EightDReport.objects.filter(pk=report["id"]).update(status="approved")
    assert set_custom(admin, report["id"], "D3", {"line": "x"}).status_code == 400
    assert admin.patch(u("eight-d-reports", report["id"]), {"version": report["version"], "custom_data": {}}, format="json").status_code == 400


def test_create_report_accepts_required_defaults_and_validates(tenant_a, admin):
    define(admin, key="po_number", label="PO number", validation={"regex": r"PO-\d+"})
    c = str(tenant_a[2].id)
    assert admin.post(u("eight-d-reports"), {"complaint": c, "custom_data": {"po_number": "bad"}}, format="json").status_code == 400
    ok = admin.post(u("eight-d-reports"), {"complaint": c, "custom_data": {"po_number": "PO-7"}}, format="json")
    assert ok.status_code == 201 and ok.json()["custom_data"] == {"po_number": "PO-7"}


# --- limits, isolation --------------------------------------------------------------------------

def test_active_field_limit_per_section(admin):
    from apps.custom_fields.models import MAX_ACTIVE_PER_SCOPE
    for i in range(MAX_ACTIVE_PER_SCOPE):
        assert define(admin, key=f"f{i:02d}", label=f"F{i}", section="D5").status_code == 201
    assert define(admin, key="one_more", label="More", section="D5").status_code == 400
    assert define(admin, key="one_more", label="More", section="D6").status_code == 201


def test_cross_tenant_isolation(tenant_a, tenant_b, admin, report):
    d = define(admin).json()
    b = client_for(tenant_b[0])
    assert b.get(tenant_url("company-b", "custom-fields")).json() == []
    assert b.get(tenant_url("company-b", "custom-fields", d["id"])).status_code == 404
    assert b.patch(tenant_url("company-b", "custom-fields", d["id"]), {"label": "x"}, format="json").status_code == 404
    # same key in company B is independent
    assert b.post(tenant_url("company-b", "custom-fields"), {"entity_type": "eight_d_report", "key": "po_number", "label": "PO", "field_type": "text"}, format="json").status_code == 201
    assert CustomFieldDefinition.objects.filter(key="po_number").count() == 2
