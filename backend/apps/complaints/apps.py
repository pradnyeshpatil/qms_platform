from django.apps import AppConfig


class ComplaintsConfig(AppConfig):
    name = "apps.complaints"

    def ready(self):
        from apps.core import targets

        from .models import Complaint

        targets.register("complaint", Complaint, "complaints.view", label_field="number")
