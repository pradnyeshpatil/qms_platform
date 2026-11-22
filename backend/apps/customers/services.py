from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Customer


def _check_name_unique(company, name, exclude_id=None):
    qs = Customer.objects.for_company(company).filter(name__iexact=name)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    if qs.exists():
        raise ValidationError({"name": "A customer with this name already exists."})


def create_customer(*, company, user, data) -> Customer:
    _check_name_unique(company, data["name"])
    return Customer.objects.create(company=company, created_by=user, **data)


def update_customer(customer: Customer, data) -> Customer:
    if "name" in data:
        _check_name_unique(customer.company, data["name"], exclude_id=customer.id)
    for k, v in data.items():
        setattr(customer, k, v)
    customer.save()
    return customer


def delete_customer(customer: Customer) -> None:
    """Soft delete. Customers that have complaints must be deactivated instead."""
    from apps.complaints.models import Complaint

    if Complaint.objects.for_company(customer.company).filter(customer=customer).exists():
        raise ValidationError({"detail": "Customer has complaints; set status to inactive instead."})
    customer.deleted_at = timezone.now()
    customer.save(update_fields=["deleted_at", "updated_at"])
