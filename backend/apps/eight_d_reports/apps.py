from django.apps import AppConfig


class EightDReportsConfig(AppConfig):
    name = "apps.eight_d_reports"

    def ready(self):
        from apps.complaints.closure import register_closure_check
        from apps.core import targets

        from .models import EightDReport, EightDSection
        from .services import complaint_closure_check, register_task_hooks

        targets.register("eight_d_report", EightDReport, "eight_d_reports.view", label_field="number")
        targets.register("eight_d_section", EightDSection, "eight_d_reports.view")
        register_closure_check(complaint_closure_check)
        register_task_hooks()
