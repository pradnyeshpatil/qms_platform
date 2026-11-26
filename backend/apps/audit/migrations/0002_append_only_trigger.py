"""Database-level guarantee that the audit trail is append-only: UPDATE and DELETE on audit_activitylog fail,
whatever code (or ad-hoc SQL as the app role) tries it. TRUNCATE (test cleanup, ops) is a separate privilege."""
from django.db import migrations

CREATE = """
CREATE FUNCTION audit_activitylog_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_activitylog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_activitylog_no_change
    BEFORE UPDATE OR DELETE ON audit_activitylog
    FOR EACH ROW EXECUTE FUNCTION audit_activitylog_append_only();
"""
DROP = """
DROP TRIGGER IF EXISTS audit_activitylog_no_change ON audit_activitylog;
DROP FUNCTION IF EXISTS audit_activitylog_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunSQL(CREATE, DROP)]
