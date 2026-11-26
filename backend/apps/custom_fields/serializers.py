import re

from rest_framework import serializers

from .models import KEY_PATTERN, CustomFieldDefinition


class CustomFieldSerializer(serializers.ModelSerializer):
    key = serializers.RegexField(KEY_PATTERN, error_messages={"invalid": "Use lowercase letters, digits and underscores, starting with a letter (2-50 characters)."})
    section = serializers.ChoiceField(choices=[("", "Report"), *[(f"D{i}", f"D{i}") for i in range(9)]], required=False, allow_blank=True)
    options = serializers.ListField(child=serializers.DictField(), required=False)
    validation = serializers.DictField(required=False)

    class Meta:
        model = CustomFieldDefinition
        fields = ["id", "entity_type", "section", "key", "label", "help_text", "field_type", "required", "default",
                  "options", "validation", "sort_order", "is_active", "show_in_pdf", "version", "created_at", "updated_at"]
        read_only_fields = ["id", "version", "created_at", "updated_at"]

    def validate_validation(self, value):
        allowed = {"min", "max", "min_length", "max_length", "regex", "regex_message"}
        extra = set(value) - allowed
        if extra:
            raise serializers.ValidationError(f"Unknown rule: {', '.join(sorted(extra))}.")
        return value

    def validate_options(self, value):
        return [{"value": str(o.get("value", "")).strip(), "label": str(o.get("label", "")).strip()} for o in value]
