from django.db import transaction

from .models import NumberSequence


def next_sequence_value(company, key: str, year: int) -> int:
    """Row-locked increment (SELECT ... FOR UPDATE). Never MAX()+1."""
    with transaction.atomic():
        seq, _ = NumberSequence.objects.select_for_update().get_or_create(
            company=company, key=key, year=year
        )
        seq.last_value += 1
        seq.save(update_fields=["last_value"])
        return seq.last_value
