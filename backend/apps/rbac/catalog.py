"""Permission catalog and default roles (PROJECT_SPEC §5). Code, not tenant data:
tenants never edit the catalog, they only grant catalog entries to their own roles."""

ALL, DEPARTMENT, ASSIGNED = "all", "department", "assigned"
SCOPES = (ALL, DEPARTMENT, ASSIGNED)

PERMISSIONS: dict[str, str] = {
    "complaints.view": "View complaints",
    "complaints.create": "Create complaints",
    "complaints.update": "Edit complaints",
    "complaints.delete": "Delete complaints",
    "complaints.assign": "Assign complaint owners",
    "complaints.close": "Resolve / close complaints",
    "eight_d_reports.view": "View 8D reports",
    "eight_d_reports.create": "Create 8D reports",
    "eight_d_reports.update": "Edit 8D reports",
    "eight_d_reports.approve": "Approve 8D reports",
    "eight_d_reports.export": "Export 8D reports (PDF)",
    "tasks.view": "View tasks",
    "tasks.create": "Create tasks",
    "tasks.assign": "Assign tasks",
    "tasks.update": "Edit tasks",
    "tasks.complete": "Complete tasks",
    "customers.view": "View customers",
    "customers.create": "Create customers",
    "customers.update": "Edit customers",
    "customers.delete": "Delete customers",
    "attachments.upload": "Upload attachments",
    "attachments.delete": "Delete attachments",
    "comments.create": "Write internal comments",
    "comments.create_customer_visible": "Write customer-visible comments",
    "reports.share": "Create customer share links",
    "audit.view": "View audit history",
    "users.view": "View employees",
    "users.create": "Invite / create employees",
    "users.update": "Edit employees and reset passwords",
    "users.deactivate": "Deactivate / reactivate employees",
    "roles.manage": "Manage roles and permissions",
    "settings.manage": "Manage company settings",
    "custom_fields.manage": "Manage custom fields",
    "plants.manage": "Manage plants",
    "departments.manage": "Manage departments",
    "notifications.configure": "Configure notification rules",
    "support.create": "Open support tickets",
}

# Record-level permissions can be limited to department / assigned records.
# Everything else is company-wide only (scope is always "all").
SCOPABLE_PREFIXES = ("complaints.", "eight_d_reports.", "tasks.")


def is_scopable(code: str) -> bool:
    return code.startswith(SCOPABLE_PREFIXES)


def module_of(code: str) -> str:
    return code.split(".", 1)[0]


# The company must never be able to lock itself out of administration.
ADMIN_ROLE_KEY = "company_admin"
ADMIN_LOCKOUT_PROTECTED = frozenset(
    {"roles.manage", "users.view", "users.create", "users.update", "users.deactivate", "settings.manage"}
)


def _grant(codes, scope=ALL):
    return {c: scope for c in codes}


def _prefix(*prefixes, exclude=()):
    return [c for c in PERMISSIONS if c.startswith(prefixes) and c not in exclude]


DEFAULT_ROLES = [
    {
        "key": "company_admin", "name": "Company Admin",
        "description": "Full access to everything in the company.",
        "grants": _grant(PERMISSIONS),
    },
    {
        "key": "quality_manager", "name": "Quality Manager",
        "description": "Runs the quality process: complaints, 8D approvals, tasks, customers.",
        "grants": _grant(
            _prefix("complaints.", "eight_d_reports.", "tasks.", "customers.", "attachments.", "comments.")
            + ["reports.share", "audit.view", "users.view", "support.create", "custom_fields.manage"]
        ),
    },
    {
        "key": "quality_engineer", "name": "Quality Engineer",
        "description": "Investigates complaints and writes 8D reports.",
        "grants": _grant([
            "complaints.view", "complaints.create", "complaints.update",
            "eight_d_reports.view", "eight_d_reports.create", "eight_d_reports.update", "eight_d_reports.export",
            "tasks.view", "tasks.create", "tasks.update", "tasks.complete",
            "customers.view", "customers.create", "customers.update",
            "attachments.upload", "comments.create", "support.create",
        ]),
    },
    {
        "key": "production_supervisor", "name": "Production Supervisor",
        "description": "Sees and acts on their department's complaints, reports and tasks.",
        "grants": {
            **_grant(["complaints.view", "eight_d_reports.view", "tasks.view", "tasks.create",
                      "tasks.assign", "tasks.update", "tasks.complete"], DEPARTMENT),
            **_grant(["customers.view", "attachments.upload", "comments.create", "support.create"]),
        },
    },
    {
        "key": "production_operator", "name": "Production Operator",
        "description": "Works on records and tasks assigned to them.",
        "grants": {
            **_grant(["complaints.view", "tasks.view", "tasks.update", "tasks.complete"], ASSIGNED),
            **_grant(["attachments.upload", "comments.create"]),
        },
    },
    {
        "key": "viewer", "name": "Viewer",
        "description": "Read-only access.",
        "grants": _grant(["complaints.view", "eight_d_reports.view", "tasks.view", "customers.view"]),
    },
]
