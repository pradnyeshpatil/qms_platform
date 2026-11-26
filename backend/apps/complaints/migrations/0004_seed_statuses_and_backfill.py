"""Seed the default workflow and defect categories for every existing company, and point each existing
complaint at its ComplaintStatus row."""
from django.db import migrations

from apps.complaints import defaults


def forwards(apps, schema_editor):
    Company = apps.get_model("tenants", "Company")
    Status = apps.get_model("complaints", "ComplaintStatus")
    Category = apps.get_model("complaints", "DefectCategory")
    Complaint = apps.get_model("complaints", "Complaint")

    for company in Company.objects.all():
        by_key = {}
        for order, (key, name, category, is_default) in enumerate(defaults.DEFAULT_STATUSES):
            by_key[key], _ = Status.objects.get_or_create(
                company=company, system_key=key,
                defaults={"name": name, "category": category, "is_default": is_default, "sort_order": order * 10},
            )
        for name in defaults.DEFAULT_DEFECT_CATEGORIES:
            Category.objects.get_or_create(company=company, name=name)
        for old, key in defaults.LEGACY_STATUS_KEYS.items():
            Complaint.objects.filter(company=company, status=old, status_ref__isnull=True).update(
                status_ref=by_key[key]
            )
        Complaint.objects.filter(company=company, status_ref__isnull=True).update(status_ref=by_key["new"])
    for c in Complaint.objects.filter(reported_date__isnull=True).only("id", "created_at").iterator():
        Complaint.objects.filter(pk=c.pk).update(reported_date=c.created_at.date())


class Migration(migrations.Migration):
    dependencies = [("complaints", "0003_configurable_statuses")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
