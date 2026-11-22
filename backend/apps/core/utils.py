from datetime import date
from zoneinfo import ZoneInfo

from django.utils import timezone


def company_now(company):
    return timezone.now().astimezone(ZoneInfo(company.timezone))


def company_today(company) -> date:
    return company_now(company).date()
