"""Per-request metadata (ip, user agent, request id) for the audit trail, without threading `request`
through every service call."""
import uuid
from contextvars import ContextVar

_ctx: ContextVar[dict] = ContextVar("request_ctx", default={})


def get_request_context() -> dict:
    return _ctx.get()


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = (request.META.get("HTTP_X_REQUEST_ID") or "")[:64] or uuid.uuid4().hex
        token = _ctx.set({
            "ip_address": request.META.get("REMOTE_ADDR") or None,
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
            "request_id": request_id,
        })
        try:
            response = self.get_response(request)
        finally:
            _ctx.reset(token)
        response["X-Request-ID"] = request_id
        return response
