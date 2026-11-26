# Development roadmap

Status of `PROJECT_SPEC.md` §26. Each phase ends with green tests, updated docs, a tagged commit and owner review.

| Phase | Status |
|---|---|
| 0 Architecture & planning | **Done** — `docs/*` (written retrospectively alongside Phase 1) |
| 1 Foundation | **Done** — see below |
| 2 Core complaints | **Done** (backend + frontend in the new design, unified Phase 1 pages, unit tests) |
| 3 8D reporting | **In progress** — backend and frontend done (156 backend + 39 frontend tests green); PDF export next. See `PHASE_3_PLAN.md` |
| 4 Advanced (custom fields [8D reports done early, see Phase 3], Celery reminders, notifications, audit UI, share links) | Not started |
| 5 Platform administration | Not started |
| 6 Production readiness | Not started |
| Final polish pass | Planned for after the main features: Playwright E2E suite in CI, JS bundle code-splitting (single chunk > 500 kB), dark mode |

## Phase 1 — delivered

* **Slice 1 scaffolding:** Django + React + Postgres + Redis (reserved) + Docker, health check `GET /api/v1/health/`, GitHub Actions CI
  (system check, migration-drift check, tests, lint, type-check/build, informational dependency audits).
* **Slice 2 tenancy + auth:** Company/Membership/Plant/Department, registration seeding (6 roles, Main Plant, 6 departments, trial end date),
  email **and** workspace+username login, forced password change, tenant resolution, isolation tests.
* **Slice 3 RBAC:** catalog, seeded roles, scopes, `can()`/`scope_queryset()`, `HasCompanyPermission`, role CRUD with lockout protection,
  "every endpoint declares a permission" test, existing customers/complaints/dashboard retrofitted.
* **Slice 4 employees:** invitations (hashed, expiring, single-use, resend/revoke, existing-user attach), username-only creation with one-time
  temporary password, admin reset, edit, deactivate/reactivate with session revocation, last-admin protection; screens for employees,
  roles & permissions, plants & departments, accept-invite, change-password.

## Known gaps carried out of Phase 1 (deliberate, with owner/phase)

| Gap | Spec ref | Plan |
|---|---|---|
| Login rate limiting / progressive lockout (Redis) | §4 | Before any external pilot; latest Phase 6 |
| Email verification before inviting / external sharing | §3.3 | Phase 4 (needed for share links) |
| Self-service password reset for email users | §4 | Phase 4 with notifications/email templates |
| Session list/revoke UI, idle & absolute timeouts | §4 | Phase 6 |
| MFA (mandatory for platform staff) | §4 | Phase 5 |
| Row-Level Security | §3.2 | Phase 6 (indexes already `company_id`-first) |
| Subscription row on registration | §3.3 | Phase 5 (`Company.trial_ends_at` already set) |
| Complaint/8D statuses seeded per company | §3.3 | Phase 2 / 3 |
| Uniform error envelope `{code,message,fields,request_id}` | §23 | Phase 2 (touches every client call) |
| Frontend unit/E2E tests (Vitest, Playwright) | §24 | Phase 2 |
| CI Docker image build | §24 | Phase 6 |

## Open questions (defaults applied)

Trial length 14 days · Company Admin MFA optional · one role per membership · RLS timing (Phase 6).

## Phase 2 backend — delivered

New endpoints under `/api/v1/c/{slug}/`: `complaint-statuses`, `defect-categories` (read: any member, write: `settings.manage`);
`complaints/{id}/assign|change-status`, `complaints/duplicates`, `complaints/export` (CSV); `comments` (+`/{id}/history`),
`attachments` (+`/{id}/download`), `activity?target_type&target_id` (record history), `audit-log` (`audit.view`).
**Breaking vs Phase 1:** `Complaint.status` is now a status id (responses add `status_name`, `status_category`); the complaint
payload gains `assignees`, `batch_number`, `defect_category`, `source`, `quantity_affected`, `customer_reference_number`,
`reported_date`, `closure_comment`, `closed_at`; the dashboard gains `by_status`, `by_customer`, `by_department`, `by_employee`,
`recent`, `upcoming_deadlines`. Create responses carry `warnings` (possible duplicates).

Also delivered afterwards: uniform error envelope (`apps/core/exceptions.py`), XLSX export, inline image thumbnails
(`make_thumbnail` is Celery-ready), optional S3/MinIO storage with presigned downloads, and the closure-check registry
(`apps/complaints/closure.py`) that 8D reports / tasks will plug into in Phase 3.

**Frontend work this implies:** `ApiError` must read `fields` (field errors moved out of the top level) and `message`/`code`;
status is an id; new screens (status/defect settings, comments, attachments + thumbnails, activity, audit log, export buttons).

Deferred to later phases: background thumbnail generation and virus scanning (Celery, Phase 4), 8D/task closure checks (Phase 3).

## Phase 2 frontend — delivered

New design system in `frontend/src/components/kit`, applied to the Phase 2 screens only (see README). `ApiError` now reads the error
envelope (`fields`, `message`, `code`, `request_id`) and keeps working with the old shapes, so unmigrated pages keep their field errors.
Verified by driving the real app with a headless browser (create → comment → upload → assign → close/reopen → settings → audit, plus
viewer and engineer permission checks and a phone-width pass) on a throwaway database copy; Vitest covers the pure logic and components.

Remaining pages (customers, employees, roles, organisation, auth) were migrated to the kit in PR #3 (`feature/uniform-ui`).
Playwright E2E, bundle code-splitting and dark mode are deliberately deferred to the final polish pass (see the table above).

## Phase 3 backend — delivered

`apps/eight_d_reports` and `apps/tasks`; plan and decisions in `PHASE_3_PLAN.md`, endpoints in `API_DESIGN.md`.
New permission `eight_d_reports.reopen` (migration `rbac/0002` grants it to existing Company Admin / Quality Manager roles).
New settings: `EIGHT_D_BLOCKS_COMPLAINT_CLOSURE`, `TASKS_BLOCK_COMPLAINT_CLOSURE` (default false = warn only).
Phase 3 frontend: `features/eight-d` (list, editor with D0-D8, workflow/approval, snapshots) and `features/tasks`; complaint detail gained 8D and Tasks tabs. Still open in Phase 3: PDF export (3.4).
