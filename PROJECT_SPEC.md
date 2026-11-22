# PROJECT_SPEC.md — Manufacturing Quality Management & 8D Reporting SaaS

> Single source of truth for product requirements. Read this fully at the start of every session.
> Detailed design lives in `/docs` (ARCHITECTURE.md, DATABASE_SCHEMA.md, API_DESIGN.md, DEVELOPMENT_ROADMAP.md).

**Legend**
- **[SPEC]**: requirement from the original product brief.
- **[DECISION]**: a gap filled with a practical default. Change it by editing this file and telling Claude.
- **[OPEN]**: needs owner confirmation before the relevant phase starts. A safe default is given.

---

## 0. Working Agreement (for Claude Code)

1. Act as Senior Software Architect, Python/Django engineer, DB designer and SaaS product engineer. Build a real commercial product, not a tutorial.
2. Work in small vertical slices. After each slice: run tests, summarise, wait for review. Never implement several phases in one go.
3. **Security tests come first** for tenancy and permissions: write cross-tenant and permission tests before building features on top.
4. Business logic lives in service modules (`services.py`), not in views or serializers.
5. Never trust a `company_id` from the client. Every tenant-owned query is scoped to the active company.
6. Every protected endpoint enforces backend authorization. Hiding frontend buttons is not security.
7. Prefer boring, reliable technology. No microservices, no AI/LLM, no GPU, no premature optimisation.
8. If a requirement is ambiguous, propose a practical default, state the trade-off, and record it here as a [DECISION] or [OPEN].

---

## 1. Product Overview

A cloud, multi-tenant **Manufacturing Quality Management System (QMS)**, initially focused on **Customer Complaint Management and 8D Problem-Solving Reports**.

**Target customers [SPEC]:** small and medium manufacturers, initially in the US: CNC machining, metal fabrication, automotive components, electronics, industrial equipment, and OEM suppliers. Today they use Excel, Word, email and disconnected tools.

**Vision [SPEC]:** one central platform to:
1. Manage customers and complaints.
2. Assign complaints to employees and departments.
3. Investigate problems and track corrective actions.
4. Create and manage structured 8D reports.
5. Assign tasks and track deadlines.
6. Upload evidence, photos and documents.
7. Configure company-specific forms and fields.
8. Generate professional PDF reports.
9. Collaborate internally and share reports with customers.
10. Keep the complete history of quality activity.

**Critical distinction [SPEC]:** this is NOT an 8D PDF generator. It is a complaint-management and investigation-lifecycle platform. A complaint may have **zero, one or many** 8D reports.

**Terminology [SPEC]:**
- *Our customer* (tenant) = a manufacturing company using the SaaS ("Company").
- *External customer* = a customer of that manufacturing company (an OEM, buyer). Modeled as `Customer` inside each tenant.

---

## 2. Technology Stack and Restrictions

### Backend [SPEC]
Python 3.12+, Django, Django REST Framework, PostgreSQL, Redis, Celery (+ Celery Beat), Django ORM, pytest + pytest-django, OpenAPI/Swagger (drf-spectacular).

### Frontend [SPEC]
React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod.

### Infrastructure [SPEC]
Docker + Docker Compose, PostgreSQL, Redis, S3-compatible object storage, environment-based config, Git, CI/CD-ready.

### Restrictions [SPEC]
No Ruby/Rails. No AI/LLM API in the initial product. No GPU. No unnecessary microservices. Do not over-engineer. Keep operating cost low. **Modular monolith**, API-first.

### Additional stack decisions [DECISION]
| Area | Choice | Trade-off |
|---|---|---|
| Local object storage | MinIO in Docker Compose | S3 API parity with production |
| Production storage | Any S3-compatible (AWS S3, Cloudflare R2, Backblaze B2) via `django-storages` | R2/B2 reduce egress cost |
| PDF engine | WeasyPrint (HTML/CSS templates) | Cheap, templatable; weaker than Chromium on exotic CSS |
| Package mgmt | `uv` or `pip-tools` for Python; `pnpm` for frontend | Reproducible installs |
| Lint/format | Ruff + mypy (backend), ESLint + Prettier (frontend), pre-commit | Consistency |
| Email | SMTP/Anymail provider (Postmark, SES or Resend); MailHog locally | Provider-swappable |
| Error monitoring | Sentry (Phase 6) | |
| API docs | drf-spectacular at `/api/docs/` | |

---

## 3. Multi-Tenant Architecture

**[SPEC]** Shared PostgreSQL database, company-level tenant isolation. Each company's business data is completely isolated.

### 3.1 Core identity model [SPEC]
- **Company**: name, workspace slug, business email, phone, address, country, industry, website, logo, status, created date.
- **User**: global login identity (may belong to multiple companies). No single `company_id` on User.
- **Membership** (Company ↔ User): role, employee ID, department, plant, company-specific username, membership status, invitation status, joined date.

### 3.2 Gap-fills [DECISION]
1. **Email is nullable on User, unique when present** (partial unique index, case-insensitive). Username-only employees have `email = NULL`.
2. **Username lives on Membership**, unique per company (`UNIQUE(company_id, lower(username))`). Username-only users are effectively single-company until an email is attached.
3. **Active company context is in the URL**: `/api/v1/c/{company_slug}/...`. Middleware/base viewset resolves the slug, verifies the authenticated user has an *active* membership in it, and exposes `request.company` and `request.membership`. A client-supplied `company_id` in a body or query is ignored or rejected.
4. **Slug rules:** lowercase `[a-z0-9-]`, 3 to 40 chars, globally unique, reserved-word blocklist (`admin`, `api`, `platform-admin`, `support`, `www`, ...). Slug is immutable after creation in the MVP (rename later with redirect support).
5. **Company statuses:** `trial`, `active`, `suspended`, `cancelled`, `deleted_pending`. Suspended companies get read-only or blocked access (configurable).
6. **Soft delete** on business records (complaints, reports, customers) via `deleted_at`. Hard delete only through a retention job or tenant deletion.
7. **Tenant-scoped base classes:** `TenantModel` (company FK, timestamps, created_by) with a `TenantManager` that requires a company to be supplied, so an unscoped query is hard to write by accident.
8. **Defense in depth:** composite indexes start with `company_id`. **PostgreSQL Row-Level Security** is designed in ARCHITECTURE.md and enabled in Phase 6 at the latest (or Phase 1 if the spike shows low cost). [OPEN: RLS in MVP yes/no; default is to enable it after core models stabilise].
9. **Future option:** schema-per-tenant or database-per-tenant for large customers is out of scope, but keep `company_id` discipline so sharding by company is possible.

### 3.3 Registration flow [SPEC]
1. Create Company. 2. Create first User. 3. Create Membership. 4. Assign Company Admin role. 5. Create initial workspace (seed default roles, statuses, departments, default plant).

**[DECISION]** Registration is one DB transaction. Email verification is required before inviting employees or sharing externally. A 14-day trial subscription (configurable) is created automatically [OPEN: trial length; default 14 days, no card]. Seed data per company: 6 default roles, default complaint statuses, default 8D report statuses, a default plant ("Main Plant"), and default departments (Quality, Production, Engineering, Maintenance, Logistics, Purchasing).

### 3.4 Employee onboarding [SPEC]
**Method 1: Email invitation.** Admin enters first name, last name, email, role, department, plant. Employee gets an email and activates by setting a password.
**[DECISION]** Invitation tokens: random, hashed at rest, expire in 7 days, single use, resendable, revocable. Inviting an email that already has a User attaches a new Membership to that User (they accept the invite while logged in or after login).

**Method 2: Username-only employees.** Admin enters first name, last name, optional mobile, company-specific username, temporary password, role, department, plant. Login = **workspace slug + username + password**. Forced password change at first login. Passwords always hashed (Argon2). Admins can never view passwords. Admin-initiated password reset supported.
**[DECISION]**
- Temporary passwords are generated by the system and shown once to the admin at creation or reset time (admin may also type one; policy still applies).
- Username-only users cannot self-reset via email. Reset is admin-initiated only. Optionally allow adding an email later to enable self-service reset.
- Deactivating a membership revokes all of that user's sessions in that company immediately.

---

## 4. Authentication and Sessions [DECISION]

(The brief requires secure authentication but does not specify a mechanism.)

- **Session cookies** (httpOnly, Secure, SameSite=Lax) with CSRF protection, since the SPA is same-site (frontend and API behind one domain or reverse proxy). Rationale: no tokens in localStorage, simple revocation, DRF-friendly.
- **Login resolution:**
  - Email login: `email + password` (user then picks a company if they have several, or lands in the last used one).
  - Username login: `workspace_slug + username + password` → find Membership → User.
- Argon2 password hashing, Django password validators, breach/common-password check.
- **Rate limiting and lockout:** per IP and per account/username (e.g. 5 failures then progressive delay), implemented with Redis. Generic error messages to avoid user enumeration.
- **Password reset** (email users): single-use, expiring token, rate limited.
- **MFA:** TOTP **mandatory for platform admins and support agents**, optional for company users (Phase 4+). [OPEN: make MFA mandatory for Company Admins]
- **Session management:** list and revoke active sessions; idle and absolute timeouts (configurable).
- **Separate auth realm for platform staff:** different login route, separate staff flag, never reachable via tenant endpoints.
- **Forced password change** flag on Membership/User for temporary passwords.

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Requirements [SPEC]
Configurable permissions, not hardcoded role names. Seed roles: Company Admin, Quality Manager, Quality Engineer, Production Supervisor, Production Operator, Viewer. Company admins can create, rename, configure, assign, modify and deactivate roles.

Permission catalog (extensible):
- Complaints: `complaints.view|create|update|delete|assign|close`
- 8D: `eight_d_reports.view|create|update|approve|export`
- Tasks: `tasks.view|create|assign|update|complete`
- Admin: `users.view|create|update|deactivate`, `roles.manage`, `settings.manage`, `custom_fields.manage`

Access scopes: **all company records / assigned records only / department-specific records**.
Backend authorization on every protected endpoint is mandatory.

### 5.2 Design [DECISION]
- **Global `Permission` catalog** (code, module, description), seeded by migrations/fixtures and never edited by tenants.
- **Company-owned `Role`** (name, description, is_system, is_active). System roles are seeded per company and can be edited but not deleted; the Company Admin role cannot lose `roles.manage`/`users.*` (lockout protection) and a company must always keep at least one active Company Admin.
- **`RolePermission`** (role, permission, scope ∈ {all, department, assigned}). Scope is per permission.
- **Additional permissions to add to the catalog:** `customers.view|create|update|delete`, `attachments.upload|delete`, `comments.create|create_customer_visible`, `reports.share` (customer links), `audit.view`, `support.create`, `notifications.configure`, `plants.manage`, `departments.manage`.
- **Central authorization module** (`rbac/authorization.py`):
  - `can(membership, permission, obj=None) -> bool` for object checks.
  - `scope_queryset(membership, permission, qs)` applies the all/department/assigned filter.
  - DRF `HasCompanyPermission` class declared per view (`required_permission = "complaints.update"`). A test enforces that **every view declares a permission or is explicitly marked public**.
  - Per-request permission cache (and optional short Redis cache invalidated on role change).
- **"Assigned" definition** per model: complaint → owner or any assignee; task → assignee; 8D report → team member or section owner. Documented in ARCHITECTURE.md.
- **Department scope** requires `department_id` on scoped records (complaint, 8D report, task inherits from complaint).
- A user holds **one role per company** in the MVP [DECISION]. Multi-role per membership is a possible later extension.

---

## 6. Plants and Departments [SPEC]

Company → Plants → Departments. Employees associate with plants and departments. Complaints can be tied to a plant and department. A company may have one or many plants. Example departments: Quality, Production, Engineering, Maintenance, Logistics, Purchasing.

**[DECISION]** Department can optionally belong to a plant, or be company-wide. In the MVP a membership has one primary plant and one primary department; a many-to-many extension is designed but deferred. Deactivate rather than delete when referenced.

---

## 7. Customer Management [SPEC]

Separate module. Each company keeps its own customer directory.
Fields: customer company name, contact person, email, phone, address, country, notes, status.

**[DECISION]**
- Support **multiple contacts per customer** (a `CustomerContact` table); the primary contact fields in the brief map to the primary contact.
- Optional external customer code, and a `default_report_template` reference for later.
- Unique customer name per company (case-insensitive). Customers with complaints can be deactivated, not deleted.

---

## 8. Customer Complaint Management [SPEC]

### Fields
Complaint number, customer, title, description, product name, part number, batch/lot number, defect category, severity, reported date, due date, plant, department, assigned owner, status, attachments, created by, created date, updated date.

### Initial statuses
New, Assigned, Under Investigation, Containment, Root Cause Analysis, Corrective Action, Awaiting Customer, Resolved, Closed. Extensible for company-specific workflows.

### Dashboard
Total, open, overdue, by severity, by customer, by department, by employee, recently created, upcoming deadlines. Search, filter, sort, pagination, date range.

### Detail page
Complaint info, customer info, assigned employees, related 8D reports, tasks, comments, attachments, activity history, due dates, status changes. Create 8D from a complaint (not mandatory).

### Gap-fills [DECISION]
- **Numbering:** `CMP-{YYYY}-{00001}` per company per year, via a `NumberSequence` table with `SELECT ... FOR UPDATE` (never `MAX()+1`). Format configurable per company later.
- **Configurable statuses:** `ComplaintStatus` rows per company with a `category` (`open`, `in_progress`, `waiting`, `resolved`, `closed`) and `is_default`, `sort_order`. Dashboards, overdue logic and "open" counts use the category, never the label. Allowed transitions are defined in a transition table (default: free movement forward and back for non-closed states; closing needs `complaints.close`).
- **Overdue** = `due_date < today (company time zone)` and category not in `resolved/closed`.
- **Severity** is a fixed enum initially (Minor, Major, Critical) with a configurable lookup in v2. **Defect category** is a company-managed lookup list (seeded with common defects: dimensional, surface finish, material, packaging, delivery, documentation, other).
- **Multiple assignees:** one primary owner plus optional additional assignees (`ComplaintAssignee`).
- **Closing rules:** closing requires a closure comment; open 8D reports or incomplete tasks produce a warning (blocking behaviour configurable).
- **Reopening** a closed complaint requires permission and creates an audit entry.
- **Customer reference:** optional `customer_reference_number` (the customer's own complaint ID), a quantity-affected field, and a `source` (email, phone, portal, audit).
- **Duplicates:** soft warning if the same customer + part number + batch has an open complaint.
- **Excel/CSV import** of historical complaints is in Phase 4+ because it strongly drives adoption. [OPEN: bring forward?]
- **Export** of the filtered complaint list to CSV/XLSX.

---

## 9. 8D Problem-Solving Module [SPEC]

D0 Prepare and Plan, D1 Team, D2 Describe the Problem, D3 Interim Containment, D4 Root Cause Analysis (5 Whys, Fishbone, root cause, occurrence cause, escape cause, evidence), D5 Select Permanent Corrective Actions, D6 Implement and Validate, D7 Prevent Recurrence, D8 Closure and Recognition. (Field lists exactly as in the original brief; kept in DATABASE_SCHEMA.md.)

Requirements: draft reports, report numbers, status, section-wise completion and ownership, comments, attachments, approval workflow, revisions, history, PDF generation, final locking, reopening when authorised. **Do not store the entire report as one text field**: use structured models per section.

Lifecycle: **Draft → In Progress → Pending Approval → Approved → Submitted → Closed.**

### Gap-fills [DECISION]
- **Structure:**
  - `EightDReport` (header: number, complaint FK, status, revision, team leader, dates, template, locked flag).
  - One-to-one section tables for singular sections: `D0Assessment`, `D2ProblemDescription`, `D4RootCauseAnalysis`, `D8Closure`.
  - Child-row tables for lists: `D1TeamMember`, `D3ContainmentAction`, `D4WhyStep` (5 Whys chain), `D4FishboneCause` (category: Man, Machine, Method, Material, Measurement, Environment; parent for sub-causes), `D5CorrectiveAction` (proposed vs selected), `D6Validation`, `D7PreventiveAction`.
  - `EightDSection` tracking table: report, section code (D0..D8), status (`not_started|in_progress|complete`), owner, completed_at/by. Report completion % derives from it.
- **Numbering:** `8D-{YYYY}-{00001}` per company per year.
- **Prefill:** D2 is prefilled from the complaint (part number, batch, defect, customer, description) at creation, then independent. No live sync (documented trade-off).
- **Action items vs tasks:** D3/D5/D6/D7 action rows can generate linked `Task` records (tasks carry `eight_d_section`), so task dashboards and reminders work. A task and its action row stay linked and status-synced via the service layer.
- **Approval workflow (MVP):** single-level approval by a user with `eight_d_reports.approve`, plus rejection with a mandatory comment that returns the report to In Progress. Approver is selected per report (default: Quality Manager). Approval records: approver, decision, comment, timestamp. Multi-level approval chains are a later extension; the `ReportApproval` table is designed for it. [OPEN: e-signature / typed-name signature on approval; default is typed name + timestamp + IP in the audit trail]
- **Submission:** moving to Submitted means "sent to the customer" and records date, method and recipient (and can create a sharing link).
- **Revisions and locking:** on **Approved** and **Submitted**, the system stores an immutable **JSON snapshot** (all section data, custom-field values *and* their definition snapshots, team, approvals) as `ReportRevision`. Approved/Submitted/Closed reports are read-only. Reopening (permission `eight_d_reports.reopen`) creates revision N+1 as a working copy, requires a reason, and writes an audit entry. PDFs render **from a snapshot**, so a historical revision always regenerates identically.
- **Completion rules:** to request approval, mandatory sections (configurable; default D1, D2, D3, D4, D5, D6, D8 required, D0/D7 recommended) must be complete.
- **D0 "formal 8D required?"** is a boolean + rationale. If "no", the complaint can proceed without a report.
- **Customer-specific formats:** report `template_key` (default `standard`). OEM variants (VDA, Ford, GM, etc.) are future templates. Standard layout ships first. [OPEN: which OEM formats first?]

---

## 10. Dynamic Custom Fields and Form Builder [SPEC]

Company admins define custom fields for complaints, 8D reports and each of D0 to D8.
Field types: short text, long text, integer, decimal, date, dropdown, multi-select, checkbox, yes/no, file upload.
Per-field config: name, internal key, type, required, default, options, validation rules, display order, active/inactive, show in PDF, entity type, associated 8D section.
Hybrid model: standard business fields stay typed columns; custom definitions and values stored separately, JSONB where appropriate. Must ensure tenant isolation, historical value preservation, definition versioning/snapshots, configurable ordering, PDF integration. Do not turn the app into an unstructured JSON store.

### Design [DECISION]
- `CustomFieldDefinition` (company, entity_type, section [nullable], key, label, type, required, default, options, validation JSON, order, is_active, show_in_pdf, version, created/updated).
- **Values** stored as a `custom_data` JSONB column on each target record (complaint, and each 8D section/report row), keyed by field `key`. GIN index where querying/filtering on custom fields is needed.
- **Versioning:** every definition edit increments `version` and writes a `CustomFieldDefinitionVersion` row. Each saved record stores a small `custom_schema_snapshot` (key → label, type, options, version at save time). Old records remain readable and printable even if the definition later changes or is deactivated.
- **Never hard-delete** a definition; deactivate. Changing a field's *type* once data exists is blocked (create a new field instead). Removing a dropdown option keeps existing values valid.
- **Validation** is enforced server-side from the definition (type coercion, required, min/max, regex, option membership) in a single `custom_fields.validators` module; the frontend renders dynamic forms from the same definition API.
- **File-upload custom fields** store attachment IDs (never raw files in JSONB).
- **Limits:** max active fields per entity/section (default 50) and max options per dropdown to protect performance.
- **Reporting:** custom fields are shown in detail views and PDFs. Filtering/dashboard use of custom fields is later.
- **Key rules:** `^[a-z][a-z0-9_]{1,49}$`, unique per (company, entity_type, section), immutable after creation.

---

## 11. Task Management [SPEC]

Task types: Containment, Investigation, Root Cause, Corrective Action, Verification, Preventive Action.
Fields: title, description, type, complaint, related 8D report, related 8D section, assignee, created by, priority, due date, status, completion date, attachments.
Support assignment, reassignment, comments, completion, overdue tracking, notifications, and a personal task dashboard (assigned and overdue).

**[DECISION]** Statuses: To Do, In Progress, Blocked, Done, Cancelled (category-mapped like complaints). Priorities: Low, Medium, High, Urgent. A task may exist on a complaint without an 8D report. Completing a task requires `tasks.complete` or being the assignee. Reassignment notifies old and new assignee and is audited. Optional completion notes and evidence.

---

## 12. Notifications and Background Jobs [SPEC]

Celery + Redis for async: invitation emails, complaint assignment, task assignment, upcoming deadline reminders, overdue reminders, approval notifications, customer report-sharing notifications. In-app notifications with mark-as-read. Configurable reminder rules. No duplicate reminders. Scheduled Celery tasks.

### Design [DECISION]
- `Notification` (company, recipient membership, type, title, body, link target, read_at, created_at). Created in the service layer on domain events, delivered in-app and optionally by email.
- **Domain events + outbox:** services emit events inside the DB transaction; notification and email tasks are enqueued with `transaction.on_commit` so no task runs for a rolled-back change.
- **Reminder rules** per company: e.g. "complaint due in N days", "task due in N days", "overdue every N days", as `ReminderRule` rows with defaults seeded.
- **Deduplication:** a `ReminderLog` table with a unique key `(rule, target_type, target_id, recipient, window)` enforced by DB constraint; Celery Beat scans periodically and `INSERT ... ON CONFLICT DO NOTHING` before sending.
- **Per-user preferences:** email on/off per notification type. Digest option later.
- All Celery tasks are idempotent, carry `company_id`, have retries with backoff, and a dead-letter log. Evaluate "due today" in the **company's time zone**.
- Real-time push (WebSocket) is out of scope; poll with TanStack Query (short interval) for the MVP.

---

## 13. Comments, Attachments and Activity History [SPEC]

**Comments** on complaints, 8D reports, 8D sections and tasks, with *internal* and *customer-visible* visibility.
**Attachments:** images, PDF, Excel, Word, other approved formats. Object storage only. File size limits, type validation, secure download permissions, tenant isolation, ownership.
**Activity history:** audit trail for complaint created/updated, assigned, status changed, task completed, section completed, report approved, exported, complaint closed. Not editable by ordinary users.

### Design [DECISION]
- **Generic targeting:** `Comment`, `Attachment` and `ActivityLog` use a (`target_type`, `target_id`) pair plus a mandatory `company_id`. A single `targets` registry validates allowed target types and that the target belongs to the same company. [Trade-off: weaker DB integrity than explicit FKs, mitigated by service validation and tests.]
- **Attachments:**
  - Storage key: `companies/{company_id}/{entity}/{uuid}/{random}`. Never the original filename in the key.
  - **Direct-to-S3 uploads** with presigned URLs for large files, or proxied upload for small ones; downloads via short-lived presigned URLs issued only after a permission check.
  - Validation: extension allowlist **and** MIME sniffing (magic bytes), max size per file (default 25 MB) and per-company storage quota (configurable via plan). Image thumbnails generated asynchronously. Filenames sanitised.
  - Optional virus scanning (ClamAV) hook, off by default. [OPEN]
  - Storage usage tracked per company for quota enforcement and platform analytics.
- **Comments:** `visibility ∈ {internal, customer_visible}`. Customer-visible comments only appear on shared external views. Edit window with edit history; deletion is soft and audited. @mentions notify users (Phase 4).
- **Audit log:** append-only table, **no update/delete via app code or DB role** (REVOKE UPDATE/DELETE for the app role, or triggers). Fields: company, actor membership, action code, target, before/after change summary (JSON diff), IP, user agent, request id, timestamp. Separate **platform audit log** for staff and support-access actions.

---

## 14. PDF Report Generation [SPEC]

Professional 8D PDFs: company logo and info, customer info, complaint details, report number, D0 to D8, team, corrective actions, evidence, custom fields, revision info, approval details. Suitable for sending to OEMs. Different companies may need different layouts; design so templates can be customised later. PDF respects configured field order and `show_in_pdf`.

### Design [DECISION]
- **WeasyPrint** renders **Django HTML templates + CSS** into PDF, run in a Celery task (never in the request cycle), result stored in object storage and linked to the revision.
- Input is always a **report revision snapshot** (see §9), so output is reproducible.
- **Template registry:** `template_key` → template folder (`standard` first). Company branding (logo, primary colour, footer text) is applied via CSS variables. Template customisation by tenants is a future feature; the registry makes adding OEM variants straightforward.
- Embedded images are downscaled; max images per section to bound PDF size. Fonts bundled. Header/footer with report number, revision, page numbers.
- **Watermark** "DRAFT" for non-approved renders and "SUPERSEDED" for old revisions.
- Export is permissioned (`eight_d_reports.export`) and audited; generation is rate limited.
- Golden-file visual/text regression tests for the standard template.

---

## 15. Customer Collaboration (External Sharing) [SPEC]

MVP: no customer accounts. Companies generate secure external links for complaint responses and 8D reports: view-only, expiring, revocable, secure random tokens, optional password, access history. Future: external customer accounts (comments, evidence, approval, feedback, portals). Do not build the full portal in MVP.

### Design [DECISION]
- `ShareLink` (company, target type/id, **revision** shared, token hash, expires_at, revoked_at, password hash [optional], created_by, allow_download_pdf, view_count).
- Token: ≥ 32 bytes from a CSPRNG, shown once, **stored hashed**; URL `/s/{token}`. Constant-time compare.
- Links point to a **specific approved/submitted revision** (immutable), not live data, so later edits do not leak to customers.
- Public endpoints: throttled, no tenant session, minimal response, `noindex`, `Referrer-Policy: no-referrer`, brute-force protection on password.
- `ShareAccessLog` (IP, user agent, timestamp, success/fail). Optional email notification to the creator on first view.
- Only `customer_visible` comments and explicitly selected attachments are exposed.
- Customer "acknowledge" button is a v2 candidate. [OPEN]

---

## 16. Platform Superadmin [SPEC]

Separate platform admin area, suggested routes: `/platform-admin/dashboard|companies|users|subscriptions|support|analytics|settings`.
Capabilities: view companies and details, activate/suspend, user counts, subscription status, manage plans, storage/usage, support tickets, manage support agents, platform audit logs.

**Security rule [SPEC]:** platform admins must **not** automatically have unrestricted access to complaint/8D data. Exceptional access must be explicitly authorised, reason-recorded, time-limited, audited, and visible to the customer's admin where appropriate.

### Design [DECISION]
- Platform staff are `PlatformStaff` records (roles: `superadmin`, `support_agent`, `billing`, `read_only_analytics`) with **mandatory TOTP MFA**, separate login route and session cookie, IP allowlist option.
- Default platform views show **metadata only** (company profile, counts, storage, plan, status), never complaint content.
- **`SupportAccessGrant`**: company, staff, reason, scope (read-only default), `requested_at`, `approved_by` (company admin approval *or* superadmin emergency override flagged for review), `expires_at` (max e.g. 24 h), `revoked_at`. All data access during a grant is audited, and the company admin sees a banner/list of grants and accesses in their audit view. [OPEN: require customer approval vs. notify-only; default is notify-only for tickets the customer opened, approval required otherwise]
- Staff cannot impersonate users silently; if "view as" is ever added, it is a grant with a visible banner.
- Platform analytics use aggregated queries on metadata only.

---

## 17. Customer Support Portal [SPEC]

Company admins: create tickets, view their company's tickets, reply, upload screenshots, track status, see responses.
Ticket fields: number, subject, description, category, priority, status, created by, assigned agent, related complaint/8D (optional), created, updated.
Support team: view all tickets, assign, reply, add **internal-only notes**, request info, change status/priority, escalate, close. Customers never see internal notes.
Statuses: Open, In Progress, Waiting for Customer, Waiting for Support, Resolved, Closed.

**[DECISION]**
- Lives in a `support` app. `TicketMessage.visibility ∈ {public, internal}`; the customer-facing serializer and queryset exclude internal notes by construction (separate endpoints under `/api/v1/c/{slug}/support/` vs `/api/v1/platform/support/`), with tests.
- Linking a ticket to a complaint/8D does **not** grant the support agent access to it; they must use a SupportAccessGrant. A ticket may offer a "grant access for this ticket" button for the company admin.
- Email notifications on replies; replying by email is deferred.
- SLA timers/escalation rules are Phase 5+. **MVP cut:** if schedule pressure appears, an external helpdesk (or a simple mailto) can substitute and this module can move later.

---

## 18. Subscription and Billing [SPEC]

Initial pricing hypothesis: **$15 per company per month**; unlimited internal users, complaints, and 8D reports. Do not hardcode pricing or limits. Configurable plans, subscriptions, billing status, plan features, usage limits, start/end dates. Manual subscription management from superadmin first; payment gateway later. One plan initially, architecture supports many. **Do not advertise unlimited storage or bandwidth**: configurable storage and file-size limits.

### Design [DECISION]
- Models: `Plan` (code, name, price, currency, interval, is_active), `PlanFeature`/`PlanLimit` (key, value: e.g. `storage_gb`, `max_file_mb`, `max_custom_fields`, `max_share_links`, `feature.custom_fields`), `Subscription` (company, plan, status [`trialing|active|past_due|cancelled|expired`], start, end/renews_at, trial_end, notes), `SubscriptionEvent` log.
- A single `entitlements` service answers `get_limit(company, key)` / `has_feature(company, key)`. No code reads price or limits directly from settings.
- Enforcement points: file upload (size and total storage), custom field counts, share links. Over-limit → clear error; **never delete data**. Expired/suspended subscription → read-only mode (configurable grace period).
- Default plan values (seeded, editable): 5 GB storage per company, 25 MB max file size. [OPEN: confirm storage quota; this is the main cost risk at a flat $15, because storage and egress are the only costs that scale with a "unlimited users" promise.]
- Payment gateway (Stripe) is Phase 5+; keep a `billing_provider`/`external_customer_id` nullable fields ready. Sales tax/VAT handling is deferred.

---

## 19. UI / UX [SPEC]

Modern professional B2B SaaS. Clean enterprise dashboard, modern typography, consistent spacing, responsive layout, clear navigation, easy data tables, good filtering/search, professional forms, clear status indicators, consistent buttons/modals, useful empty states, loading and error states.

Separate experiences for: (1) company users, (2) company admins, (3) platform superadmins, (4) internal support agents, (5) external customers viewing shared reports. **Do not reuse one generic admin template for everything.** Prioritise usability for non-technical quality and shop-floor staff.

**[DECISION]**
- Three SPA "shells" in one React app (tenant app, platform-admin app, public share viewer) with separate route trees, layouts and code-split bundles.
- Tenant app routes start with `/{company_slug}/...`.
- Shop-floor friendliness: large touch targets, tablet-friendly layouts, photo capture from a phone camera in attachment upload (mobile web, no native app).
- Accessibility baseline: WCAG 2.1 AA for forms and tables, keyboard navigable.
- Language: English (US) only in MVP, but UI strings go through a single i18n layer (react-i18next) to avoid a rewrite. Dates, units and time zone are **company settings** (default time zone America/Chicago; date format MM/DD/YYYY) plus a per-user time zone override later.
- Data tables: server-side pagination, sort, filter, column visibility, saved filters later.

---

## 20. Security and Engineering Standards [SPEC]

Secure authentication, password hashing, session/token security, tenant isolation, backend permission checks, input validation, secure file handling, rate limiting, CORS, CSRF, secure env vars, DB transactions, audit logs, secure password reset, secure sharing tokens. Never trust client `company_id`. Every tenant query scoped to the active company. Constraints and indexes. Automated tenant-isolation and permission tests.

### Additional measures [DECISION]
- **Security headers:** HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none (share viewer allows none by default).
- Secrets only via environment/secret manager; `.env.example` committed, real `.env` ignored. Dependency scanning (pip-audit, npm audit, Dependabot) in CI.
- **Isolation test harness:** for every tenant endpoint, a parametrised test logs in as Company A and tries to read/modify Company B's object by ID (expect 404). A test fails CI if a tenant model lacks `company_id` or an endpoint lacks a declared permission.
- Use 404 (not 403) for cross-tenant object access to avoid existence leaks.
- Use UUIDs (or UUID public IDs) for externally exposed IDs to avoid enumeration; sequential human-readable numbers (CMP-2026-00001) are display values only and always company-scoped.
- Idempotency and optimistic concurrency (`version`/`updated_at` check) on long forms, particularly 8D sections, to avoid silent overwrites by two editors. [DECISION: optimistic locking with a clear conflict message.]
- Logging with request IDs and company IDs; **no secrets, passwords, tokens or PII in logs**.
- Backups: automated daily PostgreSQL backups with point-in-time recovery, object-storage versioning, and a **documented and tested restore** (Phase 6).
- Pen-test style checklist (OWASP ASVS L1/L2 subset) in Phase 6 security review.

---

## 21. Data Lifecycle and Compliance [DECISION]

(Not in the original brief.)
- **Data export:** a company admin can export all company data (JSON/CSV + files) on request (async job).
- **Cancellation/deletion:** after cancellation, data is retained for a grace period (default 60 days) then hard-deleted by a job; platform audit entry kept. Deletion of tenant data includes object storage.
- **Retention:** quality records often need long retention (automotive: commonly 10+ years). Default is **retain indefinitely while subscribed**; no automatic deletion of closed complaints.
- **Privacy:** privacy policy and ToS pages, a data-processing description, CCPA-style delete/export on request; personal data minimisation (username-only employees may have no email). No third-party analytics scripts on authenticated pages.
- **Terms of service / DPA** text is a business task, not engineering.

---

## 22. Code Structure [SPEC suggestion, refined by DECISION]

The brief's structure is a suggestion. Recommended consolidation to avoid circular imports (fewer, cohesive apps):

```
backend/
  config/                  # settings (base/dev/prod/test), urls, celery, asgi/wsgi
  apps/
    core/                  # tenant base models/managers, middleware, numbering, storage utils, audit helpers, events
    accounts/              # User, auth, sessions, MFA, password reset
    tenants/               # Company, Membership, Plant, Department, invitations, registration
    rbac/                  # Permission catalog, Role, RolePermission, can(), scope filters
    customers/
    complaints/            # complaints, statuses, assignees, defect categories
    eight_d_reports/       # report, sections, revisions, approvals, snapshots
    custom_fields/
    tasks/
    notifications/         # notifications, reminder rules, email
    attachments/
    activities/            # audit log
    reports_pdf/           # PDF rendering + templates registry
    customer_sharing/
    support/
    subscriptions/
    platform_admin/        # platform staff, support grants, platform audit, analytics
  tests/
frontend/
  src/
    app/ (router, providers, shells)
    components/ (ui primitives, data-table, form controls)
    features/ authentication | dashboard | employees | customers | complaints | eight-d | tasks | settings | support | platform-admin | share-viewer
    hooks/ services/ (API client) types/ utils/ i18n/
docs/
```

**Dependency rule:** `core` ← `accounts/tenants/rbac` ← domain apps ← `platform_admin`/`reports_pdf`. Domain apps never import from `platform_admin`. Cross-app interaction goes through service functions or domain events. Each app has `models.py`, `services.py`, `selectors.py` (read queries), `serializers.py`, `views.py`, `permissions.py`, `tests/`.

---

## 23. API Conventions [DECISION]

- Base: `/api/v1/`. Tenant routes: `/api/v1/c/{company_slug}/...`. Auth routes: `/api/v1/auth/...`. Platform routes: `/api/v1/platform/...`. Public share routes: `/api/v1/public/share/{token}/`.
- JSON, snake_case. Cursor or page-number pagination (consistent), `?search=`, `?ordering=`, filter params via django-filter.
- Uniform error envelope `{ "code", "message", "fields": {...}, "request_id" }`.
- OpenAPI schema generated and published at `/api/docs/`; the frontend TypeScript client types are generated from it (openapi-typescript) so the two cannot drift.
- Throttle classes per scope (auth, public share, uploads, exports).

---

## 24. Testing Strategy [DECISION]

- Backend: pytest + pytest-django + factory_boy; coverage target ≥ 80% on services and permissions.
- **Mandatory suites:** tenant isolation (every endpoint), permission scopes (all/department/assigned), auth flows (email and username), numbering concurrency, custom-field validation, snapshot immutability, share-link security, support-note visibility.
- Frontend: Vitest + React Testing Library for components/hooks; Playwright for 3 to 5 critical E2E flows (register → login → complaint → 8D → PDF).
- CI (GitHub Actions): lint, type check, tests, migrations check (`makemigrations --check`), security scan, Docker build.

---

## 25. MVP Scope and Cuts [DECISION]

**MVP (must ship):** auth + registration + tenancy + RBAC + employees (both modes) → customers → complaints (list/detail/dashboard/status/assign/comments/attachments) → 8D (D0 to D8, approval, snapshot, PDF) → tasks → notifications + reminders → custom fields → audit trail → share links.

**Cut or simplify for MVP:**
- Platform admin: companies list, suspend/activate, manual subscriptions, usage view. Platform analytics beyond basic counts → later.
- Support portal: simple tickets with internal notes; no SLAs, no email-reply.
- Subscriptions: manual, one plan, no payment gateway.
- Template customisation by tenants, OEM-specific PDF formats, multi-level approvals, external customer accounts, mobile apps, SSO/SAML, WebSockets, i18n translations, Excel import (bring forward if needed for pilots).

**Vertical slice first:** register → login → create customer → create complaint, permission-checked and cross-tenant-tested, before anything else is built.

---

## 26. Development Phases [SPEC, with DECISION refinements]

**Phase 0: Architecture and planning (no application code).** Inspect repo. Produce in `/docs`: ARCHITECTURE.md, DATABASE_SCHEMA.md (Mermaid ER diagram), API_DESIGN.md, DEVELOPMENT_ROADMAP.md. List assumptions, missing requirements and risks. **Wait for owner approval.**

**Phase 1: Foundation.** Slice 1 scaffolding (Django, React, Postgres, Redis, Celery, MinIO, Docker, CI skeleton, health check). Slice 2 tenancy + auth (Company, Membership, Plant, Department, registration, email and username login, forced password change, tenant middleware/base queryset, **isolation tests first**). Slice 3 RBAC (catalog, seeded roles, scopes, `can()`, DRF permission classes, tests). Slice 4 employees (invitation, username-only creation, admin reset, frontend screens).

**Phase 2: Core complaints.** Customers, complaint CRUD/list/detail, numbering, configurable statuses, assignment, attachments, comments, dashboard, audit hooks.

**Phase 3: 8D reporting.** Report creation, D0 to D8 structured sections, team, section ownership and comments, tasks, evidence, status workflow, approval, snapshots/revisions/locking, PDF export.

**Phase 4: Advanced.** Dynamic custom fields (+ PDF integration), Celery reminders, in-app and email notifications, full audit history UI, customer share links, (optional) Excel import.

**Phase 5: Platform administration.** Superadmin, company management, support portal, SupportAccessGrant, subscription management, platform analytics.

**Phase 6: Production readiness.** Test hardening, production Docker config, CI/CD, logging, Sentry, backups/restore drill, deployment, security review, performance tuning, RLS (if not already on).

Each phase ends with: green tests, updated docs, tagged commit, owner review.

---

## 27. Key Product Principles [SPEC]

1. Multi-tenant SaaS, not single-company. 2. Company data always isolated. 3. Users may belong to multiple companies. 4. Employee email optional for username accounts. 5. Roles and permissions configurable. 6. Departments and plants supported. 7. Complaints can exist without 8D. 8. A complaint may have multiple 8D reports. 9. 8D sections hold structured data. 10. Custom fields are essential. 11. PDF supports custom fields. 12. Superadmin is separate from company admin. 13. Support supports internal-only notes. 14. Pricing and limits configurable. 15. No AI in the initial product. 16. Architecture extensible to future QMS modules: CAPA, document control, audits, supplier quality, inspection management.

**[DECISION] Extensibility hooks:** generic activity/comment/attachment targeting, configurable statuses, custom-field entity types, and the permission catalog are all designed so new modules (e.g. CAPA) plug in without schema rewrites.

---

## 28. Open Questions (owner to confirm; defaults apply if unanswered)

| # | Question | Default used |
|---|---|---|
| 1 | Enable PostgreSQL RLS in MVP? | Design now, enable after core models stabilise (by Phase 6) |
| 2 | Mandatory MFA for Company Admins? | Optional (mandatory for platform staff) |
| 3 | Approval: single vs multi-level; e-signature? | Single level, typed name + timestamp |
| 4 | Free trial length / card required? | 14 days, no card |
| 5 | Storage quota and max file size? | 5 GB / 25 MB per company |
| 6 | First OEM-specific 8D templates? | Standard layout only |
| 7 | Virus scanning of uploads? | Off, hook ready |
| 8 | Support access: customer approval or notify-only? | Approval unless ticket-initiated |
| 9 | Bring Excel import into MVP? | Phase 4 |
| 10 | Hosting target (AWS, Render, Fly, DigitalOcean, VPS)? | Cloud-agnostic Docker; decide in Phase 6 |
| 11 | Domain/subdomain strategy (`app.example.com/{slug}` vs `{slug}.example.com`)? | Path-based slug, simpler TLS and cookies |
| 12 | Need for languages other than English? | No, i18n layer only |

---

## 29. Top Risks and Mitigations

1. **Tenant data leakage:** base manager, composite indexes, 404 on cross-tenant, mandatory isolation tests, RLS.
2. **RBAC complexity spreading into every view:** single `can()`/`scope_queryset()` module; declared permission per view enforced by test.
3. **Custom-field drift between definition, data and PDF:** versioned definitions + schema snapshot per record + snapshot-based PDFs.
4. **Storage/egress cost under flat $15 pricing:** quotas, file-size caps, R2/B2-style storage, usage tracking.
5. **Concurrency bugs** (numbering, simultaneous 8D edits): row-locked sequences, optimistic locking.
6. **Scope creep from platform surface** (admin, support, billing) before the core is validated: strict MVP cuts in §25.
7. **PDF fidelity and speed:** async rendering, snapshot input, golden tests; revisit Chromium only if WeasyPrint proves insufficient.
8. **Notification duplicates/missed reminders:** DB-enforced dedupe log, idempotent tasks, company-time-zone evaluation.
9. **Support access abuse:** grant model, MFA, platform audit, customer-visible access log.
10. **Over-engineering:** every feature outside §25 MVP list needs explicit owner approval.

---

## 30. Definition of Done (per slice)

- Code merged with passing CI (lint, types, tests, migration check).
- Tenant-isolation and permission tests added for any new endpoint/model.
- OpenAPI updated; docs in `/docs` updated where decisions changed.
- Migrations reviewed (no destructive changes without note).
- Manual smoke test via `docker compose up` described in the PR/summary.
- No secrets in repo; `.env.example` updated.
