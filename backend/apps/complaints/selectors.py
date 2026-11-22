from django.db import models

from apps.core.utils import company_today
from apps.rbac.authorization import scope_queryset

from .models import Complaint


def dashboard_stats(company, membership) -> dict:
    qs = scope_queryset(membership, "complaints.view", Complaint.objects.for_company(company))
    open_qs = qs.exclude(status__in=Complaint.CLOSED_STATUSES)
    by_sev = {s: 0 for s in Complaint.Severity.values}
    for row in qs.values("severity").annotate(n=models.Count("id")):
        by_sev[row["severity"]] = row["n"]
    return {
        "total": qs.count(),
        "open": open_qs.count(),
        "overdue": open_qs.filter(due_date__lt=company_today(company)).count(),
        "by_severity": by_sev,
    }

