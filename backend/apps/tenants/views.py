from django.contrib.auth import login
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers import MeSerializer
from apps.accounts.views import CsrfOnlySessionAuthentication

from . import services
from .serializers import RegisterSerializer


class RegisterView(APIView):
    authz_exempt = "public: company registration"
    permission_classes = [AllowAny]
    authentication_classes = [CsrfOnlySessionAuthentication]

    @extend_schema(request=RegisterSerializer, responses={201: MeSerializer})
    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        membership = services.register_company(
            company_name=d["company_name"], slug=d["company_slug"], email=d["email"],
            password=d["password"], first_name=d["first_name"], last_name=d["last_name"],
        )
        login(request, membership.user, backend="apps.accounts.backends.EmailBackend")
        return Response(MeSerializer(membership.user).data, status=status.HTTP_201_CREATED)
