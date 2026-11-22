from django.conf import settings
from django.contrib.auth import login
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers import MeSerializer
from apps.accounts.views import OptionalSessionAuthentication
from apps.rbac.permissions import HasCompanyPermission
from apps.tenants.models import Membership

from . import services
from .serializers import (
    AcceptInvitationSerializer, EmployeeSerializer, EmployeeUpdateSerializer, InviteSerializer,
    UsernameEmployeeSerializer,
)


class EmployeeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasCompanyPermission]
    permission_map = {
        "list": "users.view", "retrieve": "users.view",
        "partial_update": "users.update", "reset_password": "users.update",
        "invite": "users.create", "create_username": "users.create",
        "resend_invitation": "users.create", "revoke_invitation": "users.create",
        "deactivate": "users.deactivate", "reactivate": "users.deactivate",
    }
    serializer_class = EmployeeSerializer
    search_fields = ["user__first_name", "user__last_name", "user__email", "username", "employee_id"]
    filterset_fields = ["status"]
    ordering_fields = ["joined_at", "created_at"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Membership.objects.none()
        return (
            Membership.objects.filter(company=self.request.company)
            .select_related("user", "role", "department", "plant")
            .prefetch_related("invitations")
            .order_by("user__first_name", "user__last_name")
        )

    def _out(self, membership, **extra):
        membership = self.get_queryset().get(pk=membership.pk)
        return {**EmployeeSerializer(membership, context=self.get_serializer_context()).data, **extra}

    # -- create ---------------------------------------------------------------------------
    @extend_schema(request=InviteSerializer, responses={201: EmployeeSerializer})
    @action(detail=False, methods=["post"])
    def invite(self, request, company_slug):
        s = InviteSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        membership, token = services.invite_employee(
            company=request.company, invited_by=request.user, **s.validated_data
        )
        extra = {"dev_invite_url": services.invite_url(token)} if settings.DEBUG else {}
        return Response(self._out(membership, **extra), status=status.HTTP_201_CREATED)

    @extend_schema(request=UsernameEmployeeSerializer, responses={201: EmployeeSerializer})
    @action(detail=False, methods=["post"], url_path="create-username")
    def create_username(self, request, company_slug):
        s = UsernameEmployeeSerializer(data=request.data, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        membership, generated = services.create_username_employee(company=request.company, **s.validated_data)
        extra = {"temporary_password": generated} if generated else {}  # shown once, never retrievable
        return Response(self._out(membership, **extra), status=status.HTTP_201_CREATED)

    # -- edit / lifecycle -----------------------------------------------------------------
    @extend_schema(request=EmployeeUpdateSerializer, responses={200: EmployeeSerializer})
    def partial_update(self, request, *args, **kwargs):
        membership = self.get_object()
        s = EmployeeUpdateSerializer(data=request.data, partial=True, context=self.get_serializer_context())
        s.is_valid(raise_exception=True)
        services.update_employee(membership, s.validated_data, request.membership)
        return Response(self._out(membership))

    @extend_schema(request=None, responses={200: EmployeeSerializer})
    @action(detail=True, methods=["post"])
    def deactivate(self, request, *args, **kwargs):
        membership = services.deactivate_employee(self.get_object(), request.membership)
        return Response(self._out(membership))

    @extend_schema(request=None, responses={200: EmployeeSerializer})
    @action(detail=True, methods=["post"])
    def reactivate(self, request, *args, **kwargs):
        return Response(self._out(services.reactivate_employee(self.get_object())))

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, *args, **kwargs):
        temp = services.reset_password(self.get_object())
        return Response({"temporary_password": temp})

    @extend_schema(request=None, responses={200: EmployeeSerializer})
    @action(detail=True, methods=["post"], url_path="resend-invitation")
    def resend_invitation(self, request, *args, **kwargs):
        membership = self.get_object()
        token = services.resend_invitation(membership, request.user)
        extra = {"dev_invite_url": services.invite_url(token)} if settings.DEBUG else {}
        return Response(self._out(membership, **extra))

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"], url_path="revoke-invitation")
    def revoke_invitation(self, request, *args, **kwargs):
        services.revoke_invitation(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationPreviewView(APIView):
    """Public: what the accept page shows for a token. Reveals nothing for a bad token."""

    authz_exempt = "public: invitation token is the credential"
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response(services.preview_invitation(request.query_params.get("token", "")))


class InvitationAcceptView(APIView):
    authz_exempt = "public: invitation token is the credential"
    permission_classes = [AllowAny]
    authentication_classes = [OptionalSessionAuthentication]

    @extend_schema(request=AcceptInvitationSerializer, responses={200: MeSerializer})
    def post(self, request):
        s = AcceptInvitationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        session_user = request.user if request.user.is_authenticated else None
        membership = services.accept_invitation(
            token=s.validated_data["token"], password=s.validated_data.get("password"), session_user=session_user
        )
        if session_user is None:
            login(request, membership.user, backend="apps.accounts.backends.EmailBackend")
        return Response(MeSerializer(membership.user).data)
