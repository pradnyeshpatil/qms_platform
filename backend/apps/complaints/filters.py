import django_filters

from apps.core.utils import company_today

from .models import Complaint, ComplaintStatus


class ComplaintFilter(django_filters.FilterSet):
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    open = django_filters.BooleanFilter(method="filter_open", help_text="true = not resolved/closed")
    mine = django_filters.BooleanFilter(method="filter_mine", help_text="I am the owner or an assignee")
    status_category = django_filters.CharFilter(field_name="status__category")
    reported_from = django_filters.DateFilter(field_name="reported_date", lookup_expr="gte")
    reported_to = django_filters.DateFilter(field_name="reported_date", lookup_expr="lte")
    due_from = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_to = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")

    class Meta:
        model = Complaint
        fields = ["status", "severity", "customer", "owner", "department", "plant", "defect_category", "source"]

    def filter_open(self, qs, name, value):
        finished = qs.filter(status__category__in=ComplaintStatus.FINISHED)
        return qs.exclude(id__in=finished.values("id")) if value else finished

    def filter_overdue(self, qs, name, value):
        overdue = qs.filter(due_date__lt=company_today(self.request.company)).exclude(
            status__category__in=ComplaintStatus.FINISHED
        )
        return overdue if value else qs.exclude(id__in=overdue.values("id"))

    def filter_mine(self, qs, name, value):
        mine = qs.filter(Complaint.assigned_q(self.request.membership))
        return mine if value else qs.exclude(id__in=mine.values("id"))
