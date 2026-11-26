import type { ActivityEntry } from './types'

export type ActivityKind = 'create' | 'edit' | 'status' | 'close' | 'reopen' | 'assign' | 'comment' | 'file' | 'delete' | 'export' | 'settings'
export type Described = { kind: ActivityKind; text: string; detail?: string }

type Change = { from?: unknown; to?: unknown }
const asChange = (v: unknown): Change => (v && typeof v === 'object' ? (v as Change) : {})
const str = (v: unknown) => (v === null || v === undefined || v === '' ? 'none' : String(v))

const FIELD_LABEL: Record<string, string> = {
  customer: 'customer', customer_reference_number: 'customer reference', title: 'title', description: 'description',
  product_name: 'product', part_number: 'part number', batch_number: 'batch', quantity_affected: 'quantity affected',
  defect_category: 'defect category', severity: 'severity', source: 'source', reported_date: 'reported date',
  due_date: 'due date', plant: 'plant', department: 'department', closure_comment: 'closure comment',
}
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, ' ')

/** Plain-English sentence for an audit entry. `actor` is shown by the caller. */
export function describeActivity(e: Pick<ActivityEntry, 'action' | 'changes' | 'target_label'>, subject = 'this complaint'): Described {
  const c = e.changes ?? {}
  switch (e.action) {
    case 'complaint.created':
      return { kind: 'create', text: `created ${subject}` }
    case 'complaint.updated': {
      const fields = Object.keys(c)
      if (!fields.length) return { kind: 'edit', text: `edited ${subject}` }
      const parts = fields.map((f) => {
        const ch = asChange(c[f])
        return f === 'description' || f === 'closure_comment' ? `${fieldLabel(f)} updated` : `${fieldLabel(f)}: ${str(ch.from)} → ${str(ch.to)}`
      })
      return { kind: 'edit', text: `changed ${fields.map(fieldLabel).join(', ')}${subject === 'this complaint' ? '' : ` on ${subject}`}`, detail: parts.join(' · ') }
    }
    case 'complaint.status_changed': {
      const s = asChange(c.status)
      return { kind: 'status', text: `moved ${subject === 'this complaint' ? 'the status' : `${subject}’s status`} from ${str(s.from)} to ${str(s.to)}` }
    }
    case 'complaint.closed':
      return { kind: 'close', text: `closed ${subject}`, detail: warningText(c.warnings) }
    case 'complaint.reopened': {
      const s = asChange(c.status)
      return { kind: 'reopen', text: `reopened ${subject} (now ${str(s.to)})` }
    }
    case 'complaint.assigned': {
      const bits: string[] = []
      if (c.owner) {
        const o = asChange(c.owner)
        bits.push(o.to ? `set the owner to ${str(o.to)}` : 'removed the owner')
      }
      if (c.assignees && typeof c.assignees === 'object') {
        const a = c.assignees as { added?: string[]; removed?: string[] }
        if (a.added?.length) bits.push(`added ${a.added.join(', ')}`)
        if (a.removed?.length) bits.push(`removed ${a.removed.join(', ')}`)
      }
      return { kind: 'assign', text: bits.join(' and ') || 'changed the assignment' }
    }
    case 'complaint.deleted':
      return { kind: 'delete', text: `deleted ${subject}` }
    case 'comment.created':
      return { kind: 'comment', text: c.visibility === 'customer_visible' ? 'added a customer-visible comment' : 'added a comment', detail: strOrUndef(c.preview) }
    case 'comment.edited':
      return { kind: 'comment', text: 'edited a comment' }
    case 'comment.deleted':
      return { kind: 'delete', text: 'deleted a comment' }
    case 'attachment.uploaded':
      return { kind: 'file', text: `attached ${str(c.name)}` }
    case 'attachment.deleted':
      return { kind: 'delete', text: `removed the file ${str(c.name)}` }
    case 'complaints.exported':
      return { kind: 'export', text: `exported ${str(c.count)} complaints (${str(c.format)})` }
    case 'complaint_status.created':
      return { kind: 'settings', text: `added the status “${e.target_label}”` }
    case 'complaint_status.updated':
      return { kind: 'settings', text: `updated the status “${e.target_label}”` }
    case 'complaint_status.deleted':
      return { kind: 'settings', text: `deleted the status “${e.target_label}”` }
    default:
      return describeEightD(e) ?? { kind: 'edit', text: e.action.replace(/[._]/g, ' ') }
  }
}

const SECTION_NAME: Record<string, string> = {
  D0: 'D0 Prepare', D1: 'D1 Team', D2: 'D2 Problem', D3: 'D3 Containment', D4: 'D4 Root cause',
  D5: 'D5 Corrective actions', D6: 'D6 Validation', D7: 'D7 Prevention', D8: 'D8 Closure',
}
const sectionName = (v: unknown) => SECTION_NAME[String(v)] ?? String(v ?? 'a section')

/** 8D report and task entries (Phase 3). Returns undefined for anything else. */
function describeEightD(e: Pick<ActivityEntry, 'action' | 'changes' | 'target_label'>): Described | undefined {
  const c = (e.changes ?? {}) as Record<string, unknown>
  switch (e.action) {
    case 'eight_d.created': return { kind: 'create', text: `started 8D report ${e.target_label}` }
    case 'eight_d.updated': return { kind: 'edit', text: 'edited the report details', detail: Object.keys(c).map(fieldLabel).join(', ') }
    case 'eight_d.section_updated': return { kind: 'edit', text: `edited ${sectionName(c.section)}` }
    case 'eight_d.row_added': return { kind: 'create', text: `added an item to ${sectionName(c.section)}` }
    case 'eight_d.row_updated': return { kind: 'edit', text: `edited an item in ${sectionName(c.section)}` }
    case 'eight_d.row_removed': return { kind: 'delete', text: `removed an item from ${sectionName(c.section)}` }
    case 'eight_d.section_completed': return { kind: 'close', text: `completed ${sectionName(c.section)}` }
    case 'eight_d.section_status_changed': return { kind: 'status', text: `changed the status of ${sectionName(c.section)}` }
    case 'eight_d.section_owner_changed': return { kind: 'assign', text: `changed the owner of ${sectionName(c.section)}` }
    case 'eight_d.approval_requested': return { kind: 'status', text: 'sent the report for approval' }
    case 'eight_d.approved': return { kind: 'close', text: 'approved the report', detail: strOrUndef(c.comment) }
    case 'eight_d.rejected': return { kind: 'reopen', text: 'rejected the report', detail: strOrUndef(c.comment) }
    case 'eight_d.submitted': return { kind: 'export', text: `recorded the report as sent to ${str(c.recipient)}` }
    case 'eight_d.closed': return { kind: 'close', text: 'closed the report' }
    case 'eight_d.reopened': return { kind: 'reopen', text: 'reopened the report', detail: strOrUndef(c.reason) }
    case 'eight_d.deleted': return { kind: 'delete', text: 'deleted the draft report' }
    case 'eight_d.task_created': return { kind: 'assign', text: `created a task from ${sectionName(c.section)}`, detail: strOrUndef(c.task) }
    case 'task.created': return { kind: 'create', text: 'created the task' }
    case 'task.updated': return { kind: 'edit', text: 'edited the task' }
    case 'task.reassigned': return { kind: 'assign', text: `reassigned the task to ${str(asChange(c.assignee).to)}` }
    case 'task.completed': return { kind: 'close', text: 'completed the task' }
    case 'task.reopened': return { kind: 'reopen', text: 'reopened the task' }
    case 'task.status_changed': return { kind: 'status', text: `moved the task to ${str(asChange(c.status).to)}` }
    case 'task.deleted': return { kind: 'delete', text: 'deleted the task' }
  }
}

const strOrUndef = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const warningText = (w: unknown) => (Array.isArray(w) && w.length ? `Closed with warnings: ${w.join(', ')}` : undefined)

export const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: 'complaint.created', label: 'Complaint created' },
  { value: 'complaint.updated', label: 'Complaint edited' },
  { value: 'complaint.status_changed', label: 'Status changed' },
  { value: 'complaint.closed', label: 'Complaint closed' },
  { value: 'complaint.reopened', label: 'Complaint reopened' },
  { value: 'complaint.assigned', label: 'Assignment changed' },
  { value: 'complaint.deleted', label: 'Complaint deleted' },
  { value: 'comment.created', label: 'Comment added' },
  { value: 'attachment.uploaded', label: 'File uploaded' },
  { value: 'attachment.deleted', label: 'File removed' },
  { value: 'complaints.exported', label: 'List exported' },
  { value: 'complaint_status.updated', label: 'Status settings changed' },
]
