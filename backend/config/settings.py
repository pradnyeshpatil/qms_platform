"""Settings, environment-driven. Split into base/dev/prod later (see PROJECT_SPEC §22)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name, default=None):
    return os.environ.get(name, default)


def env_list(name, default=""):
    return [v.strip() for v in env(name, default).split(",") if v.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-change-me")
DEBUG = env("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend,testserver")
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://localhost:8000"
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.rbac",
    "apps.tenants",
    "apps.employees",
    "apps.customers",
    "apps.complaints",
    "apps.audit",
    "apps.comments",
    "apps.attachments",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.core.context.RequestContextMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "qms"),
        "USER": env("POSTGRES_USER", "qms"),
        "PASSWORD": env("POSTGRES_PASSWORD", "qms"),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "apps.accounts.backends.EmailBackend",
    "apps.accounts.backends.WorkspaceUsernameBackend",
]
# Email is nullable-unique (partial index), so Django warns; that is intentional.
SILENCED_SYSTEM_CHECKS = ["auth.W004"]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Session cookie + CSRF (SPA is same-origin via proxy). Set SECURE flags in prod.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env("DJANGO_SECURE_COOKIES", "0") == "1"
CSRF_COOKIE_HTTPONLY = False  # SPA must read it to send X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "QMS Platform API",
    "DESCRIPTION": "Multi-tenant QMS: auth, RBAC, employees, customers, complaints.",
    "VERSION": "0.2.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Onboarding / email. Dev default prints emails to the console; set SMTP vars in production.
EMAIL_BACKEND = env("DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(env("EMAIL_PORT", "25"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env("EMAIL_USE_TLS", "0") == "1"
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "QMS Platform <no-reply@qms.local>")
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:5173")  # base of links in emails
INVITATION_TTL_DAYS = int(env("INVITATION_TTL_DAYS", "7"))
TRIAL_DAYS = int(env("TRIAL_DAYS", "14"))

# Attachments (PROJECT_SPEC §13). Local disk in dev; point STORAGES["default"] at S3/MinIO (django-storages) in prod.
MEDIA_ROOT = env("ATTACHMENT_ROOT", str(BASE_DIR / "media"))
FILE_UPLOAD_PERMISSIONS = 0o640
# ATTACHMENT_STORAGE=s3 stores files in S3 / MinIO (pip install -r requirements-s3.txt) and serves downloads through
# short-lived presigned URLs issued after the permission check. Default "local" = MEDIA_ROOT on disk.
ATTACHMENT_STORAGE = env("ATTACHMENT_STORAGE", "local")
ATTACHMENT_URL_TTL_SECONDS = int(env("ATTACHMENT_URL_TTL_SECONDS", "60"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
if ATTACHMENT_STORAGE == "s3":
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": env("S3_BUCKET", "qms-attachments"),
            "endpoint_url": env("S3_ENDPOINT_URL") or None,  # set for MinIO
            "access_key": env("S3_ACCESS_KEY"),
            "secret_key": env("S3_SECRET_KEY"),
            "region_name": env("S3_REGION", "us-east-1"),
            "signature_version": "s3v4",
            "addressing_style": env("S3_ADDRESSING_STYLE", "path"),
            "querystring_auth": True,
            "default_acl": None,  # private objects
            "file_overwrite": False,
        },
    }
ATTACHMENT_MAX_BYTES = int(env("ATTACHMENT_MAX_BYTES", str(25 * 1024 * 1024)))
ATTACHMENT_COMPANY_QUOTA_BYTES = int(env("ATTACHMENT_COMPANY_QUOTA_BYTES", str(5 * 1024 * 1024 * 1024)))
EXPORT_XLSX_MAX_ROWS = int(env("EXPORT_XLSX_MAX_ROWS", "20000"))
COMMENT_EDIT_WINDOW_MINUTES = int(env("COMMENT_EDIT_WINDOW_MINUTES", "15"))

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
