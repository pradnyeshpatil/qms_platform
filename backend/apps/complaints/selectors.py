from datetime import timedelta

from django.db.models import Count, F

from apps.core.utils import company_today
from apps.rbac.authorization import scope_queryset

from .models import Complaint, ComplaintStatus

UPCOMING_DAYS = 14
TOP_N = 10


def _row(c: Complaint) -> dict:
    return {
        "id": c.id, "number": c.number, "title": c.title, "severity": c.severity,
        "customer_name": c.customer.name, "status_name": c.status.name,
        "due_date": c.due_date, "created_at": c.created_at,
    }


def _grouped(qs, key_fields: dict, limit=None) -> list[dict]:
    rows = (
        qs.values(**{"key_id": F(key_fields["id"]), "key_name": F(key_fields["name"])})
        .annotate(count=Count("id")).order_by("-count", "key_name")
    )
    rows = rows[:limit] if limit else rows
    return [{"id": r["key_id"], "name": r["key_name"] or "Unassigned", "count": r["count"]} for r in rows]


def dashboard_stats(company, membership, date_from=None, date_to=None) -> dict:
    """Dashboard numbers for what `membership` may see, optionally limited to a reported-date range.
    "Open" and "overdue" follow the status *category*, never the label."""
    qs = scope_queryset(membership, "complaints.view", Complaint.objects.for_company(company))
    if date_from:
        qs = qs.filter(reported_date__gte=date_from)
    if date_to:
        qs = qs.filter(reported_date__lte=date_to)
    today = company_today(company)
    open_qs = qs.exclude(status__category__in=ComplaintStatus.FINISHED)
    by_sev = {s: 0 for s in Complaint.Severity.values}
    for row in qs.values("severity").annotate(n=Count("id")):
        by_sev[row["severity"]] = row["n"]
    cards = qs.select_related("customer", "status")
    return {
        "total": qs.count(),
        "open": open_qs.count(),
        "overdue": open_qs.filter(due_date__lt=today).count(),
        "by_severity": by_sev,
        "by_status": [
            {"id": r["status_id"], "name": r["status__name"], "category": r["status__category"], "count": r["n"]}
            for r in qs.values("status_id", "status__name", "status__category", "status__sort_order")
            .annotate(n=Count("id")).order_by("status__sort_order")
        ],
        "by_customer": _grouped(qs, {"id": "customer_id", "name": "customer__name"}, TOP_N),
        "by_department": _grouped(qs, {"id": "department_id", "name": "department__name"}),
        "by_employee": _by_employee(qs),
        "recent": [_row(c) for c in cards.order_by("-created_at")[:5]],
        "upcoming_deadlines": [
            _row(c) for c in cards.exclude(status__category__in=ComplaintStatus.FINISHED)
            .filter(due_date__gte=today, due_date__lte=today + timedelta(days=UPCOMING_DAYS))
            .order_by("due_date")[:10]
        ],
    }


def _by_employee(qs) -> list[dict]:
    rows = (
        qs.filter(owner__isnull=False)
        .values("owner_id", "owner__user__first_name", "owner__user__last_name", "owner__user__email",
                "owner__username")
        .annotate(count=Count("id")).order_by("-count")[:TOP_N]
    )
    out = []
    for r in rows:
        name = f"{r['owner__user__first_name']} {r['owner__user__last_name']}".strip() or r[
            "owner__user__email"] or r["owner__username"] or str(r["owner_id"])
        out.append({"id": r["owner_id"], "name": name, "count": r["count"]})
    return out
