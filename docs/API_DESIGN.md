# API design (through Phase 1)

Base `/api/v1/`. JSON, snake_case, session cookie + `X-CSRFToken` on unsafe methods. OpenAPI at `/api/docs/`.
Lists are paginated `{count, next, previous, results}` except small reference lists (plants, departments, roles).
Errors: DRF default (`{field: [msgs]}` or `{detail}`); some carry a machine `code`
(`password_change_required`, `company_inactive`).

Status conventions: **401/403** unauthenticated · **403** authenticated member lacking the permission ·
**404** not a member / cross-tenant object / out-of-scope record · **400** validation or rule violation.

## Public / auth (`/api/v1/auth/…`, `/api/v1/health/`)

| Method & path | Notes |
|---|---|
| `GET /health/` | Liveness + DB check |
| `GET /auth/csrf/` | Sets the CSRF cookie |
| `POST /auth/register/` | Creates company + seeded workspace + admin, signs in |
| `POST /auth/login/` | `{email,password}` **or** `{workspace,username,password}` |
| `POST /auth/logout/` | |
| `GET /auth/me/` | User, `must_change_password`, memberships with `role` and `permissions {code: scope}` |
| `POST /auth/change-password/` | `{current_password,new_password}`; clears the forced-change flag |
| `GET /auth/invitations/preview/?token=` | Company/email for the accept page; 400 for any bad token |
| `POST /auth/invitations/accept/` | `{token,password?}`; new account sets a password and is signed in; existing account must already be signed in |

## Tenant (`/api/v1/c/{slug}/…`) — permission required

| Resource | Endpoints → permission |
|---|---|
| `customers/` | list/retrieve `customers.view` · create `.create` · update `.update` · delete `.delete` |
| `complaints/` | list/retrieve `complaints.view` (scoped) · create `.create` · update `.update` (+`.assign` to change owner, `.close` to resolve/close) · delete `.delete` |
| `dashboard/` | `complaints.view` (scoped counts) |
| `plants/`, `departments/` | list/retrieve any member · write `plants.manage` / `departments.manage`; delete refused while in use |
| `roles/` | list/retrieve `users.view` · create/update/delete `roles.manage` (body `permissions: [{code, scope}]` replaces grants) |
| `permissions/` | catalog, `roles.manage` |
| `employees/` | list/retrieve `users.view` · `PATCH` `users.update` |
| `employees/invite/` | `users.create` — email invitation |
| `employees/create-username/` | `users.create` — returns `temporary_password` once if generated |
| `employees/{id}/resend-invitation/`, `revoke-invitation/` | `users.create` |
| `employees/{id}/deactivate/`, `reactivate/` | `users.deactivate` |
| `employees/{id}/reset-password/` | `users.update` — username-only accounts; returns `temporary_password` once |

Search/filter/order: `?search=`, `?ordering=`, plus `status`, `severity`, `customer`, `owner`, `overdue` where relevant.

## Rules worth testing against

* Never send `company`/`company_id` (400). Reference ids (role, department, plant, customer, owner) must belong to the active company.
* Every endpoint must declare a permission (or `authz_exempt`); enforced by a test.
* Secrets (`temporary_password`, `dev_invite_url`) appear only in the response that created them; `dev_invite_url` only when `DEBUG`.
