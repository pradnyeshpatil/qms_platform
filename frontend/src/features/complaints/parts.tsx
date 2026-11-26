import { CalendarClock } from 'lucide-react'
import { dueInfo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Complaint } from '@/lib/types'

/** "2 days overdue" / "Due in 5 days" with urgency colour. */
export function DueLabel({ complaint, className }: { complaint: Pick<Complaint, 'due_date' | 'status_category'>; className?: string }) {
  const info = dueInfo(complaint.due_date, complaint.status_category === 'resolved' || complaint.status_category === 'closed')
  const tone = { overdue: 'text-rose-600 font-medium', soon: 'text-amber-600 font-medium', ok: 'text-slate-600', none: 'text-slate-400' }[info.tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', tone, className)}>
      {info.tone !== 'none' && <CalendarClock className="h-3.5 w-3.5" aria-hidden />}
      {info.label}
    </span>
  )
}

export function Fact({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === undefined || children === null || children === ''
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right', empty ? 'text-slate-300' : 'font-medium text-slate-800')}>{empty ? '—' : children}</dd>
    </div>
  )
}
