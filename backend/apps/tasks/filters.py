import django_filters

from apps.core.utils import company_today

from .models import Task


class TaskFilter(django_filters.FilterSet):
    mine = django_filters.BooleanFilter(method="filter_mine", help_text="Assigned to me")
    open = django_filters.BooleanFilter(method="filter_open", help_text="true = not done/cancelled")
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    due_from = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_to = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")

    class Meta:
        model = Task
        fields = ["status", "priority", "task_type", "assignee", "complaint", "eight_d_report", "eight_d_section",
                  "department"]

    def filter_mine(self, qs, name, value):
        mine = qs.filter(assignee_id=self.request.membership.id)
        return mine if value else qs.exclude(id__in=mine.values("id"))

    def filter_open(self, qs, name, value):
        return qs.exclude(status__in=Task.FINISHED) if value else qs.filter(status__in=Task.FINISHED)

    def filter_overdue(self, qs, name, value):
        overdue = qs.filter(due_date__lt=company_today(self.request.company)).exclude(status__in=Task.FINISHED)
        return overdue if value else qs.exclude(id__in=overdue.values("id"))
