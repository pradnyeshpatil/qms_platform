# Phase 3 plan: 8D reporting

Source: `PROJECT_SPEC.md` §9, §11, §13, §20, §26. Backend first, then frontend, then PDF.

## Slices

| Slice | Scope | Status |
|---|---|---|
| 3.1 `eight_d_reports` backend | Report + numbering, D0-D8 structured sections, section tracking/ownership, status workflow, approval, snapshots/revisions/locking, optimistic locking, closure check, audit, comments/attachments targets | Backend done |
| 3.2 `tasks` backend | Task model, assign/complete/status, scope rules, links to complaint / 8D report / section, action rows -> tasks, closure check | Backend done |
| 3.3 Frontend | 8D list/detail/editor (one tab per section), approval and revision UI, task list and complaint/8D task panels | Done (verified end to end in a headless browser) |
| 3.4 PDF export | Render from a `ReportRevision` snapshot, standard template, `eight_d_reports.export` | Next (library choice pending) |

## Decisions made (defaults, override if you disagree)

* **8D lifecycle is a fixed enum**, not per-company rows: draft -> in_progress -> pending_approval -> approved -> submitted -> closed.
  Complaints needed configurable statuses; the spec fixes the 8D lifecycle, so there is nothing for a tenant to configure.
* **Editable states:** draft and in_progress only. pending_approval is read-only too (approver reviews a stable document);
  rejection returns it to in_progress. approved/submitted/closed are locked.
* **Optimistic locking:** every section singleton and child row has an integer `version`. Updates must send the version they read;
  a mismatch returns `409 edit_conflict`.
* **Completion rules:** required sections for approval request = D1, D2, D3, D4, D5, D6, D8 (D0, D7 recommended). Marking a
  section complete runs per-section minimum-content checks (e.g. D4 needs a root cause, D5 needs a selected action).
* **Approval:** single level. Approver is chosen per report; deciding needs `eight_d_reports.approve`, and if an approver is
  set only that person (or an admin-scope holder) may decide. Approving needs a typed signature name; rejecting needs a comment.
  Time and IP are recorded. `ReportApproval` rows carry `revision`, so multi-level chains can be added later.
* **Snapshots:** an immutable `ReportRevision` JSON snapshot is written on approve and on submit. Reopen (new permission
  `eight_d_reports.reopen`, reason required) bumps `revision` and returns to in_progress.
* **Scope:** "assigned" = team leader, D1 team member, or section owner. Department scope uses the report's `department`,
  inherited from the complaint at creation.
* **Complaint closure:** open 8D reports and unfinished tasks are returned as warnings via the existing closure-check registry.
  Blocking is a Django setting for now (`EIGHT_D_BLOCKS_COMPLAINT_CLOSURE`, `TASKS_BLOCK_COMPLAINT_CLOSURE`, default false);
  a per-company switch needs the company-settings model from Phase 5.
* **Tasks:** fixed statuses (todo, in_progress, blocked, done, cancelled) and priorities for now; configurable statuses are a
  later extension. Action rows (D3/D5/D6/D7) can create a linked task; completing the task stamps the row's completion date.
* **Custom fields (Phase 4):** snapshots reserve a `custom_data` key per section so the format does not change later.

## Added during Phase 3: custom fields for 8D reports

Company admins add their own fields to the report header or to any section (`/:slug/settings/custom-fields`). Design in `ARCHITECTURE.md`.
Spec §10 also lists complaints, per-row fields and file-upload fields; those remain for a follow-up.

## Not in Phase 3

Custom fields on complaints, notifications/reminders (Celery), share links, background virus scanning, multi-level approval, OEM templates.

## Test plan

Workflow transitions and permission gates, completion rules, approval/rejection, snapshot immutability, reopen, optimistic
locking, scope (department/assigned), cross-tenant isolation (404) for reports and every child resource, closure-check
integration, task rules, numbering uniqueness.
