# QMS Platform

Multi-tenant Quality Management System (see `PROJECT_SPEC.md`). **Phase 1 (foundation) is complete:**
register company → email or workspace/username login → RBAC (roles, permissions, scopes) → employees
(invitations, username-only accounts, lifecycle) → plants & departments → customers → complaints → dashboard,
with strict tenant isolation. Design docs: [`docs/`](docs/).

**Stack:** Django 5 + DRF + PostgreSQL (Python 3.12), React + TS + Vite + Tailwind (shadcn-style components), Redis (reserved, not used yet).

## Run with Docker (recommended)

```bash
cp .env.example .env
docker compose up --build            # postgres, redis, backend (migrates on start), frontend
docker compose exec backend python manage.py seed_demo   # in a 2nd terminal
```

| What | URL |
|---|---|
| Public website (signed-out) / app (signed-in) | http://localhost:5173 |
| API docs (Swagger) | http://localhost:8000/api/docs/ |
| Django admin | http://localhost:8000/admin/ |

**Demo logins** (password `DemoPass123!` for all). Email: `admin@demo.test` (Company Admin). Username tab, workspace `demo`:
`quality.manager`, `quality.engineer`, `prod.supervisor` (Production dept only), `prod.operator` (assigned only), `viewer`.
Or click *Register your company* to make your own workspace.

Invitation emails print to the backend console in dev; in `DEBUG` the API also returns the link and the UI shows it once.

Both services hot-reload from your working tree.

## Tests

```bash
docker compose exec backend python -m pytest
```

Covers registration, login (email + username), CSRF, cross-tenant isolation, RBAC (permissions, department/assigned scopes,
lockout protection, "every endpoint declares a permission"), employee onboarding (invitations, temp passwords, deactivation) and org data.

## Run without Docker

```bash
# backend (needs a local PostgreSQL; create db/user per .env.example)
cd backend && uv venv --python 3.12 .venv && uv pip install -r requirements.txt --python .venv/bin/python
export POSTGRES_HOST=localhost POSTGRES_USER=qms POSTGRES_PASSWORD=qms POSTGRES_DB=qms
.venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_demo && .venv/bin/python manage.py runserver
# frontend
cd frontend && npm install && npm run dev
```

## Layout / design notes

- `backend/apps/core` — `TenantModel` + `TenantManager.for_company()`, row-locked `NumberSequence`, `IsActiveCompanyMember` permission, scoped-FK serializer field.
- Tenant routes: `/api/v1/c/{company_slug}/...`. The company comes only from the URL after an **active membership** check; non-members get **404**; `company`/`company_id` in a request is rejected with 400.
- Business logic lives in each app's `services.py`; read queries in `selectors.py`.
- Complaint numbers `CMP-{YYYY}-{00001}` via `SELECT ... FOR UPDATE` on a per-company/year counter.

## Phase 2 backend (complaints core) — done

Configurable complaint statuses (per company, with a category; optional transition limits) and defect categories ·
workflow rules (closing needs `complaints.close` + a closure comment, reopening is permissioned and audited) ·
owner + additional assignees (`assign` endpoint, "assigned" scope covers both) · duplicate warning ·
extended dashboard (by status/customer/department/employee, recent, upcoming, date range) · filters + CSV export ·
comments (internal / customer-visible, edit window + history, soft delete) · attachments (extension allowlist + magic-byte
check, 25 MB limit, per-company quota, safe storage keys, permission-checked download) · append-only audit trail
(model + queryset + PostgreSQL trigger) with per-record history and a company audit log (`audit.view`).
Comments, attachments and history attach to any record through a target registry (`apps/core/targets.py`), ready for 8D/tasks.

**Also in Phase 2:** uniform error envelope `{code, message, detail, fields, request_id}` on every API error (`detail` repeats
`message`; per-field messages are in `fields`) · XLSX export (`complaints/export/?export_format=xlsx`) · 256px JPEG thumbnails for
image attachments (`attachments/{id}/thumbnail/`, generated inline at upload) · closing-time checks (`apps/complaints/closure.py`):
8D/tasks register findings that either warn or block a close.

**Attachment storage:** local disk by default (`ATTACHMENT_ROOT`, default `backend/media`). For S3 / MinIO:
`pip install -r backend/requirements-s3.txt` and set `ATTACHMENT_STORAGE=s3`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and for MinIO
`S3_ENDPOINT_URL` (optional `S3_REGION`, `S3_ADDRESSING_STYLE`, `ATTACHMENT_URL_TTL_SECONDS`). Downloads then redirect to a short-lived
presigned URL issued after the permission check. (The redirect logic is tested; a live S3/MinIO round-trip has not been run.)

## Phase 2 frontend — done (new design)

The Phase 2 screens use a new design language; the rest of the app (customers, employees, roles, plants, auth) is unchanged and will be
migrated page by page. Redesigned: **dashboard**, **complaints list** (quick filters, search, URL-synced filters, export to CSV/Excel),
**create/edit drawer** (live duplicate warning), **complaint detail** (workflow stepper, status dialog with closure rules, assign dialog,
comments with edit/history, drag-and-drop files with thumbnails, activity timeline), **complaint settings** (statuses, defect types),
**audit log**. The sidebar/shell was modernised for all in-app pages.

- Design kit: `frontend/src/components/kit/*` (buttons, inputs, pills, drawer/modal, tabs, menus, motion helpers). Old primitives in
  `components/ui/*` still serve the unmigrated pages. Colour language lives in `kit/theme.ts` (status category → colour, severity → colour).
- Motion: `motion` (page/list reveals, sliding tabs, stepper, count-up, bar/donut charts), respecting *reduce motion* via `MotionConfig`.
- Toasts: `sonner`. Overlays/menus/tabs: Radix. Font: Inter (self-hosted via `@fontsource-variable/inter`).
- Tests: `cd frontend && npm test` (Vitest + Testing Library, happy-dom) — error envelope, date/size formatting, activity sentences,
  workflow rules, upload checks, kit components and regression tests for panels that load lazily.

## Not built yet

Phase 3+ (see `docs/DEVELOPMENT_ROADMAP.md`): 8D reports, tasks, custom fields, notifications/Celery, share links; new design for the remaining pages.
Known Phase 1 gaps: login rate limiting, email verification, self-service password reset, session management, MFA, RLS.
