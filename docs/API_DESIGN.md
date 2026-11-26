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
| `eight-d-reports/` | list/retrieve `eight_d_reports.view` (scoped; retrieve returns header + every section) · create `.create` (body `complaint`; title/leader/approver default) · `PATCH` header `.update` (+`version`) · delete `.update` (drafts only) |
| `eight-d-reports/{id}/data/{d0,d2,d4,d8}/` | `GET` `.view` · `PATCH` `.update` — body carries `version`; stale ⇒ `409 edit_conflict` |
| `eight-d-reports/{id}/sections/{D0..D8}/status/`, `owner/` | `.update` — `complete` runs the section's minimum-content checks |
| `eight-d-reports/{id}/request-approval/` | `.update` — needs D1,D2,D3,D4,D5,D6,D8 complete and an approver; locks the report |
| `eight-d-reports/{id}/decide/` | `eight_d_reports.approve` — `approved` needs `signed_name`, `rejected` needs `comment`; approval writes a snapshot |
| `eight-d-reports/{id}/submit/`, `close/` | `.update` — submit records `method` + `recipient`, writes a second snapshot |
| `eight-d-reports/{id}/reopen/` | `eight_d_reports.reopen` — `reason` required, bumps `revision` |
| `eight-d-reports/{id}/revisions/`, `revisions/{rev_id}/` | `.view` — immutable snapshots (what the PDF renders from) |
| `eight-d-{team-members,containment-actions,why-steps,fishbone-causes,corrective-actions,validations,preventive-actions}/` | list/retrieve `.view` (`?report=`) · create/update/delete `.update` (rows carry `version`; report must be editable) |
| `eight-d-{containment,corrective,validations,preventive}-actions/{id}/create-task/` | `tasks.create` — links a task to the action row |
| `custom-fields/` | list/retrieve any member (`?entity_type=eight_d_report&section=&is_active=`) · create/update `custom_fields.manage` · no delete (deactivate with `is_active=false`) |
| `eight-d-reports/{id}` `PATCH {custom_data, version}` | report-level company fields · `sections/{D0..D8}/custom/` `POST {custom_data, version}` for a section's fields; `null` clears a value; errors come back as `fields["custom_data.<key>"]` |
| `tasks/` | list/retrieve `tasks.view` (scoped) · create `.create` (assigning someone else needs `.assign`) · update `.update` · delete `.update` |
| `tasks/{id}/complete/`, `change-status/` | `tasks.complete` for done · `tasks.update` to reopen; filters `mine`, `open`, `overdue`, `complaint`, `eight_d_report` |
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
