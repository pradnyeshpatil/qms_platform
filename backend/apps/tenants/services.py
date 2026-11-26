from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.rbac import services as rbac_services
from apps.rbac.catalog import ADMIN_ROLE_KEY

from .models import Company, Department, Membership, Plant

DEFAULT_PLANT = "Main Plant"
DEFAULT_DEPARTMENTS = ["Quality", "Production", "Engineering", "Maintenance", "Logistics", "Purchasing"]


def seed_company_defaults(company: Company) -> dict:
    """Default workspace content: system roles, the main plant, standard departments.

    TODO(later phases): 8D statuses (Phase 3), subscription row (Phase 5).
    """
    from apps.complaints.services import seed_company_config

    roles = rbac_services.seed_company_roles(company)
    plant = Plant.objects.create(company=company, name=DEFAULT_PLANT)
    Department.objects.bulk_create(Department(company=company, name=n) for n in DEFAULT_DEPARTMENTS)
    seed_company_config(company)
    return {"roles": roles, "plant": plant}


@transaction.atomic
def register_company(*, company_name, slug, email, password, first_name="", last_name="") -> Membership:
    """Company + seeded workspace + User + Membership(Company Admin) in one transaction."""
    try:
        company = Company.objects.create(
            name=company_name, slug=slug, email=email,
            trial_ends_at=timezone.now() + timedelta(days=settings.TRIAL_DAYS),
        )
        seeded = seed_company_defaults(company)
        user = User.objects.create_user(email=email, password=password, first_name=first_name, last_name=last_name)
        return Membership.objects.create(
            user=user, company=company, role=seeded["roles"][ADMIN_ROLE_KEY], plant=seeded["plant"]
        )
    except IntegrityError:
        raise ValidationError({"detail": "Company slug or email is already taken."})
