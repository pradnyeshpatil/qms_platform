# Development roadmap

Status of `PROJECT_SPEC.md` §26. Each phase ends with green tests, updated docs, a tagged commit and owner review.

| Phase | Status |
|---|---|
| 0 Architecture & planning | **Done** — `docs/*` (written retrospectively alongside Phase 1) |
| 1 Foundation | **Done** — see below |
| 2 Core complaints | Partly: customers, complaint CRUD/list/detail/numbering/dashboard exist. Missing: configurable statuses, assignees, attachments, comments, audit hooks |
| 3 8D reporting | Not started |
| 4 Advanced (custom fields, Celery reminders, notifications, audit UI, share links) | Not started |
| 5 Platform administration | Not started |
| 6 Production readiness | Not started |

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
