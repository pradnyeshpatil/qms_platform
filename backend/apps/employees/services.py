"""Employee onboarding and lifecycle (PROJECT_SPEC §3.4). All rules live here, not in views."""
import hashlib
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.services import revoke_user_sessions
from apps.core.permissions import BLOCKED_COMPANY_STATUSES
from apps.rbac.catalog import ADMIN_ROLE_KEY
from apps.tenants.models import Invitation, Membership

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,59}$")


# --- helpers ---------------------------------------------------------------------------------

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _check_password(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as e:
        raise ValidationError({"password": list(e.messages)})


def generate_temp_password(user=None) -> str:
    """Random, passes the configured validators. Shown once to the admin, never stored plain."""
    for _ in range(10):
        candidate = secrets.token_urlsafe(12)
        try:
            validate_password(candidate, user)
            return candidate
        except DjangoValidationError:
            continue
    raise RuntimeError("Could not generate a valid temporary password.")  # pragma: no cover


def _assert_company_keeps_admin(company, excluding: Membership):
    still_has_admin = (
        Membership.objects.filter(company=company, status="active", role__system_key=ADMIN_ROLE_KEY)
        .exclude(pk=excluding.pk).exists()
    )
    if not still_has_admin:
        raise ValidationError({"detail": "A company must keep at least one active Company Admin."})


def _check_org_refs(company, role, department, plant):
    """Defence in depth: serializers already scope these, services re-check."""
    if role is not None and (role.company_id != company.id or not role.is_active):
        raise ValidationError({"role": "Choose an active role from this company."})
    if department is not None and department.company_id != company.id:
        raise ValidationError({"department": "Choose a department from this company."})
    if plant is not None and plant.company_id != company.id:
        raise ValidationError({"plant": "Choose a plant from this company."})


# --- invitations -----------------------------------------------------------------------------

def _issue_invitation(membership: Membership, created_by) -> str:
    """Revoke older invitations, create a fresh single-use one. Returns the raw token (shown once)."""
    now = timezone.now()
    membership.invitations.filter(accepted_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
    token = secrets.token_urlsafe(32)
    Invitation.objects.create(
        membership=membership, token_hash=_hash(token), created_by=created_by,
        expires_at=now + timedelta(days=settings.INVITATION_TTL_DAYS),
    )
    return token


def invite_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/accept-invite?token={token}"


def _send_invitation_email(membership: Membership, token: str, invited_by) -> None:
    company = membership.company
    send_mail(
        subject=f"You're invited to {company.name} on QMS Platform",
        message=(
            f"Hello {membership.user.first_name or ''},\n\n"
            f"{invited_by.full_name or invited_by.email} invited you to join {company.name}.\n"
            f"Accept the invitation (valid {settings.INVITATION_TTL_DAYS} days, single use):\n"
            f"{invite_url(token)}\n"
        ),
        from_email=None,
        recipient_list=[membership.user.email],
    )


@transaction.atomic
def invite_employee(*, company, invited_by, email, first_name, last_name, role, department=None,
                    plant=None, employee_id="") -> tuple[Membership, str]:
    _check_org_refs(company, role, department, plant)
    email = email.strip().lower()
    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        existing = Membership.objects.filter(user=user, company=company).first()
        if existing is not None:
            msg = {
                "invited": "This person has already been invited. Resend the invitation instead.",
                "inactive": "This person is a deactivated employee. Reactivate them instead.",
            }.get(existing.status, "This person is already an employee.")
            raise ValidationError({"email": msg})
    else:
        user = User.objects.create_user(email=email, password=None, first_name=first_name, last_name=last_name)
    try:
        membership = Membership.objects.create(
            user=user, company=company, role=role, department=department, plant=plant,
            employee_id=employee_id, status=Membership.Status.INVITED,
        )
    except IntegrityError:
        raise ValidationError({"employee_id": "This employee ID is already in use."})
    token = _issue_invitation(membership, invited_by)
    transaction.on_commit(lambda: _send_invitation_email(membership, token, invited_by))
    return membership, token


@transaction.atomic
def resend_invitation(membership: Membership, invited_by) -> str:
    if membership.status != Membership.Status.INVITED:
        raise ValidationError({"detail": "Only pending invitations can be resent."})
    token = _issue_invitation(membership, invited_by)
    transaction.on_commit(lambda: _send_invitation_email(membership, token, invited_by))
    return token


@transaction.atomic
def revoke_invitation(membership: Membership) -> None:
    """Withdraw an unaccepted invitation: the pending membership is removed, the user kept."""
    if membership.status != Membership.Status.INVITED:
        raise ValidationError({"detail": "Only pending invitations can be revoked."})
    membership.invitations.filter(accepted_at__isnull=True, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
    user = membership.user
    membership.delete()
    # An invited-only account (no usable password, no other membership) has no reason to exist.
    if not user.has_usable_password() and not user.memberships.exists():
        user.delete()


def _get_pending_invitation(token: str) -> Invitation:
    inv = (
        Invitation.objects.select_related("membership__user", "membership__company")
        .filter(token_hash=_hash(token or "")).first()
    )
    if inv is None or not inv.is_pending or inv.membership.status != Membership.Status.INVITED:
        raise ValidationError({"detail": "This invitation is invalid or has expired."})
    if inv.membership.company.status in BLOCKED_COMPANY_STATUSES:
        raise ValidationError({"detail": "This invitation is invalid or has expired."})
    return inv


def preview_invitation(token: str) -> dict:
    inv = _get_pending_invitation(token)
    m = inv.membership
    return {
        "company_name": m.company.name, "email": m.user.email, "first_name": m.user.first_name,
        "requires_password": not m.user.has_usable_password(),
    }


@transaction.atomic
def accept_invitation(*, token: str, password: str | None, session_user) -> Membership:
    inv = _get_pending_invitation(token)
    inv = Invitation.objects.select_for_update().get(pk=inv.pk)
    if not inv.is_pending:  # raced with another accept/revoke
        raise ValidationError({"detail": "This invitation is invalid or has expired."})
    membership, user = inv.membership, inv.membership.user
    if user.has_usable_password():
        # Existing account: they must prove who they are by being signed in as that user.
        if session_user is None or session_user.pk != user.pk:
            raise ValidationError({"detail": f"Sign in as {user.email} to accept this invitation."})
    else:
        if not password:
            raise ValidationError({"password": "Choose a password to activate your account."})
        _check_password(password, user)
        user.set_password(password)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
    now = timezone.now()
    membership.status = Membership.Status.ACTIVE
    membership.joined_at = now
    membership.save(update_fields=["status", "joined_at"])
    inv.accepted_at = now
    inv.save(update_fields=["accepted_at"])
    return membership


# --- username-only employees -----------------------------------------------------------------

@transaction.atomic
def create_username_employee(*, company, first_name, last_name, username, role, phone="", password=None,
                             department=None, plant=None, employee_id="") -> tuple[Membership, str | None]:
    """Returns (membership, generated_temp_password). The temp password is None if the admin typed one."""
    _check_org_refs(company, role, department, plant)
    username = username.strip().lower()
    if not USERNAME_RE.match(username):
        raise ValidationError({"username": "Use 3-60 lowercase letters, digits, dots, hyphens or underscores."})
    if Membership.objects.filter(company=company, username__iexact=username).exists():
        raise ValidationError({"username": "This username is already taken in your company."})
    user = User(email=None, first_name=first_name, last_name=last_name, phone=phone, must_change_password=True)
    generated = None
    if password:
        _check_password(password, user)
    else:
        password = generated = generate_temp_password(user)
    user.set_password(password)
    user.save()
    try:
        membership = Membership.objects.create(
            user=user, company=company, role=role, department=department, plant=plant,
            employee_id=employee_id, username=username, status=Membership.Status.ACTIVE,
        )
    except IntegrityError:
        raise ValidationError({"employee_id": "This employee ID is already in use."})
    return membership, generated


@transaction.atomic
def reset_password(membership: Membership) -> str:
    """Admin-initiated reset for username-only accounts. Returns the new temporary password."""
    user = membership.user
    if user.email:
        raise ValidationError({"detail": "This employee signs in with email and resets their own password."})
    if membership.status != Membership.Status.ACTIVE:
        raise ValidationError({"detail": "Only active employees can have their password reset."})
    temp = generate_temp_password(user)
    user.set_password(temp)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    revoke_user_sessions(user)
    return temp


# --- edits and lifecycle -----------------------------------------------------------------------

USER_FIELDS = ("first_name", "last_name", "phone")
MEMBERSHIP_FIELDS = ("role", "department", "plant", "employee_id")


@transaction.atomic
def update_employee(membership: Membership, data: dict, acting: Membership) -> Membership:
    company, user = membership.company, membership.user
    if any(f in data for f in USER_FIELDS) and user.memberships.exclude(company=company).exists():
        raise ValidationError({"detail": "This person belongs to several companies; they manage their own profile."})
    _check_org_refs(company, data.get("role"), data.get("department"), data.get("plant"))
    new_role = data.get("role")
    if new_role is not None and new_role.id != membership.role_id and membership.role.system_key == ADMIN_ROLE_KEY:
        _assert_company_keeps_admin(company, membership)
    for f in USER_FIELDS:
        if f in data:
            setattr(user, f, data[f])
    if any(f in data for f in USER_FIELDS):
        user.save()
    for f in MEMBERSHIP_FIELDS:
        if f in data:
            setattr(membership, f, data[f])
    try:
        membership.save()
    except IntegrityError:
        raise ValidationError({"employee_id": "This employee ID is already in use."})
    return membership


@transaction.atomic
def deactivate_employee(membership: Membership, acting: Membership) -> Membership:
    if membership.pk == acting.pk:
        raise ValidationError({"detail": "You cannot deactivate your own account."})
    if membership.status != Membership.Status.ACTIVE:
        raise ValidationError({"detail": "Only active employees can be deactivated."})
    if membership.role.system_key == ADMIN_ROLE_KEY:
        _assert_company_keeps_admin(membership.company, membership)
    membership.status = Membership.Status.INACTIVE
    membership.save(update_fields=["status"])
    user = membership.user
    # Access to this company stops on the next request (membership check). If this was the user's
    # only active workplace, also end their sessions outright.
    if not user.memberships.filter(status="active").exists():
        revoke_user_sessions(user)
    return membership


@transaction.atomic
def reactivate_employee(membership: Membership) -> Membership:
    if membership.status != Membership.Status.INACTIVE:
        raise ValidationError({"detail": "Only deactivated employees can be reactivated."})
    if not membership.role.is_active:
        raise ValidationError({"detail": "Assign an active role before reactivating."})
    membership.status = Membership.Status.ACTIVE
    membership.save(update_fields=["status"])
    return membership
