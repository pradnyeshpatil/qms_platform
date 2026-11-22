from django.apps import apps
from django.http import Http404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission

FORBIDDEN_CLIENT_KEYS = {"company", "company_id", "tenant", "tenant_id"}
BLOCKED_COMPANY_STATUSES = {"suspended", "cancelled", "deleted_pending"}


class IsActiveCompanyMember(BasePermission):
    """Resolves {company_slug} from the URL and requires an ACTIVE membership.

    Sets request.company / request.membership. Non-members get 404 (no existence leak).
    Per-permission checks live in apps.rbac.permissions.HasCompanyPermission, which extends this.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        Membership = apps.get_model("tenants", "Membership")
        membership = (
            Membership.objects.select_related("company", "role")
            .filter(user=request.user, company__slug=view.kwargs["company_slug"], status="active")
            .first()
        )
        if membership is None:
            raise Http404
        request.membership = membership
        request.company = membership.company

        if request.user.must_change_password:
            raise PermissionDenied({"detail": "You must change your password first.", "code": "password_change_required"})
        if membership.company.status in BLOCKED_COMPANY_STATUSES:
            raise PermissionDenied({"detail": "This workspace is not active.", "code": "company_inactive"})

        supplied = FORBIDDEN_CLIENT_KEYS & (set(request.query_params) | _body_keys(request))
        if supplied:
            raise ValidationError({k: "Not accepted; the company comes from the URL." for k in supplied})
        return True


def _body_keys(request):
    data = request.data
    return set(data.keys()) if hasattr(data, "keys") else set()
