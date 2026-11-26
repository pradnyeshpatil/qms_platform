export type EightDStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'submitted' | 'closed'
export const EIGHT_D_STATUS: Record<EightDStatus, { label: string; pill: string; dot: string }> = {
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', pill: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
  pending_approval: { label: 'Pending approval', pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  approved: { label: 'Approved', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  submitted: { label: 'Submitted', pill: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500' },
  closed: { label: 'Closed', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-500' },
}

export const SECTION_CODES = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const
export type SectionCode = (typeof SECTION_CODES)[number]
export type SectionStatus = 'not_started' | 'in_progress' | 'complete'

export type Section = {
  id: string; code: SectionCode; status: SectionStatus; owner: string | null; owner_name: string | null
  completed_at: string | null; version: number
  custom_data: Record<string, unknown>; custom_schema: Record<string, CustomSchemaEntry>
}
export type Completion = {
  complete: number; total: number; percent: number; required_sections: SectionCode[]
  missing_required: SectionCode[]; ready_for_approval: boolean
}

/** A section record or row: always has id + version, other keys depend on the section. */
export type Row = { id: string; version: number } & Record<string, unknown>
export type TaskRef = { id: string; status: string } | null

export type Approval = {
  id: string; revision: number; level: number; approver_name: string; decision: 'approved' | 'rejected'
  comment: string; signed_name: string; created_at: string
}

export type EightDReport = {
  id: string; number: string; complaint: string; complaint_number: string; customer_name: string; title: string
  status: EightDStatus; revision: number; template_key: string
  team_leader: string | null; team_leader_name: string | null; approver: string | null; approver_name: string | null
  plant: string | null; department: string | null; opened_date: string | null; target_close_date: string | null
  submitted_at: string | null; submitted_method: string; submitted_to: string; closed_at: string | null
  reopen_reason: string; is_locked: boolean; completion: Completion; version: number
  custom_data: Record<string, unknown>; custom_schema: Record<string, CustomSchemaEntry>; created_at: string; updated_at: string
}
export type EightDDetail = EightDReport & {
  sections: Section[]; d0: Row; d2: Row; d4: Row; d8: Row
  team_members: Row[]; containment_actions: Row[]; why_steps: Row[]; fishbone_causes: Row[]
  corrective_actions: Row[]; validations: Row[]; preventive_actions: Row[]; approvals: Approval[]
}
export type Revision = { id: string; revision: number; kind: 'approved' | 'submitted'; created_at: string }

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type Task = {
  id: string; title: string; description: string; task_type: string; status: TaskStatus; priority: TaskPriority
  due_date: string | null; completed_at: string | null; completion_notes: string
  complaint: string | null; complaint_number: string | null; eight_d_report: string | null; report_number: string | null
  eight_d_section: string; assignee: string | null; assignee_name: string | null; is_overdue: boolean
  created_at: string
}
export const TASK_STATUS: Record<TaskStatus, { label: string; pill: string }> = {
  todo: { label: 'To do', pill: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  in_progress: { label: 'In progress', pill: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  blocked: { label: 'Blocked', pill: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  done: { label: 'Done', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  cancelled: { label: 'Cancelled', pill: 'bg-slate-100 text-slate-400 ring-slate-500/10' },
}
export const TASK_PRIORITY: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'integer', 'decimal', 'date', 'dropdown', 'multiselect', 'checkbox', 'yes_no'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]
export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Short text', textarea: 'Long text', integer: 'Whole number', decimal: 'Decimal number', date: 'Date',
  dropdown: 'Dropdown', multiselect: 'Multi-select', checkbox: 'Checkbox', yes_no: 'Yes / No',
}
export type CustomFieldOption = { value: string; label: string }
export type CustomFieldDef = {
  id: string; entity_type: 'eight_d_report'; section: '' | SectionCode; key: string; label: string; help_text: string
  field_type: CustomFieldType; required: boolean; default: unknown; options: CustomFieldOption[]
  validation: { min?: number; max?: number; min_length?: number; max_length?: number; regex?: string; regex_message?: string }
  sort_order: number; is_active: boolean; show_in_pdf: boolean; version: number
}
/** Definition as it was when a record was saved (so old values stay readable if the field changes). */
export type CustomSchemaEntry = { label: string; type: CustomFieldType; options: CustomFieldOption[]; version: number; show_in_pdf: boolean; section: string }
