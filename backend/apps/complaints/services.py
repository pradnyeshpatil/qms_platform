from django.db import transaction

from apps.core.services import next_sequence_value
from apps.core.utils import company_now

from .models import Complaint

NUMBER_KEY = "complaint"


@transaction.atomic
def create_complaint(*, company, user, data) -> Complaint:
    year = company_now(company).year
    seq = next_sequence_value(company, NUMBER_KEY, year)
    return Complaint.objects.create(
        company=company, created_by=user, number=f"CMP-{year}-{seq:05d}", **data
    )


def update_complaint(complaint: Complaint, data) -> Complaint:
    # TODO: audit log + status transition rules (closing needs permission) in later phases.
    for k, v in data.items():
        setattr(complaint, k, v)
    complaint.save()
    return complaint


def delete_complaint(complaint: Complaint) -> None:
    from django.utils import timezone

    complaint.deleted_at = timezone.now()
    complaint.save(update_fields=["deleted_at", "updated_at"])
