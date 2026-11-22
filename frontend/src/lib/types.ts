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
export const STATUSES = ['new', 'under_investigation', 'resolved', 'closed'] as const
export type Severity = (typeof SEVERITIES)[number]
export type ComplaintStatus = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  new: 'New', under_investigation: 'Under Investigation', resolved: 'Resolved', closed: 'Closed',
}

export type Complaint = {
  id: string; number: string; customer: string; customer_name: string; title: string; description: string
  product_name: string; part_number: string; severity: Severity; status: ComplaintStatus
  due_date: string | null; owner: string | null; owner_name: string | null; is_overdue: boolean
  created_at: string; updated_at: string
}

export type DashboardStats = { total: number; open: number; overdue: number; by_severity: Record<Severity, number> }

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
