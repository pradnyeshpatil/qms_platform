from django.apps import AppConfig


class TasksConfig(AppConfig):
    name = "apps.tasks"

    def ready(self):
        from apps.complaints.closure import register_closure_check
        from apps.core import targets

        from .models import Task
        from .services import complaint_closure_check

        targets.register("task", Task, "tasks.view", label_field="title")
        register_closure_check(complaint_closure_check)
