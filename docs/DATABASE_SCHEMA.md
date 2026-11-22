# Database schema (through Phase 1)

```mermaid
erDiagram
    COMPANY ||--o{ MEMBERSHIP : has
    USER ||--o{ MEMBERSHIP : "belongs via"
    COMPANY ||--o{ ROLE : owns
    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : "granted as"
    ROLE ||--o{ MEMBERSHIP : "assigned to"
    COMPANY ||--o{ PLANT : has
    COMPANY ||--o{ DEPARTMENT : has
    PLANT ||--o{ DEPARTMENT : "optionally contains"
    PLANT ||--o{ MEMBERSHIP : "primary plant"
    DEPARTMENT ||--o{ MEMBERSHIP : "primary department"
    MEMBERSHIP ||--o{ INVITATION : receives
    COMPANY ||--o{ CUSTOMER : has
    COMPANY ||--o{ COMPLAINT : has
    CUSTOMER ||--o{ COMPLAINT : raises
    MEMBERSHIP ||--o{ COMPLAINT : owns
    DEPARTMENT ||--o{ COMPLAINT : "tagged"
    PLANT ||--o{ COMPLAINT : "tagged"
    COMPANY ||--o{ NUMBER_SEQUENCE : counts

    COMPANY { uuid id PK; string slug UK "immutable"; string name; string status "trial|active|suspended|cancelled|deleted_pending"; datetime trial_ends_at; string timezone }
    USER { uuid id PK; string email UK "nullable, unique ci"; string first_name; string last_name; string phone; bool must_change_password; string password "argon2" }
    MEMBERSHIP { uuid id PK; uuid user_id FK; uuid company_id FK; uuid role_id FK; uuid department_id FK; uuid plant_id FK; string username "unique per company ci"; string employee_id "unique per company ci"; string status "invited|active|inactive" }
    PERMISSION { int id PK; string code UK; string module }
    ROLE { uuid id PK; uuid company_id FK; string name "unique per company ci"; bool is_system; string system_key; bool is_active }
    ROLE_PERMISSION { int id PK; uuid role_id FK; int permission_id FK; string scope "all|department|assigned" }
    PLANT { uuid id PK; uuid company_id FK; string name; string code; bool is_active; datetime deleted_at }
    DEPARTMENT { uuid id PK; uuid company_id FK; uuid plant_id FK; string name; bool is_active; datetime deleted_at }
    INVITATION { uuid id PK; uuid membership_id FK; string token_hash UK "sha256"; datetime expires_at; datetime accepted_at; datetime revoked_at }
    CUSTOMER { uuid id PK; uuid company_id FK; string name; string status; datetime deleted_at }
    COMPLAINT { uuid id PK; uuid company_id FK; string number "CMP-YYYY-NNNNN"; uuid customer_id FK; uuid owner_id FK; uuid department_id FK; uuid plant_id FK; string severity; string status; date due_date; datetime deleted_at }
    NUMBER_SEQUENCE { int id PK; uuid company_id FK; string key; int year; int last_value }
```

## Constraints worth knowing

| Constraint | Purpose |
|---|---|
| `uniq_user_email_ci` (partial, email not null) | Email unique case-insensitively; username-only users have `NULL` |
| `uniq_membership_user_company` | One membership per user per company |
| `uniq_membership_company_username_ci` | Username unique **per company** |
| `uniq_membership_company_employee_id_ci` (employee_id ≠ '') | Employee IDs unique per company |
| `uniq_role_company_name_ci`, `uniq_role_company_system_key` | Role names unique per company; one of each system role |
| `uniq_plant/department_company_name_ci` (not deleted) | No duplicate names among live rows |
| `uniq_number_sequence` + `SELECT … FOR UPDATE` | Gap-free-ish, race-free complaint numbers per company/year |
| `Invitation.token_hash` unique | Token lookup by hash only; raw token never stored |

`Membership.role/department/plant` use `PROTECT`: reference data in use is deactivated, not deleted.
Soft delete (`deleted_at`) on business records via `TenantModel`.

## Migrations

`tenants.0002–0004` convert the original string `Membership.role` into a company-owned `Role` FK: rename old column →
add nullable FK → data migration seeds default roles/plant/departments for every existing company and maps old role strings →
drop the old column and make the FK required.
