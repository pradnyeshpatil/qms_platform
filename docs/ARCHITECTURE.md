# Architecture (as built through Phase 1)

Authoritative requirements live in `PROJECT_SPEC.md`; this file records what exists and why.

## Shape

Modular monolith. Django 5 + DRF API, PostgreSQL, React + TypeScript SPA behind a same-origin proxy
(Vite in dev), Redis reserved for Celery/rate-limiting (unused so far).

```
backend/apps/
  core/        TenantModel + TenantManager.for_company(), NumberSequence, tenant permission base, health
  accounts/    User (global identity), email + workspace/username login backends, change-password, sessions
  rbac/        Permission catalog, company-owned Role, RolePermission(scope), can(), scope_queryset()
  tenants/     Company, Membership, Plant, Department, Invitation, registration + workspace seeding
  employees/   Invitation / username-employee / lifecycle services + API
  customers/, complaints/   domain apps (Phase 2 grows these)
```

Dependency rule: `core` ← `accounts/rbac/tenants` ← `employees` ← domain apps. Business logic is in
`services.py`; read queries in `selectors.py`; views only translate HTTP.

## Multi-tenancy

* Shared database, company-level isolation. `User` is global (no company FK); `Membership` links a user to a company.
* The active company comes **only** from the URL: `/api/v1/c/{company_slug}/…`. `IsActiveCompanyMember` resolves the slug,
  requires an **active** membership (non-member / inactive / invited → **404**, no existence leak) and sets
  `request.company` / `request.membership`. `company`/`company_id` in a body or query string is rejected (400).
* Tenant queries go through `Model.objects.for_company(company)`; there is no implicit scoping to forget.
* Serializer FK fields use `CompanyScopedPrimaryKeyField`; services re-check cross-company references (defence in depth).
* Suspended / cancelled / deleted-pending companies get 403 `company_inactive` on every tenant route.
* PostgreSQL Row-Level Security is **not** enabled yet (planned Phase 6; all composite indexes already lead with `company_id`).

## Authentication

* Django session cookies (HttpOnly, SameSite=Lax) + CSRF; SPA reads the `csrftoken` cookie and sends `X-CSRFToken`.
* Argon2 password hashing + Django validators (length, common, numeric, similarity).
* Two login forms, one endpoint: `{email, password}` or `{workspace, username, password}` (username unique per company, case-insensitive).
  Failures return one generic message (no user/workspace enumeration); timing is equalised for unknown users.
* `User.must_change_password` (admin-issued temporary passwords): enforced **in the API** — every tenant route returns
  403 `password_change_required` until `POST /auth/change-password/` succeeds. The SPA merely redirects.
* Deactivating a membership blocks tenant access on the next request; if it was the user's only active workplace all of
  their sessions are deleted too. Admin password reset also revokes sessions.

## Authorization (RBAC)

* Global `Permission` catalog (`rbac/catalog.py`, synced on `post_migrate`) — tenants never edit it.
* Company-owned `Role` + `RolePermission(scope ∈ all | department | assigned)`. One role per membership (MVP).
  Six system roles are seeded per company (editable, not deletable). Scope is only allowed on record-level permissions
  (`complaints.*`, `eight_d_reports.*`, `tasks.*`).
* One module decides everything — `rbac/authorization.py`:
  * `can(membership, perm, obj=None)` — object check honouring scope.
  * `scope_queryset(membership, perm, qs)` — restricts lists. **Fails closed**: unknown grant, missing department,
    or a model that cannot express the scope ⇒ empty queryset.
* Views declare `permission_map = {action: "x.y"}` or `required_permission = "x.y"`; `HasCompanyPermission` enforces it.
  A view with no declaration is **denied**. `ANY_MEMBER` is an explicit opt-in (plants/departments reads).
  `test_every_endpoint_declares_authorization` walks the URLconf and fails CI for any endpoint that is neither
  RBAC-protected nor marked `authz_exempt = "<reason>"`.
* "Assigned" per model: complaint = owner or assignee (`Complaint.assigned_q`); task = assignee; 8D report = team leader,
  D1 team member or any section owner (`EightDReport.assigned_q`). Report rows and sections inherit the report's scope.
* Lockout protection: the Company Admin role must keep `roles.manage` and `users.*`/`settings.manage` company-wide and
  cannot be deactivated; a company always keeps ≥1 active Company Admin (deactivate/role-change of the last one is refused);
  nobody can deactivate themselves.
* Field-level rules on complaints: changing `owner` needs `complaints.assign`; moving into resolved/closed needs `complaints.close`.

## 8D reports and tasks (Phase 3)

* `eight_d_reports`: `EightDReport` header + `EightDSection` tracking rows (D0-D8) + one-to-one sections (D0, D2, D4, D8) +
  child-row tables (team, containment, whys, fishbone, corrective, validations, preventive). Everything is a `TenantModel`.
  Business rules live in `services.py` (views only translate HTTP).
* Lifecycle is a fixed enum: draft -> in_progress -> pending_approval -> approved -> submitted -> closed. Editable only in
  draft/in_progress. Approve and submit each write an immutable `ReportRevision` JSON snapshot (model refuses save/delete).
  Reopen bumps `revision`; the old snapshots stay untouched.
* Optimistic locking: every section/row has `version`; a conditional `UPDATE ... WHERE version=` makes concurrent saves
  fail with `409 edit_conflict` instead of overwriting.
* `tasks` depends on `eight_d_reports` (FK), never the reverse. An action row becomes a task via `source_type/source_id`;
  `tasks.hooks.register_source` lets the 8D app stamp the row's completion date when the task finishes (skipped for locked reports).
* Both apps register complaint closure checks (`complaints/closure.py`) and comment/attachment/activity targets
  (`eight_d_report`, `eight_d_section`, `task`).

## Custom fields (8D reports)

* `custom_fields` app: `CustomFieldDefinition` (per company, scoped to the report header or one section D0-D8; types text, long text,
  integer, decimal, date, dropdown, multi-select, checkbox, yes/no) + `CustomFieldDefinitionVersion` (every edit bumps `version`).
  Keys are immutable; type cannot change once records hold the key; definitions are deactivated, never deleted; 50 active per scope.
* Values live in the record's `custom_data` JSON (`EightDReport` for report level, `EightDSection` for D0-D8). Each record also stores
  `custom_schema`, the definitions of its keys as of the last save, so old reports render and print unchanged after a field is edited or retired.
* All validation is server-side (`custom_fields/validators.py`). `required` is enforced at section completion and when requesting approval,
  not on every save, so drafts stay easy to save. Snapshots include values and schema.
* Not yet: custom fields on complaints and on individual list rows (containment actions etc.), file-upload fields, PDF rendering (slice 3.4).

## Employee onboarding

* **Email invitation:** random 256-bit token, only its SHA-256 stored, 7-day expiry, single use, resend (invalidates the old
  token), revoke. Inviting an existing email attaches a pending membership; the person must be **signed in as that user** to accept
  (their password is never touched). Dev mode (`DEBUG`) echoes the link in the API response; production relies on email.
* **Username-only:** admin supplies/generates a temporary password (shown once, never retrievable), flagged for forced change.
  Admin reset is only for accounts without an email (an admin must never set a global password someone uses elsewhere).
* Editing a person who belongs to several companies cannot change their global profile.

## Frontend

React Router + TanStack Query + react-hook-form/zod + Tailwind. `useCan()` hides controls from `/auth/me` permissions;
`RequirePermission` gates pages. These are conveniences only — the API enforces every rule.

## Deliberately deferred (see DEVELOPMENT_ROADMAP.md)

Rate limiting / lockout, email verification, self-service password reset for email users, session listing & idle timeouts,
MFA, RLS, audit log, subscriptions, Celery.
