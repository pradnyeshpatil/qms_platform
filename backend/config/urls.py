from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/v1/health/", HealthView.as_view()),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/auth/", include("apps.employees.urls")),
    path("api/v1/c/<slug:company_slug>/", include("config.tenant_urls")),
]
