import { cn } from '@/lib/utils'
import { EIGHT_D_STATUS, type EightDStatus } from './types'

export function ReportStatus({ status, className }: { status: EightDStatus; className?: string }) {
  const s = EIGHT_D_STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', s.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />{s.label}
    </span>
  )
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Report completion'} className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${percent}%` }} />
    </div>
  )
}
