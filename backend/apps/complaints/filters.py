import django_filters

from apps.core.utils import company_today

from .models import Complaint


class ComplaintFilter(django_filters.FilterSet):
    overdue = django_filters.BooleanFilter(method="filter_overdue")

    class Meta:
        model = Complaint
        fields = ["status", "severity", "customer", "owner"]

    def filter_overdue(self, qs, name, value):
        overdue = qs.filter(due_date__lt=company_today(self.request.company)).exclude(
            status__in=Complaint.CLOSED_STATUSES
        )
        return overdue if value else qs.exclude(id__in=overdue.values("id"))
