export type RoleRef = { id: string; name: string; system_key: string | null }
export type Membership = {
  id: string
  status: string
  role: RoleRef
  /** {permission code: scope}. Only used to hide controls; the API enforces everything. */
  permissions: Record<string, 'all' | 'department' | 'assigned'>
  company: { id: string; name: string; slug: string }
}
export type Me = {
  id: string; email: string | null; first_name: string; last_name: string
  must_change_password: boolean; memberships: Membership[]
}
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

export type Customer = {
  id: string; name: string; contact_person: string; email: string; phone: string
  country: string; status: 'active' | 'inactive'; created_at: string
}

export const SEVERITIES = ['minor', 'major', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]
export const SOURCES = ['email', 'phone', 'portal', 'audit', 'other'] as const
export type Source = (typeof SOURCES)[number]
export const SOURCE_LABEL: Record<Source, string> = {
  email: 'Email', phone: 'Phone', portal: 'Customer portal', audit: 'Audit', other: 'Other',
}

/** Company-configurable workflow status. Logic keys off `category`, never the name. */
export const STATUS_CATEGORIES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const
export type StatusCategory = (typeof STATUS_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  open: 'Open', in_progress: 'In progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed',
}
export type WorkflowStatus = {
  id: string; name: string; category: StatusCategory; system_key: string; is_default: boolean
  is_active: boolean; sort_order: number; is_finished: boolean; allowed_next: string[]
}
export type DefectCategory = { id: string; name: string; is_active: boolean }

export type Complaint = {
  id: string; number: string; customer: string; customer_name: string; customer_reference_number: string
  title: string; description: string; product_name: string; part_number: string; batch_number: string
  quantity_affected: number | null; defect_category: string | null; defect_category_name: string | null
  severity: Severity; source: Source; status: string; status_name: string; status_category: StatusCategory
  reported_date: string | null; due_date: string | null; closure_comment: string; closed_at: string | null
  owner: string | null; owner_name: string | null; assignees: { id: string; name: string }[]
  plant: string | null; department: string | null; is_overdue: boolean; created_at: string; updated_at: string
  /** Present on create / update / change-status responses. */
  warnings?: ApiWarning[]
}
export type ApiWarning = { code: string; message: string; blocking?: boolean; complaints?: { id: string; number: string; title: string }[] }

export type CardRow = {
  id: string; number: string; title: string; severity: Severity; customer_name: string; status_name: string
  due_date: string | null; created_at: string
}
export type Bucket = { id: string | null; name: string; count: number }
export type DashboardStats = {
  total: number; open: number; overdue: number; by_severity: Record<Severity, number>
  by_status: (Bucket & { category: StatusCategory })[]
  by_customer: Bucket[]; by_department: Bucket[]; by_employee: Bucket[]
  recent: CardRow[]; upcoming_deadlines: CardRow[]
}

export type CommentVisibility = 'internal' | 'customer_visible'
export type Comment = {
  id: string; target_type: string; target_id: string; body: string; visibility: CommentVisibility
  author: string | null; author_name: string | null; is_edited: boolean; can_edit: boolean
  edited_at: string | null; created_at: string
}
export type CommentEdit = { id: string; previous_body: string; edited_at: string }

export type Attachment = {
  id: string; target_type: string; target_id: string; original_name: string; content_type: string; size: number
  uploaded_by: string | null; download_url: string; thumbnail_url: string | null; created_at: string
}

export type ActivityEntry = {
  id: string; action: string; actor_user_id: string | null; actor_name: string; target_type: string
  target_id: string | null; target_label: string; changes: Record<string, unknown>; created_at: string
}
export type AuditEntry = ActivityEntry & { ip_address: string | null; user_agent: string; request_id: string }

export type Plant = { id: string; name: string; code: string; is_active: boolean }
export type Department = { id: string; name: string; plant: string | null; is_active: boolean }

export type Employee = {
  id: string; user_id: string; email: string | null; first_name: string; last_name: string; phone: string
  username: string | null; employee_id: string; status: 'invited' | 'active' | 'inactive'
  role: RoleRef; department: { id: string; name: string } | null; plant: { id: string; name: string } | null
  joined_at: string; must_change_password: boolean; invitation_expires_at: string | null
  /** One-time secrets, present only on the response that created / reset them. */
  temporary_password?: string; dev_invite_url?: string
}

export const SCOPES = ['all', 'department', 'assigned'] as const
export type Scope = (typeof SCOPES)[number]
export type Grant = { code: string; scope: Scope }
export type Role = {
  id: string; name: string; description: string; is_system: boolean; system_key: string | null
  is_active: boolean; member_count: number; permissions: Grant[]
}
export type PermissionDef = { code: string; module: string; description: string; scopable: boolean }
