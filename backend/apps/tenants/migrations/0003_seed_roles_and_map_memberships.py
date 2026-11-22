"""Data migration: give every existing company its default roles/plant/departments and map each
membership's old string role onto the new company-owned Role."""
from django.db import migrations

from apps.rbac import catalog

DEFAULT_PLANT = "Main Plant"
DEFAULT_DEPARTMENTS = ["Quality", "Production", "Engineering", "Maintenance", "Logistics", "Purchasing"]


def forwards(apps, schema_editor):
    Company = apps.get_model("tenants", "Company")
    Membership = apps.get_model("tenants", "Membership")
    Plant = apps.get_model("tenants", "Plant")
    Department = apps.get_model("tenants", "Department")
    Permission = apps.get_model("rbac", "Permission")
    Role = apps.get_model("rbac", "Role")
    RolePermission = apps.get_model("rbac", "RolePermission")

    perms = {}
    for code, desc in catalog.PERMISSIONS.items():
        perms[code], _ = Permission.objects.get_or_create(
            code=code, defaults={"module": catalog.module_of(code), "description": desc}
        )

    for company in Company.objects.all():
        roles = {}
        for spec in catalog.DEFAULT_ROLES:
            role, created = Role.objects.get_or_create(
                company=company, system_key=spec["key"],
                defaults={"name": spec["name"], "description": spec["description"], "is_system": True},
            )
            if created:
                RolePermission.objects.bulk_create(
                    RolePermission(role=role, permission=perms[c], scope=sc) for c, sc in spec["grants"].items()
                )
            roles[spec["key"]] = role
        if not Plant.objects.filter(company=company).exists():
            Plant.objects.create(company=company, name=DEFAULT_PLANT)
        if not Department.objects.filter(company=company).exists():
            Department.objects.bulk_create(Department(company=company, name=n) for n in DEFAULT_DEPARTMENTS)
        for m in Membership.objects.filter(company=company, role__isnull=True):
            m.role = roles.get(m.legacy_role, roles["viewer"])
            m.save(update_fields=["role"])


class Migration(migrations.Migration):
    dependencies = [("tenants", "0002_company_trial_ends_at_membership_created_at_and_more")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
