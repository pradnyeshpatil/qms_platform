"""Default complaint workflow, seeded for every company (PROJECT_SPEC §8)."""

# (system_key, name, category, is_default)
DEFAULT_STATUSES = [
    ("new", "New", "open", True),
    ("assigned", "Assigned", "open", False),
    ("under_investigation", "Under Investigation", "in_progress", False),
    ("containment", "Containment", "in_progress", False),
    ("root_cause_analysis", "Root Cause Analysis", "in_progress", False),
    ("corrective_action", "Corrective Action", "in_progress", False),
    ("awaiting_customer", "Awaiting Customer", "waiting", False),
    ("resolved", "Resolved", "resolved", False),
    ("closed", "Closed", "closed", False),
]

DEFAULT_DEFECT_CATEGORIES = [
    "Dimensional", "Surface finish", "Material", "Packaging", "Delivery", "Documentation", "Other",
]

# Complaint rows that predate configurable statuses.
LEGACY_STATUS_KEYS = {"new": "new", "under_investigation": "under_investigation", "resolved": "resolved",
                      "closed": "closed"}
