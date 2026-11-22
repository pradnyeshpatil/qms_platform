from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync(sender, **kwargs):
    from .services import sync_permissions

    sync_permissions()


class RbacConfig(AppConfig):
    name = "apps.rbac"

    def ready(self):
        post_migrate.connect(_sync, sender=self)
