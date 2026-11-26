from django.db import models

from apps.core.models import TenantModel

KEY_PATTERN = r"^[a-z][a-z0-9_]{1,49}$"
MAX_ACTIVE_PER_SCOPE = 50
MAX_OPTIONS = 100


class CustomFieldDefinition(TenantModel):
    """A company-defined extra field (PROJECT_SPEC §10). Never hard-deleted: deactivate instead, so old records stay readable."""

    class EntityType(models.TextChoices):
        EIGHT_D_REPORT = "eight_d_report", "8D report"  # section blank = report header, D0..D8 = that section

    class FieldType(models.TextChoices):
        TEXT = "text", "Short text"
        TEXTAREA = "textarea", "Long text"
        INTEGER = "integer", "Whole number"
        DECIMAL = "decimal", "Decimal number"
        DATE = "date", "Date"
        DROPDOWN = "dropdown", "Dropdown"
        MULTISELECT = "multiselect", "Multi-select"
        CHECKBOX = "checkbox", "Checkbox"
        YES_NO = "yes_no", "Yes / No"

    entity_type = models.CharField(max_length=30, choices=EntityType.choices)
    section = models.CharField(max_length=2, blank=True)  # "" = report level, else D0..D8
    key = models.CharField(max_length=50)  # immutable
    label = models.CharField(max_length=120)
    help_text = models.CharField(max_length=255, blank=True)
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    required = models.BooleanField(default=False)
    default = models.JSONField(null=True, blank=True)
    options = models.JSONField(default=list, blank=True)  # [{"value": "a", "label": "A"}]
    validation = models.JSONField(default=dict, blank=True)  # min, max, min_length, max_length, regex
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    show_in_pdf = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["entity_type", "section", "sort_order", "label"]
        constraints = [
            models.UniqueConstraint(fields=["company", "entity_type", "section", "key"], name="uniq_custom_field_key")
        ]
        indexes = [models.Index(fields=["company", "entity_type", "section", "is_active"])]

    def snapshot(self) -> dict:
        """What a record remembers about this field at save time (readable even after later edits)."""
        return {
            "label": self.label, "type": self.field_type, "options": self.options, "version": self.version,
            "show_in_pdf": self.show_in_pdf, "sort_order": self.sort_order, "section": self.section,
        }

    def __str__(self):
        return f"{self.entity_type}:{self.section or '-'}:{self.key}"


class CustomFieldDefinitionVersion(models.Model):
    definition = models.ForeignKey(CustomFieldDefinition, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    snapshot = models.JSONField()
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["version"]
        constraints = [models.UniqueConstraint(fields=["definition", "version"], name="uniq_custom_field_version")]
