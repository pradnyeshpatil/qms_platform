"""Phase 2 leftovers: XLSX export, image thumbnails, S3 download redirect, closing-time checks."""
import io

import pytest
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import load_workbook
from PIL import Image

from apps.attachments.models import Attachment
from apps.attachments.thumbnails import MAX_SOURCE_PIXELS, make_thumbnail
from apps.audit.models import ActivityLog
from apps.complaints import closure, services
from apps.complaints.models import ComplaintStatus

from .conftest import add_member, client_for, tenant_url

pytestmark = pytest.mark.django_db


def url(*a, **k):
    return tenant_url("company-a", *a, **k)


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path / "media")


def png(size=(800, 600), mode="RGB", color="red"):
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, "PNG")
    return buf.getvalue()


def upload(client, cid, name, content):
    return client.post(url("attachments"), {"target_type": "complaint", "target_id": cid,
                                            "file": SimpleUploadedFile(name, content)}, format="multipart")


# --- XLSX export -------------------------------------------------------------------------------

def test_xlsx_export_has_headers_numbers_and_neutralised_formulas(tenant_a, client_a):
    company, customer = tenant_a[0].company, tenant_a[1]
    services.create_complaint(company=company, user=tenant_a[0].user, data={
        "customer": customer, "title": "=cmd|' /C calc'!A0", "quantity_affected": 12, "severity": "major"})
    r = client_a.get(url("complaints", action="export") + "?export_format=xlsx&severity=major")
    assert r.status_code == 200 and "spreadsheetml" in r["Content-Type"] and r["Content-Disposition"].endswith('.xlsx"')
    ws = load_workbook(io.BytesIO(r.content)).active
    rows = list(ws.values)
    assert rows[0][:3] == ("Number", "Title", "Customer") and len(rows) == 2
    assert rows[1][1] == "'=cmd|' /C calc'!A0"
    assert ws.cell(2, 2).data_type == "s"                      # never stored as a formula
    assert rows[1][headers_index(rows, "Quantity affected")] == 12
    assert ActivityLog.objects.get(action="complaints.exported").changes["format"] == "xlsx"


def headers_index(rows, name):
    return rows[0].index(name)


def test_xlsx_export_validates_format_row_cap_and_scope(tenant_a, client_a, settings):
    assert client_a.get(url("complaints", action="export") + "?export_format=pdf").status_code == 400
    settings.EXPORT_XLSX_MAX_ROWS = 0
    r = client_a.get(url("complaints", action="export") + "?export_format=xlsx")
    assert r.status_code == 400 and "csv" in str(r.json()["fields"])
    assert client_a.get(url("complaints", action="export")).status_code == 200      # csv has no cap
    settings.EXPORT_XLSX_MAX_ROWS = 100
    op = client_for(add_member(tenant_a[0].company, "production_operator"))
    ws = load_workbook(io.BytesIO(op.get(url("complaints", action="export") + "?export_format=xlsx").content)).active
    assert len(list(ws.values)) == 1                                                # header only: nothing assigned


# --- thumbnails --------------------------------------------------------------------------------

def test_image_upload_gets_a_small_jpeg_thumbnail_served_with_permission_checks(tenant_a, tenant_b, client_a):
    cid = str(tenant_a[2].id)
    d = upload(client_a, cid, "photo.png", png()).json()
    assert d["thumbnail_url"].endswith(f"/attachments/{d['id']}/thumbnail/")
    t = client_a.get(d["thumbnail_url"])
    assert t.status_code == 200 and t["Content-Type"] == "image/jpeg" and t["X-Content-Type-Options"] == "nosniff"
    thumb = Image.open(io.BytesIO(b"".join(t.streaming_content)))
    assert thumb.format == "JPEG" and max(thumb.size) == 256 and thumb.size == (256, 192)
    stored = Attachment.objects.get(pk=d["id"])
    assert "thumbs" in stored.thumbnail.name and "photo" not in stored.thumbnail.name
    # same visibility rules as the file itself
    op = client_for(add_member(tenant_a[0].company, "production_operator"))
    assert op.get(d["thumbnail_url"]).status_code == 404
    assert client_for(tenant_b[0]).get(f"/api/v1/c/company-b/attachments/{d['id']}/thumbnail/").status_code == 404


def test_non_images_have_no_thumbnail_and_transparent_pngs_flatten(tenant_a, client_a):
    cid = str(tenant_a[2].id)
    pdf = upload(client_a, cid, "a.pdf", b"%PDF-1.7\n" + b"0" * 50).json()
    assert pdf["thumbnail_url"] is None and client_a.get(url("attachments", pdf["id"], "thumbnail")).status_code == 404
    rgba = upload(client_a, cid, "t.png", png(mode="RGBA", color=(0, 0, 0, 0))).json()
    img = Image.open(io.BytesIO(b"".join(client_a.get(rgba["thumbnail_url"]).streaming_content)))
    assert img.mode == "RGB" and img.getpixel((5, 5)) == (255, 255, 255)


def test_corrupt_or_oversized_images_still_upload_without_a_thumbnail(tenant_a, client_a, monkeypatch):
    cid = str(tenant_a[2].id)
    corrupt = png()[:60]                                    # valid PNG signature, truncated body
    r = upload(client_a, cid, "broken.png", corrupt)
    assert r.status_code == 201 and r.json()["thumbnail_url"] is None
    assert make_thumbnail(SimpleUploadedFile("x.png", b"not an image")) is None
    monkeypatch.setattr("apps.attachments.thumbnails.MAX_SOURCE_PIXELS", 100)
    assert make_thumbnail(SimpleUploadedFile("big.png", png((20, 20)))) is None
    assert MAX_SOURCE_PIXELS == 50_000_000


# --- S3 / presigned downloads ------------------------------------------------------------------

def test_s3_mode_redirects_to_a_presigned_url_after_the_permission_check(tenant_a, tenant_b, client_a, settings, monkeypatch):
    cid = str(tenant_a[2].id)
    d = upload(client_a, cid, "photo.png", png()).json()
    calls = []

    def fake_url(self, name, parameters=None, expire=None):
        calls.append((name, parameters, expire))
        return f"https://s3.example.test/{name}?sig=abc"

    monkeypatch.setattr(FileSystemStorage, "url", fake_url)
    settings.ATTACHMENT_STORAGE = "s3"
    settings.ATTACHMENT_URL_TTL_SECONDS = 45
    r = client_a.get(d["download_url"])
    assert r.status_code == 302 and r["Location"].startswith("https://s3.example.test/companies/")
    name, params, expire = calls[0]
    assert expire == 45 and params["ResponseContentType"] == "image/png"
    assert params["ResponseContentDisposition"].startswith("attachment;")
    assert client_a.get(d["thumbnail_url"]).status_code == 302
    # no URL is minted for someone who may not see the record
    calls.clear()
    assert client_for(tenant_b[0]).get(f"/api/v1/c/company-b/attachments/{d['id']}/download/").status_code == 404
    assert client_for(add_member(tenant_a[0].company, "production_operator")).get(d["download_url"]).status_code == 404
    assert calls == []


# --- closing-time checks -----------------------------------------------------------------------

@pytest.fixture
def checks():
    registered = []

    def add(fn):
        registered.append(closure.register_closure_check(fn))

    yield add
    for fn in registered:
        closure.unregister_closure_check(fn)


def closed(company):
    return ComplaintStatus.objects.get(company=company, system_key="closed")


def test_non_blocking_finding_warns_but_closes_and_is_audited(tenant_a, client_a, checks):
    complaint = tenant_a[2]
    checks(lambda c: [{"code": "open_tasks", "message": "2 tasks are still open."}])
    body = {"status": str(closed(tenant_a[0].company).id), "closure_comment": "Done"}
    r = client_a.post(url("complaints", complaint.id, "change-status"), body, format="json")
    assert r.status_code == 200 and r.json()["status_category"] == "closed"
    assert r.json()["warnings"] == [{"code": "open_tasks", "message": "2 tasks are still open.", "blocking": False}]
    entry = ActivityLog.objects.get(target_id=complaint.id, action="complaint.closed")
    assert entry.changes["warnings"] == ["open_tasks"]


def test_blocking_finding_refuses_the_close_and_leaves_the_complaint_open(tenant_a, client_a, checks):
    complaint = tenant_a[2]
    checks(lambda c: [{"code": "open_8d", "message": "An 8D report is still open.", "blocking": True}])
    body = {"status": str(closed(tenant_a[0].company).id), "closure_comment": "Done"}
    r = client_a.post(url("complaints", complaint.id, "change-status"), body, format="json")
    assert r.status_code == 400 and "8D" in r.json()["message"]
    complaint.refresh_from_db()
    assert complaint.status.system_key == "new" and complaint.closed_at is None
    # resolving (not closing) is not subject to closure checks
    resolved = ComplaintStatus.objects.get(company=tenant_a[0].company, system_key="resolved")
    assert client_a.patch(url("complaints", complaint.id), {"status": str(resolved.id)}, format="json").status_code == 200


def test_patch_close_also_returns_warnings_and_no_checks_means_empty_list(tenant_a, client_a, checks):
    complaint = tenant_a[2]
    cl = str(closed(tenant_a[0].company).id)
    plain = client_a.patch(url("complaints", complaint.id), {"title": "renamed"}, format="json")
    assert plain.json()["warnings"] == []
    checks(lambda c: [{"code": "x", "message": "heads up"}])
    r = client_a.patch(url("complaints", complaint.id), {"status": cl, "closure_comment": "ok"}, format="json")
    assert r.status_code == 200 and r.json()["warnings"][0]["code"] == "x"
