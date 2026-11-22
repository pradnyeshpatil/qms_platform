from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer


class CsrfOnlySessionAuthentication(SessionAuthentication):
    """For anonymous POST endpoints (login/register): enforce CSRF, authenticate nobody."""

    def authenticate(self, request):
        self.enforce_csrf(request)
        return None


class OptionalSessionAuthentication(SessionAuthentication):
    """CSRF always enforced; the session user is used when present, anonymous is allowed."""

    def authenticate(self, request):
        self.enforce_csrf(request)
        user = getattr(request._request, "user", None)
        if user is None or not user.is_authenticated or not user.is_active:
            return None
        return (user, None)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    authz_exempt = "public: issues the CSRF cookie"
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses={200: OpenApiResponse(description="Sets the csrftoken cookie")})
    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    authz_exempt = "public: authentication endpoint"
    permission_classes = [AllowAny]
    authentication_classes = [CsrfOnlySessionAuthentication]

    @extend_schema(request=LoginSerializer, responses=MeSerializer)
    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d.get("email"):
            user = authenticate(request, email=d["email"], password=d["password"])
        else:
            user = authenticate(request, workspace=d["workspace"], username=d["username"], password=d["password"])
        if user is None:  # generic message: no user enumeration
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(MeSerializer(user).data)


class LogoutView(APIView):
    authz_exempt = "any authenticated user may end their own session"
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    authz_exempt = "any authenticated user may read their own profile"
    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangePasswordView(APIView):
    authz_exempt = "any authenticated user may change their own password"

    @extend_schema(request=ChangePasswordSerializer, responses={200: MeSerializer})
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.change_password(
            request.user, current_password=s.validated_data["current_password"],
            new_password=s.validated_data["new_password"],
        )
        update_session_auth_hash(request, request.user)  # keep this session, drop nothing else
        return Response(MeSerializer(request.user).data)
