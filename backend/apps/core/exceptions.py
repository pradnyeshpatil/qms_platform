"""Uniform API error envelope (PROJECT_SPEC §23):

    {"code": "validation_error", "message": "...", "detail": "...", "fields": {"title": ["..."]}, "request_id": "..."}

`detail` repeats `message` (the pre-envelope key) so existing clients keep reading a message.
"""
from django.http import Http404
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import exception_handler as drf_exception_handler

from .context import get_request_context

GENERIC_FIELDS_MESSAGE = "Please correct the highlighted fields."


def _plain(value):
    """ErrorDetail / nested containers -> plain str / list / dict."""
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return str(value)


def _first_text(value) -> str:
    value = _plain(value)
    while isinstance(value, (list, dict)) and value:
        value = value[0] if isinstance(value, list) else next(iter(value.values()))
    return value if isinstance(value, str) else ""


def build_envelope(exc, data) -> dict:
    code = "not_found" if isinstance(exc, Http404) else getattr(exc, "default_code", "error")
    fields: dict = {}
    if isinstance(exc, ValidationError):
        code = "validation_error"
        payload = _plain(data)
        if isinstance(payload, dict):
            message = ""
            for key in ("detail", "non_field_errors"):  # service-level / cross-field errors: no field to point at
                if key in payload:
                    message = _first_text(payload.pop(key))
            fields = {k: [v] if isinstance(v, str) else v for k, v in payload.items()}
            message = message or (GENERIC_FIELDS_MESSAGE if fields else "Invalid request.")
        else:
            message = _first_text(payload) or "Invalid request."
    elif isinstance(data, dict) and "detail" in data:
        message = _first_text(data["detail"])
        code = str(data.get("code") or code)  # e.g. password_change_required, company_inactive
    else:
        message = _first_text(data) or "Request failed."
    return {"code": code, "message": message, "detail": message, "fields": fields,
            "request_id": get_request_context().get("request_id", "")}


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        response.data = build_envelope(exc, response.data)
    return response


class EditConflict(APIException):
    """Optimistic-locking failure: someone saved a newer version of the record first."""

    status_code = 409
    default_code = "edit_conflict"
    default_detail = "This record was changed by someone else. Reload it and re-apply your edit."
