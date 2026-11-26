"""Server-side validation of custom field values, driven only by the definition (PROJECT_SPEC §10)."""
import datetime
import re
from decimal import Decimal, InvalidOperation

from .models import CustomFieldDefinition as D


def _empty(raw) -> bool:
    return raw is None or raw == "" or raw == []


def _number(raw, cast):
    if isinstance(raw, bool):
        raise ValueError("Enter a number.")
    try:
        return cast(raw)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Enter a number." if cast is Decimal else "Enter a whole number.")


def clean_value(defn: D, raw):
    """The value as stored in JSON, or None to clear it. Raises ValueError(message) when invalid."""
    t, v = defn.field_type, defn.validation or {}
    if t in (D.FieldType.CHECKBOX,):
        if not isinstance(raw, bool):
            raise ValueError("Must be true or false.")
        return raw
    if t == D.FieldType.YES_NO:
        if raw is None or raw == "":
            return None
        if not isinstance(raw, bool):
            raise ValueError("Choose yes or no.")
        return raw
    if _empty(raw):
        return None
    if t in (D.FieldType.TEXT, D.FieldType.TEXTAREA):
        if not isinstance(raw, str):
            raise ValueError("Must be text.")
        text = raw.strip()
        if t == D.FieldType.TEXT and "\n" in text:
            raise ValueError("Must be a single line.")
        if len(text) > (v.get("max_length") or (255 if t == D.FieldType.TEXT else 10000)):
            raise ValueError(f"Must be at most {v.get('max_length') or (255 if t == D.FieldType.TEXT else 10000)} characters.")
        if v.get("min_length") and len(text) < v["min_length"]:
            raise ValueError(f"Must be at least {v['min_length']} characters.")
        if v.get("regex") and not re.fullmatch(v["regex"], text):
            raise ValueError(v.get("regex_message") or "Does not match the required format.")
        return text
    if t in (D.FieldType.INTEGER, D.FieldType.DECIMAL):
        num = _number(raw, int if t == D.FieldType.INTEGER else Decimal)
        if isinstance(num, Decimal) and not num.is_finite():
            raise ValueError("Enter a number.")
        if v.get("min") is not None and num < Decimal(str(v["min"])):
            raise ValueError(f"Must be at least {v['min']}.")
        if v.get("max") is not None and num > Decimal(str(v["max"])):
            raise ValueError(f"Must be at most {v['max']}.")
        return num if t == D.FieldType.INTEGER else str(num)  # decimals stay exact as strings
    if t == D.FieldType.DATE:
        try:
            return datetime.date.fromisoformat(str(raw)).isoformat()
        except ValueError:
            raise ValueError("Enter a valid date (YYYY-MM-DD).")
    allowed = {o["value"] for o in defn.options or []}
    if t == D.FieldType.DROPDOWN:
        if raw not in allowed:
            raise ValueError("Choose one of the listed options.")
        return raw
    if t == D.FieldType.MULTISELECT:
        if not isinstance(raw, list) or any(x not in allowed for x in raw):
            raise ValueError("Choose only listed options.")
        return list(dict.fromkeys(raw))
    raise ValueError("Unsupported field type.")


def is_blank(defn: D, value) -> bool:
    """Counts as 'not answered' for a required field (an unticked checkbox is a valid answer, not blank)."""
    if defn.field_type == D.FieldType.CHECKBOX:
        return False
    return value is None or value == "" or value == []


def validate_definition(*, field_type, options, validation, default) -> None:
    """Config sanity for a definition itself. Raises ValueError({field: message})."""
    from .models import MAX_OPTIONS

    is_choice = field_type in (D.FieldType.DROPDOWN, D.FieldType.MULTISELECT)
    if is_choice:
        if not options:
            raise ValueError({"options": "Add at least one option."})
        if len(options) > MAX_OPTIONS:
            raise ValueError({"options": f"At most {MAX_OPTIONS} options."})
        values = [o.get("value") for o in options]
        if any(not isinstance(x, str) or not x for x in values) or any(not o.get("label") for o in options):
            raise ValueError({"options": "Every option needs a value and a label."})
        if len(set(values)) != len(values):
            raise ValueError({"options": "Option values must be unique."})
    elif options:
        raise ValueError({"options": "Only dropdown and multi-select fields have options."})
    if validation.get("regex"):
        try:
            re.compile(validation["regex"])
        except re.error:
            raise ValueError({"validation": "The pattern is not a valid regular expression."})
