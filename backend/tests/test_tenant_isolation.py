import pytest

from apps.complaints.models import Complaint
from apps.tenants.models import Membership


def url(slug, resource, pk=None):
    return f"/api/v1/c/{slug}/{resource}/" + (f"{pk}/" if pk else "")


@pytest.mark.django_db
class TestIsolation:
    def test_own_data_visible(self, client_a, tenant_a):
        _, customer, complaint = tenant_a
        assert client_a.get(url("company-a", "customers", customer.id)).status_code == 200
        assert client_a.get(url("company-a", "complaints", complaint.id)).status_code == 200

    def test_non_member_gets_404_on_other_company_slug(self, client_a, tenant_b):
        assert client_a.get(url("company-b", "customers")).status_code == 404
        assert client_a.get(url("company-b", "complaints")).status_code == 404
        assert client_a.get(url("company-b", "dashboard")).status_code == 404

    def test_cross_tenant_object_by_id_is_404_via_own_slug(self, client_a, tenant_b):
        _, customer_b, complaint_b = tenant_b
        for resource, obj in [("customers", customer_b), ("complaints", complaint_b)]:
            u = url("company-a", resource, obj.id)
            assert client_a.get(u).status_code == 404
            assert client_a.patch(u, {"title": "x", "name": "x"}, format="json").status_code == 404
            assert client_a.delete(u).status_code == 404
        assert Complaint.objects.filter(id=complaint_b.id, deleted_at__isnull=True).exists()

    def test_b_objects_not_in_a_lists(self, client_a, tenant_b):
        assert client_a.get(url("company-a", "customers")).json()["count"] == 1
        assert client_a.get(url("company-a", "complaints")).json()["count"] == 1

    def test_cannot_attach_complaint_to_other_tenants_customer_or_owner(self, client_a, tenant_b):
        m_b, customer_b, _ = tenant_b
        r = client_a.post(url("company-a", "complaints"), {"customer": str(customer_b.id), "title": "t"}, format="json")
        assert r.status_code == 400
        r = client_a.post(url("company-a", "complaints"), {"customer": str(customer_b.id), "title": "t", "owner": str(m_b.id)}, format="json")
        assert r.status_code == 400

    def test_client_supplied_company_id_rejected(self, client_a, tenant_a, tenant_b):
        r = client_a.post(url("company-a", "customers"), {"name": "X", "company_id": str(tenant_b[0].company_id)}, format="json")
        assert r.status_code == 400
        assert client_a.get(url("company-a", "customers") + f"?company={tenant_b[0].company_id}").status_code == 400

    def test_inactive_membership_gets_404(self, client_a, tenant_a):
        Membership.objects.filter(id=tenant_a[0].id).update(status="inactive")
        assert client_a.get(url("company-a", "customers")).status_code == 404

    def test_anonymous_rejected(self, api, tenant_a):
        assert api.get(url("company-a", "customers")).status_code in (401, 403)

    def test_dashboard_only_counts_own_company(self, client_a, tenant_b):
        assert client_a.get(url("company-a", "dashboard")).json()["total"] == 1


@pytest.mark.django_db
def test_complaint_numbering_per_company_and_crud(client_a, tenant_a):
    _, customer, first = tenant_a
    assert first.number.startswith("CMP-") and first.number.endswith("-00001")
    r = client_a.post(url("company-a", "complaints"), {"customer": str(customer.id), "title": "Second", "severity": "critical"}, format="json")
    assert r.status_code == 201 and r.json()["number"].endswith("-00002")
    assert client_a.get(url("company-a", "complaints") + "?severity=critical").json()["count"] == 1
    assert client_a.get(url("company-a", "complaints") + "?search=Second").json()["count"] == 1
    stats = client_a.get(url("company-a", "dashboard")).json()
    assert stats["total"] == 2 and stats["by_severity"]["critical"] == 1


@pytest.mark.django_db
def test_numbering_independent_across_companies(tenant_a, tenant_b):
    assert tenant_a[2].number == tenant_b[2].number  # both -00001
