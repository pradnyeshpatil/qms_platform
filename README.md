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
| App | http://localhost:5173 |
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

## Not built yet

Phase 2+ (see `docs/DEVELOPMENT_ROADMAP.md`): configurable complaint statuses, attachments, comments, audit log, 8D reports, custom fields,
notifications/Celery. Known Phase 1 gaps: login rate limiting, email verification, self-service password reset, session management, MFA, RLS.
# qms_platform
