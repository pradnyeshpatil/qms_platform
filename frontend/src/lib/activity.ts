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
      return { kind: 'edit', text: e.action.replace(/[._]/g, ' ') }
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
