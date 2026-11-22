from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework.exceptions import ValidationError


def revoke_user_sessions(user) -> int:
    """Delete every live session of `user` (Django DB sessions carry no user column, so decode).

    Fine at MVP scale; move to a session-key index on a Session subclass if volume grows.
    """
    uid = str(user.pk)
    n = 0
    for s in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if s.get_decoded().get("_auth_user_id") == uid:
            s.delete()
            n += 1
    return n


def change_password(user, *, current_password: str, new_password: str) -> None:
    if not user.check_password(current_password):
        raise ValidationError({"current_password": "Current password is incorrect."})
    if current_password == new_password:
        raise ValidationError({"new_password": "Choose a password different from the current one."})
    try:
        validate_password(new_password, user)
    except Exception as e:  # django ValidationError -> DRF
        raise ValidationError({"new_password": list(getattr(e, "messages", [str(e)]))})
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
