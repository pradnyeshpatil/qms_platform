"""Phase 2: audit trail, comments, attachments (generic targets, tenant isolation, scope, validation)."""
import io
import uuid
import zipfile
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.attachments.models import Attachment
from apps.attachments.validators import sanitize_filename
from apps.audit.models import ActivityLog
from apps.comments.models import Comment
from apps.complaints import services as complaint_services

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.7\n%test\n" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def url(*a, **k):
    return tenant_url("company-a", *a, **k)


def docx_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w/>")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path / "media")


@pytest.fixture
def cid(tenant_a):
    return str(tenant_a[2].id)


def upload(client, cid, name="report.pdf", content=PDF, slug="company-a", target_type="complaint", target_id=None):
    return client.post(
        tenant_url(slug, "attachments"),
        {"target_type": target_type, "target_id": target_id or cid, "file": SimpleUploadedFile(name, content)},
        format="multipart",
    )


# --- audit trail -------------------------------------------------------------------------------

def test_audit_log_is_append_only_in_model_queryset_and_database(tenant_a):
    entry = ActivityLog.objects.filter(company=tenant_a[0].company).first()
    assert entry is not None
    entry.action = "tampered"
    with pytest.raises(RuntimeError):
        entry.save()
    with pytest.raises(RuntimeError):
        entry.delete()
    with pytest.raises(RuntimeError):
        ActivityLog.objects.all().update(action="x")
    with pytest.raises(RuntimeError):
        ActivityLog.objects.all().delete()
    for sql in ("UPDATE audit_activitylog SET action = 'x'", "DELETE FROM audit_activitylog"):
        with pytest.raises(DatabaseError, match="append-only"), transaction.atomic():
            connection.cursor().execute(sql)


def test_audit_records_actor_request_metadata_and_field_diff(tenant_a, client_a, cid):
    r = client_a.patch(url("complaints", cid), {"title": "New title", "severity": "major"}, format="json",
                       HTTP_USER_AGENT="pytest-agent", HTTP_X_REQUEST_ID="req-123")
    assert r.status_code == 200 and r["X-Request-ID"] == "req-123"
    e = ActivityLog.objects.get(target_id=cid, action="complaint.updated")
    assert e.actor_user_id == tenant_a[0].user_id and e.target_label.startswith("CMP-")
    assert e.changes["title"]["to"] == "New title" and e.changes["severity"] == {"from": "minor", "to": "major"}
    assert e.user_agent == "pytest-agent" and e.request_id == "req-123" and e.ip_address


def test_no_audit_entry_for_a_noop_update(tenant_a, client_a, cid):
    before = ActivityLog.objects.count()
    client_a.patch(url("complaints", cid), {"title": tenant_a[2].title}, format="json")
    assert ActivityLog.objects.count() == before


def test_delete_is_audited(tenant_a, client_a, cid):
    assert client_a.delete(url("complaints", cid)).status_code == 204
    assert ActivityLog.objects.filter(target_id=cid, action="complaint.deleted").exists()


def test_company_audit_log_needs_audit_view_and_is_tenant_isolated(tenant_a, tenant_b, client_a):
    assert client_a.get(url("audit-log")).status_code == 200
    names = {r["target_label"] for r in client_a.get(url("audit-log")).json()["results"]}
    assert all("company-b" not in n for n in names) and tenant_a[2].number in names
    engineer = client_for(add_member(tenant_a[0].company, "quality_engineer"))
    assert engineer.get(url("audit-log")).status_code == 403
    manager = client_for(add_member(tenant_a[0].company, "quality_manager"))
    assert manager.get(url("audit-log") + "?action=complaint.created").json()["count"] == 1
    assert client_a.post(url("audit-log"), {}, format="json").status_code in (403, 405)  # read-only


def test_record_activity_follows_record_visibility(tenant_a, tenant_b, client_a, cid):
    r = client_a.get(url("activity") + f"?target_type=complaint&target_id={cid}")
    assert r.status_code == 200 and r.json()["results"][0]["action"] == "complaint.created"
    assert "ip_address" not in r.json()["results"][0]
    # no target -> 400; unknown type -> 400; other company's record -> 404
    assert client_a.get(url("activity")).status_code == 400
    assert client_a.get(url("activity") + f"?target_type=nope&target_id={cid}").status_code == 400
    assert client_a.get(url("activity") + f"?target_type=complaint&target_id={tenant_b[2].id}").status_code == 404
    # an assigned-scope operator cannot read history of a complaint they are not on
    op = client_for(add_member(tenant_a[0].company, "production_operator"))
    assert op.get(url("activity") + f"?target_type=complaint&target_id={cid}").status_code == 404


# --- comments ----------------------------------------------------------------------------------

def post_comment(client, cid, body="Looks like a tooling issue", **extra):
    return client.post(url("comments"), {"target_type": "complaint", "target_id": cid, "body": body, **extra},
                       format="json")


def test_create_and_list_comments_with_audit(tenant_a, client_a, cid):
    r = post_comment(client_a, cid)
    assert r.status_code == 201
    d = r.json()
    assert d["author"] == str(tenant_a[0].id) and d["visibility"] == "internal" and d["can_edit"] is True
    listing = client_a.get(url("comments") + f"?target_type=complaint&target_id={cid}").json()
    assert listing["count"] == 1 and listing["results"][0]["body"] == "Looks like a tooling issue"
    assert ActivityLog.objects.filter(target_id=cid, action="comment.created").exists()
    assert post_comment(client_a, cid, body="   ").status_code == 400
    assert client_a.get(url("comments")).status_code == 400


def test_comment_permissions_and_customer_visible_rule(tenant_a, cid):
    company = tenant_a[0].company
    viewer = client_for(add_member(company, "viewer"))
    assert viewer.get(url("comments") + f"?target_type=complaint&target_id={cid}").status_code == 200  # can read
    assert post_comment(viewer, cid).status_code == 403                                                # cannot write
    engineer = client_for(add_member(company, "quality_engineer"))
    assert post_comment(engineer, cid).status_code == 201
    assert post_comment(engineer, cid, visibility="customer_visible").status_code == 403
    assert post_comment(client_for(add_member(company, "quality_manager")), cid, visibility="customer_visible").status_code == 201


def test_comments_respect_target_scope_and_company(tenant_a, tenant_b, client_a, cid):
    op_m = add_member(tenant_a[0].company, "production_operator")
    op = client_for(op_m)
    assert post_comment(op, cid).status_code == 404                       # not assigned -> record invisible
    complaint_services.assign_complaint(tenant_a[2], assignees=[op_m])
    assert post_comment(op, cid).status_code == 201
    # cross-tenant target and bogus ids
    assert post_comment(client_a, str(tenant_b[2].id)).status_code == 404
    assert post_comment(client_a, "not-a-uuid").status_code == 400
    r = client_a.post(url("comments"), {"target_type": "unknown", "target_id": cid, "body": "x"}, format="json")
    assert r.status_code == 400
    # a comment id from company B is invisible from A
    other = Comment.objects.create(company=tenant_b[0].company, target_type="complaint", target_id=tenant_b[2].id,
                                   body="b", author=tenant_b[0])
    assert client_a.get(url("comments", other.id)).status_code == 404


def test_edit_window_author_only_history_and_audit(tenant_a, client_a, cid):
    company = tenant_a[0].company
    comment_id = post_comment(client_a, cid, body="v1").json()["id"]
    r = client_a.patch(url("comments", comment_id), {"body": "v2"}, format="json")
    assert r.status_code == 200 and r.json()["is_edited"] is True and r.json()["body"] == "v2"
    assert [h["previous_body"] for h in client_a.get(url("comments", comment_id, "history")).json()] == ["v1"]
    assert ActivityLog.objects.filter(target_id=cid, action="comment.edited").exists()
    manager = client_for(add_member(company, "quality_manager"))
    assert manager.patch(url("comments", comment_id), {"body": "hijack"}, format="json").status_code == 403
    Comment.objects.filter(pk=comment_id).update(created_at=timezone.now() - timedelta(minutes=16))
    late = client_a.patch(url("comments", comment_id), {"body": "v3"}, format="json")
    assert late.status_code == 400 and Comment.objects.get(pk=comment_id).body == "v2"
    assert client_a.get(url("comments", comment_id)).json()["can_edit"] is False


def test_soft_delete_by_author_or_admin_only(tenant_a, cid):
    company = tenant_a[0].company
    eng_m = add_member(company, "quality_engineer")
    eng = client_for(eng_m)
    cid_comment = post_comment(eng, cid).json()["id"]
    peer = client_for(add_member(company, "quality_manager"))
    assert peer.delete(url("comments", cid_comment)).status_code == 403
    assert client_for(tenant_a[0]).delete(url("comments", cid_comment)).status_code == 204  # settings.manage
    assert Comment.objects.get(pk=cid_comment).deleted_at is not None
    assert eng.get(url("comments") + f"?target_type=complaint&target_id={cid}").json()["count"] == 0
    assert ActivityLog.objects.filter(target_id=cid, action="comment.deleted").exists()
    own = post_comment(eng, cid).json()["id"]
    assert eng.delete(url("comments", own)).status_code == 204


# --- attachments -------------------------------------------------------------------------------

def test_upload_list_and_secure_download(tenant_a, client_a, cid):
    r = upload(client_a, cid, name="../../Inspection Report (1).pdf")
    assert r.status_code == 201, r.content
    d = r.json()
    assert d["original_name"] == "Inspection Report (1).pdf" and d["content_type"] == "application/pdf"
    assert d["size"] == len(PDF) and "file" not in d
    a = Attachment.objects.get(pk=d["id"])
    assert a.file.name.startswith(f"companies/{tenant_a[0].company_id}/complaint/")
    assert "Inspection" not in a.file.name and ".pdf" not in a.file.name  # never the filename in the key
    assert len(a.sha256) == 64
    listing = client_a.get(url("attachments") + f"?target_type=complaint&target_id={cid}").json()
    assert listing["count"] == 1
    dl = client_a.get(d["download_url"])
    assert dl.status_code == 200 and b"".join(dl.streaming_content) == PDF
    assert "attachment" in dl["Content-Disposition"] and dl["X-Content-Type-Options"] == "nosniff"
    assert dl["Content-Type"] == "application/pdf" and "no-store" in dl["Cache-Control"]
    assert ActivityLog.objects.filter(target_id=cid, action="attachment.uploaded").exists()


def test_content_must_match_extension_and_type_must_be_allowed(client_a, cid):
    assert upload(client_a, cid, "evil.pdf", b"MZ\x90\x00 not a pdf").status_code == 400      # exe as pdf
    assert upload(client_a, cid, "page.html", b"<script>alert(1)</script>").status_code == 400  # type not allowed
    assert upload(client_a, cid, "run.exe", b"MZ\x90\x00").status_code == 400
    assert upload(client_a, cid, "noext", PDF).status_code == 400
    assert upload(client_a, cid, "photo.png", PDF).status_code == 400                           # pdf bytes as png
    assert upload(client_a, cid, "notes.txt", b"\x00\x01\x02binary").status_code == 400
    assert upload(client_a, cid, "empty.pdf", b"").status_code == 400
    assert upload(client_a, cid, "fake.docx", b"PK\x03\x04garbage").status_code == 400
    assert Attachment.objects.count() == 0


def test_accepts_images_office_and_text(client_a, cid):
    assert upload(client_a, cid, "p.png", PNG).status_code == 201
    assert upload(client_a, cid, "d.docx", docx_bytes()).status_code == 201
    assert upload(client_a, cid, "n.txt", "héllo\n".encode()).status_code == 201
    assert upload(client_a, cid, "v.csv", b"a,b\n1,2\n").status_code == 201


def test_size_limit_and_company_quota(tenant_a, client_a, cid, settings):
    settings.ATTACHMENT_MAX_BYTES = 100
    assert upload(client_a, cid, "big.pdf", PDF + b"0" * 100).status_code == 400
    settings.ATTACHMENT_MAX_BYTES = 10_000
    settings.ATTACHMENT_COMPANY_QUOTA_BYTES = len(PDF) * 2 - 1
    assert upload(client_a, cid, "one.pdf").status_code == 201
    r = upload(client_a, cid, "two.pdf")
    assert r.status_code == 400 and "quota" in str(r.json())


def test_attachment_permissions_scope_and_tenant_isolation(tenant_a, tenant_b, client_a, cid):
    company = tenant_a[0].company
    viewer = client_for(add_member(company, "viewer"))
    assert upload(viewer, cid).status_code == 403                       # no attachments.upload
    d = upload(client_a, cid).json()
    assert viewer.get(d["download_url"]).status_code == 200            # may read what they can see
    op_m = add_member(company, "production_operator")
    op = client_for(op_m)
    assert op.get(d["download_url"]).status_code == 404                # record out of scope -> hidden
    assert upload(op, cid).status_code == 404
    # company B cannot reach company A's file, and cannot attach to A's complaint
    b = client_for(tenant_b[0])
    assert b.get(f"/api/v1/c/company-b/attachments/{d['id']}/download/").status_code == 404
    assert upload(b, cid, slug="company-b").status_code == 404
    assert upload(client_a, str(tenant_b[2].id)).status_code == 404    # A cannot attach to B's complaint


def test_attachment_delete_rules(tenant_a, client_a, cid):
    company = tenant_a[0].company
    eng = client_for(add_member(company, "quality_engineer"))     # uploads, cannot delete others' files
    mine = upload(eng, cid).json()
    theirs = upload(client_a, cid).json()
    assert eng.delete(url("attachments", theirs["id"])).status_code == 403
    assert eng.delete(url("attachments", mine["id"])).status_code == 204
    assert client_a.delete(url("attachments", theirs["id"])).status_code == 204
    assert Attachment.objects.get(pk=theirs["id"]).deleted_at is not None
    assert client_a.get(url("attachments", theirs["id"], "download")).status_code == 404
    assert ActivityLog.objects.filter(target_id=cid, action="attachment.deleted").count() == 2


def test_sanitize_filename():
    assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"
    assert sanitize_filename("C:\\temp\\a b.PDF") == "a b.PDF"
    assert sanitize_filename("we<ir>d\x00name?.png") == "we_ir_d_name_.png"
    assert len(sanitize_filename("x" * 400 + ".pdf")) <= 150 and sanitize_filename("x" * 400 + ".pdf").endswith(".pdf")
