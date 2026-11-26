from django.db import migrations

CODE = "eight_d_reports.reopen"
DESCRIPTION = "Reopen approved / submitted 8D reports"
GRANTED_TO = ("company_admin", "quality_manager")  # same as the seeded defaults for new companies


def grant(apps, schema_editor):
    Permission, Role, RolePermission = (apps.get_model("rbac", n) for n in ("Permission", "Role", "RolePermission"))
    perm, _ = Permission.objects.get_or_create(code=CODE, defaults={"module": "eight_d_reports", "description": DESCRIPTION})
    for role in Role.objects.filter(system_key__in=GRANTED_TO):
        RolePermission.objects.get_or_create(role=role, permission=perm, defaults={"scope": "all"})


class Migration(migrations.Migration):
    dependencies = [("rbac", "0001_initial")]
    operations = [migrations.RunPython(grant, migrations.RunPython.noop)]
