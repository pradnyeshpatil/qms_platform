from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
    """Email + password."""

    def authenticate(self, request, email=None, password=None, **kwargs):
        if not email or not password:
            return None
        User = get_user_model()
        user = User.objects.filter(email__iexact=email.strip()).first()
        if user is None:
            User().set_password(password)  # equalise timing
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None


class WorkspaceUsernameBackend(ModelBackend):
    """Workspace slug + company-specific username + password (PROJECT_SPEC §4)."""

    def authenticate(self, request, workspace=None, username=None, password=None, **kwargs):
        if not workspace or not username or not password:
            return None
        from apps.tenants.models import Membership

        membership = (
            Membership.objects.select_related("user")
            .filter(company__slug=workspace.strip().lower(), username__iexact=username.strip(), status="active")
            .first()
        )
        if membership is None:
            get_user_model()().set_password(password)  # equalise timing
            return None
        user = membership.user
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
