from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Liveness + database check for load balancers and CI smoke tests."""

    authz_exempt = "public: health check"
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
        except Exception:
            return Response({"status": "error", "database": "down"}, status=503)
        return Response({"status": "ok", "database": "ok"})
