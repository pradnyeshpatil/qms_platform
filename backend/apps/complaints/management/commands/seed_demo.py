from django.core.management.base import BaseCommand
from django.db import transaction
from datetime import timedelta

from apps.accounts.models import User
from apps.complaints import services as complaint_services
from apps.complaints.models import Complaint
from apps.core.utils import company_today
from apps.customers import services as customer_services
from apps.customers.models import Customer
from apps.employees import services as employee_services
from apps.rbac.models import Role
from apps.tenants import services as tenant_services
from apps.tenants.models import Company, Department, Membership

EMAIL, PASSWORD, SLUG = "admin@demo.test", "DemoPass123!", "demo"
# (username, first, last, role system_key, department)
DEMO_EMPLOYEES = [
    ("quality.manager", "Quinn", "Manager", "quality_manager", "Quality"),
    ("quality.engineer", "Eli", "Engineer", "quality_engineer", "Quality"),
    ("prod.supervisor", "Sky", "Supervisor", "production_supervisor", "Production"),
    ("prod.operator", "Oli", "Operator", "production_operator", "Production"),
    ("viewer", "Val", "Viewer", "viewer", None),
]


class Command(BaseCommand):
    help = "Create (idempotently) a demo company, admin user, customers and complaints."

    @transaction.atomic
    def handle(self, *args, **opts):
        company = Company.objects.filter(slug=SLUG).first()
        if company:
            self.stdout.write("Demo company already exists; nothing to do.")
        else:
            m = tenant_services.register_company(
                company_name="Demo Manufacturing Inc.", slug=SLUG, email=EMAIL, password=PASSWORD,
                first_name="Dana", last_name="Admin",
            )
            company, user = m.company, m.user
            customers = [
                customer_services.create_customer(company=company, user=user, data=d)
                for d in [
                    {"name": "Acme Automotive", "contact_person": "Pat Jones", "email": "pat@acme.example", "phone": "555-0101", "country": "USA"},
                    {"name": "Globex Industrial", "contact_person": "Sam Lee", "email": "sam@globex.example", "phone": "555-0102", "country": "Canada"},
                    {"name": "Initech Electronics", "contact_person": "Mia Wong", "email": "mia@initech.example", "country": "Germany"},
                ]
            ]
            today = company_today(company)
            rows = [
                (0, "Burrs on machined flange", "Burrs found on 12 of 50 flanges at incoming inspection.", "Flange F-100", "FL-100-A", "major", "new", -5),
                (1, "Wrong surface finish", "Anodizing colour out of spec.", "Housing H-7", "HS-007", "critical", "under_investigation", 3),
                (2, "Missing documentation", "Certificates of conformance missing from shipment.", "PCB Mount", "PM-220", "minor", "resolved", -10),
                (0, "Dimensional deviation", "Bore diameter 0.05mm over tolerance.", "Bracket B-3", "BR-003", "major", "under_investigation", 14),
                (1, "Packaging damage", "Crates arrived damaged.", "Shaft S-9", "SH-009", "minor", "closed", None),
            ]
            for ci, title, desc, prod, part, sev, st, due in rows:
                complaint_services.create_complaint(
                    company=company, user=user,
                    data=dict(customer=customers[ci], title=title, description=desc, product_name=prod,
                              part_number=part, severity=sev, status=st,
                              due_date=today + timedelta(days=due) if due is not None else None,
                              owner=m),
                )
        self._seed_employees(Company.objects.get(slug=SLUG))
        self.stdout.write(self.style.SUCCESS(f"Demo ready: {EMAIL} / {PASSWORD} (workspace '{SLUG}')"))
        names = ", ".join(u for u, *_ in DEMO_EMPLOYEES)
        self.stdout.write(f"Username logins (workspace '{SLUG}', password '{PASSWORD}'): {names}")

    def _seed_employees(self, company):
        """One employee per role so RBAC is visible. Idempotent; no forced password change for demos."""
        for username, first, last, role_key, dept in DEMO_EMPLOYEES:
            if Membership.objects.filter(company=company, username=username).exists():
                continue
            m, _ = employee_services.create_username_employee(
                company=company, first_name=first, last_name=last, username=username, password=PASSWORD,
                role=Role.objects.get(company=company, system_key=role_key),
                department=Department.objects.get(company=company, name=dept) if dept else None,
            )
            User.objects.filter(pk=m.user_id).update(must_change_password=False)

        self._tag_complaints(company)

    def _tag_complaints(self, company):
        """Give some complaints a department / assignee so department and assigned scopes show data."""
        prod = Department.objects.get(company=company, name="Production")
        quality = Department.objects.get(company=company, name="Quality")
        operator = Membership.objects.filter(company=company, username="prod.operator").first()
        untagged = list(Complaint.objects.for_company(company).filter(department__isnull=True).order_by("number"))
        for i, c in enumerate(untagged):
            c.department = prod if i % 2 == 0 else quality
            if i == 0 and operator:
                c.owner = operator
            c.save(update_fields=["department", "owner", "updated_at"])
