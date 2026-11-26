from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("complaints", "0004_seed_statuses_and_backfill")]

    operations = [
        migrations.RemoveIndex(model_name="complaint", name="complaints__company_c61dc4_idx"),
        migrations.RemoveField(model_name="complaint", name="status"),
        migrations.RenameField(model_name="complaint", old_name="status_ref", new_name="status"),
        migrations.AlterField(
            model_name="complaint", name="status",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="complaints",
                                    to="complaints.complaintstatus"),
        ),
        migrations.AddIndex(
            model_name="complaint",
            index=models.Index(fields=["company", "status"], name="complaints__company_f82904_idx"),
        ),
    ]
